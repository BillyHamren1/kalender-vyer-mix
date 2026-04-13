// Import bookings from external API - filters out bookings before 2026-01-01
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Resolve the organization_id to use for all INSERTs.
 * Since service_role bypasses RLS and auth.uid() is null,
 * we must set organization_id explicitly.
 */
async function resolveOrganizationId(supabase: any, explicitOrgId?: string): Promise<string> {
  if (!explicitOrgId) {
    throw new Error('organization_id is required. All callers must provide it explicitly to prevent cross-tenant data leakage.');
  }

  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', explicitOrgId)
    .single();

  if (error || !data) {
    throw new Error(`Organization not found: ${explicitOrgId}. Create it first via manage-organization.`);
  }
  return data.id;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BookingData {
  id: string;
  client: string;
  rigdaydate?: string;
  eventdate?: string;
  rigdowndate?: string;
  rig_start_time?: string;
  rig_end_time?: string;
  event_start_time?: string;
  event_end_time?: string;
  rigdown_start_time?: string;
  rigdown_end_time?: string;
  // Full date arrays for multi-day support (calendar level only)
  allRigDates?: string[];
  allEventDates?: string[];
  allRigdownDates?: string[];
  deliveryaddress?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  carry_more_than_10m?: boolean;
  ground_nails_allowed?: boolean;
  exact_time_needed?: boolean;
  exact_time_info?: string;
  internalnotes?: string;
  status?: string;
  booking_number?: string;
  version?: number;
  assigned_project_id?: string;
  assigned_project_name?: string;
  assigned_to_project?: boolean;
  map_drawing_url?: string;
  economics_data?: Record<string, number> | null;
  organization_id?: string;
}

/**
 * Safely parse assigned_to_project field which may be boolean, string, or null
 */
const parseAssignedToProject = (value: any): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    if (lowerValue === 'true' || lowerValue.startsWith('assigned to project')) {
      return true;
    }
    return false;
  }
  return false;
};

/**
 * Helper function to add days to a date string
 */
const addDays = (dateString: string, days: number): string => {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

const normalizeDateOnly = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const asString = String(value).trim();
  if (!asString) return undefined;
  const dateMatch = asString.match(/\d{4}-\d{2}-\d{2}/);
  return dateMatch ? dateMatch[0] : undefined;
};

const normalizeDateArray = (...candidates: unknown[]): string[] => {
  const dates: string[] = [];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const value of candidate) {
        const normalized = normalizeDateOnly(value);
        if (normalized && !dates.includes(normalized)) {
          dates.push(normalized);
        }
      }
      continue;
    }

    const normalized = normalizeDateOnly(candidate);
    if (normalized && !dates.includes(normalized)) {
      dates.push(normalized);
    }
  }

  return dates;
};

const extractTimePart = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const asString = String(value).trim();
  if (!asString) return undefined;

  const hhmmss = asString.match(/(\d{2}:\d{2}:\d{2})/);
  if (hhmmss) return hhmmss[1];

  const hhmm = asString.match(/(\d{2}:\d{2})/);
  if (hhmm) return `${hhmm[1]}:00`;

  return undefined;
};

/**
 * Parse a combined time-range string like "08:00 - 12:00" or "08:00-12:00"
 * into discrete start and end time parts.
 * Returns { start, end } with HH:MM:SS strings, or undefined if unparsable.
 */
const parseTimeRange = (value: unknown): { start: string; end: string } | undefined => {
  if (!value) return undefined;
  const asString = String(value).trim();
  if (!asString) return undefined;

  // Match patterns like "08:00 - 12:00", "08:00-12:00", "08:00 – 12:00"
  const rangeMatch = asString.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!rangeMatch) return undefined;

  const normalizeTime = (t: string): string => {
    const parts = t.split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1] || '00';
    const ss = parts[2] || '00';
    return `${hh}:${mm}:${ss}`;
  };

  return {
    start: normalizeTime(rangeMatch[1]),
    end: normalizeTime(rangeMatch[2]),
  };
};

/**
 * Build a datetime string from a date and an explicit time value.
 * Returns { dateTime, isExplicit } so callers know whether a real
 * booking time was used or a fallback default.
 */
const buildDateTimeFromPartsEx = (
  date: string,
  explicitTime: unknown,
  fallbackTime = '08:00:00'
): { dateTime: string; isExplicit: boolean } => {
  const extracted = extractTimePart(explicitTime);
  const time = extracted || fallbackTime;
  return { dateTime: `${date}T${time}`, isExplicit: !!extracted };
};

/** Legacy wrapper — returns just the datetime string */
const buildDateTimeFromParts = (
  date: string,
  explicitTime: unknown,
  fallbackTime = '08:00:00'
): string => {
  return buildDateTimeFromPartsEx(date, explicitTime, fallbackTime).dateTime;
};

const normalizeDateTimeForBookingField = (
  value: unknown,
  fallbackDate?: string
): string | undefined => {
  if (!value) return undefined;
  const asString = String(value).trim();
  if (!asString) return undefined;

  const datePart = normalizeDateOnly(asString);
  const timePart = extractTimePart(asString);

  if (datePart && timePart) return `${datePart}T${timePart}`;
  if (timePart && fallbackDate) return `${fallbackDate}T${timePart}`;
  return undefined;
};

/**
 * Unified attachment sync — fetches existing URLs once, then processes
 * products[], files_metadata[], and tent_images[] against a SHARED seenUrls set.
 * This prevents duplicates that occurred when the three functions ran sequentially
 * and each fetched existing attachments independently before the others had committed.
 */
async function syncAllAttachments(
  supabase: any,
  bookingId: string,
  products: any[],
  filesMetadata: any[],
  tentImages: any[],
  results: any,
  orgId: string
) {
  // --- 1. Fetch all existing URLs for this booking ONCE ---
  const { data: existingAttachments } = await supabase
    .from('booking_attachments')
    .select('url')
    .eq('booking_id', bookingId);
  
  // Strip query params for dedup comparison to avoid duplicates from cache-busting params
  const stripQueryParams = (url: string) => url.split('?')[0];
  const seenUrls = new Set<string>((existingAttachments || []).map((a: any) => stripQueryParams(a.url)));

  const insertAttachment = async (url: string, fileName: string, fileType: string) => {
    const baseUrl = stripQueryParams(url);
    if (!url || seenUrls.has(baseUrl)) return;
    seenUrls.add(baseUrl);
    const { error } = await supabase
      .from('booking_attachments')
      .insert({ booking_id: bookingId, url, file_name: fileName, file_type: fileType, organization_id: orgId });
    if (error) {
      console.error(`[Attachments] Error inserting "${fileName}" for booking ${bookingId}:`, error.message);
    } else {
      results.attachments_imported++;
      console.log(`[Attachments] Saved "${fileName}" for booking ${bookingId}`);
    }
  };

  // --- 2. files_metadata (new API format) ---
  for (const file of (filesMetadata || [])) {
    const fileUrl: string = file.url || file.public_url;
    const fileName: string = file.name || file.file_name || 'Fil';
    let fileType = 'image/jpeg';
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.png')) fileType = 'image/png';
    else if (lower.endsWith('.webp')) fileType = 'image/webp';
    else if (lower.endsWith('.pdf')) fileType = 'application/pdf';
    else if (lower.endsWith('.gif')) fileType = 'image/gif';
    await insertAttachment(fileUrl, fileName, fileType);
  }

  // --- 4. tent_images (legacy format, supports base64) ---
  for (const tentImage of (tentImages || [])) {
    const tentIndex = tentImage.tent_index ?? '';
    const viewKey   = tentImage.view_key   ?? '';
    const fileName  = (`Tält ${tentIndex} - ${viewKey}`).trim() || 'Tältbild';

    let imgUrl: string | null = tentImage.public_url || null;
    if (!imgUrl && tentImage.content_base64) {
      const storageFileName = `tent-${bookingId}-${tentIndex}-${String(viewKey).replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      imgUrl = await uploadBase64ToStorage(supabase, tentImage.content_base64, `${bookingId}/${storageFileName}`, 'image/jpeg');
      if (!imgUrl) {
        console.error(`[Attachments] Failed to upload base64 tent image for booking ${bookingId}`);
        continue;
      }
    }
    if (!imgUrl) continue;

    let fileType = 'image/jpeg';
    if (imgUrl.includes('.png')) fileType = 'image/png';
    else if (imgUrl.includes('.webp')) fileType = 'image/webp';
    await insertAttachment(imgUrl, fileName, fileType);
  }
}

/**
 * Upload a base64 string to Supabase Storage and return the public URL.
 * Returns null if upload fails.
 */
async function uploadBase64ToStorage(
  supabase: any,
  base64: string,
  filePath: string,
  contentType: string
): Promise<string | null> {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const { error } = await supabase.storage
      .from('map-snapshots')
      .upload(filePath, bytes, { contentType, upsert: true });

    if (error) {
      console.error(`[Storage Upload] Error uploading ${filePath}:`, error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('map-snapshots')
      .getPublicUrl(filePath);

    return urlData?.publicUrl ?? null;
  } catch (err) {
    console.error(`[Storage Upload] Exception uploading ${filePath}:`, err);
    return null;
  }
}

/**
 * Sync warehouse calendar events for a confirmed booking
 * Creates 6 logistics events based on rig/event/rigdown dates
 */
const syncWarehouseEventsForBooking = async (supabase: any, booking: any, orgId: string): Promise<number> => {
  console.log(`[Warehouse] Syncing warehouse events for booking ${booking.id}`);
  
  // NOTE: No delete needed - upsert with onConflict handles idempotency
  // The UNIQUE(booking_id, event_type) constraint prevents duplicates at DB level
  
  const events: any[] = [];
  const clientName = booking.client || 'Okänd kund';
  const deliveryAddress = booking.deliveryaddress || null;
  const bookingNumber = booking.booking_number || null;
  
  // Warehouse event rules based on warehouseCalendarService.ts
  // Packing: 4 days before rig, 08:00-11:00 (3 hours)
  if (booking.rigdaydate) {
    const packingDate = addDays(booking.rigdaydate, -4);
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Packning - ${clientName}`,
      event_type: 'packing',
      start_time: `${packingDate}T08:00:00`,
      end_time: `${packingDate}T11:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    // Delivery: same day as rig, 07:00-09:00
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Utleverans - ${clientName}`,
      event_type: 'delivery',
      start_time: `${booking.rigdaydate}T07:00:00`,
      end_time: `${booking.rigdaydate}T09:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Event: same day as eventdate, 09:00-17:00
  if (booking.eventdate) {
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Event - ${clientName}`,
      event_type: 'event',
      start_time: `${booking.eventdate}T09:00:00`,
      end_time: `${booking.eventdate}T17:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Return delivery, Inventory, Unpacking: for ALL rigdown dates
  const rigdownDates = booking.allRigdownDates && booking.allRigdownDates.length > 0
    ? booking.allRigdownDates : (booking.rigdowndate ? [booking.rigdowndate] : []);
  
  for (const rigdownDate of rigdownDates) {
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Återleverans - ${clientName}`,
      event_type: rigdownDates.length > 1 ? `return_${rigdownDate}` : 'return',
      start_time: `${rigdownDate}T17:00:00`,
      end_time: `${rigdownDate}T19:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: rigdownDate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    const dayAfterRigdown = addDays(rigdownDate, 1);
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Inventering - ${clientName}`,
      event_type: rigdownDates.length > 1 ? `inventory_${rigdownDate}` : 'inventory',
      start_time: `${dayAfterRigdown}T08:00:00`,
      end_time: `${dayAfterRigdown}T10:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: rigdownDate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Upppackning - ${clientName}`,
      event_type: rigdownDates.length > 1 ? `unpacking_${rigdownDate}` : 'unpacking',
      start_time: `${dayAfterRigdown}T10:00:00`,
      end_time: `${dayAfterRigdown}T12:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      organization_id: orgId,
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: rigdownDate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Upsert all warehouse events - uses UNIQUE(booking_id, event_type) to prevent duplicates
  if (events.length > 0) {
    console.log(`[Warehouse] Upserting ${events.length} warehouse events for booking ${booking.id}`);
    const { error: upsertError } = await supabase
      .from('warehouse_calendar_events')
      .upsert(events, { onConflict: 'booking_id,event_type', ignoreDuplicates: false });
    
    if (upsertError) {
      console.error(`[Warehouse] Error upserting events:`, upsertError);
      return 0;
    }
    
    console.log(`[Warehouse] Successfully upserted ${events.length} warehouse events for booking ${booking.id}`);
    return events.length;
  }
  
  return 0;
};

/**
 * Create packing project and tasks for a confirmed booking
 * Creates standard tasks with deadlines based on rig/event/rigdown dates
 */
const createPackingForBooking = async (supabase: any, booking: any, orgId: string): Promise<boolean> => {
  console.log(`[Packing] Checking if packing exists for booking ${booking.id}`);
  
  const clientName = booking.client || 'Okänd kund';
  const eventDate = booking.eventdate ? new Date(booking.eventdate).toLocaleDateString('sv-SE') : '';
  const packingName = eventDate ? `${clientName} - ${eventDate}` : clientName;

  const syncFields = {
    name: packingName,
    client_name: booking.client || null,
    start_date: booking.rigdaydate || null,
    end_date: booking.rigdowndate || null,
    delivery_address: booking.deliveryaddress || null,
    notes: booking.internalnotes || null,
  };

  // Check if packing already exists for this booking
  const { data: existingPacking, error: checkError } = await supabase
    .from('packing_projects')
    .select('id')
    .eq('booking_id', booking.id)
    .limit(1);
  
  if (checkError) {
    console.error(`[Packing] Error checking existing packing:`, checkError);
    return false;
  }
  
  if (existingPacking && existingPacking.length > 0) {
    // Update existing packing with latest booking data
    console.log(`[Packing] Updating existing packing for booking ${booking.id}`);
    await supabase
      .from('packing_projects')
      .update({ ...syncFields, updated_at: new Date().toISOString() })
      .eq('id', existingPacking[0].id);
    return false;
  }
  
  console.log(`[Packing] Creating packing project: ${packingName}`);
  
  // Create packing project with all sync fields
  const { data: newPacking, error: insertError } = await supabase
    .from('packing_projects')
    .insert({
      booking_id: booking.id,
      ...syncFields,
      status: 'planning',
      organization_id: orgId
    })
    .select('id')
    .single();
  
  if (insertError || !newPacking) {
    console.error(`[Packing] Error creating packing project:`, insertError);
    return false;
  }
  
  console.log(`[Packing] Created packing project ${newPacking.id}`);
  
  // Create standard tasks with deadlines
  const tasks: any[] = [];
  let sortOrder = 0;
  
  // Tasks based on rigdaydate
  if (booking.rigdaydate) {
    // Packning: rigdaydate - 4 days
    tasks.push({
      packing_id: newPacking.id,
      title: 'Packning',
      description: 'Packa utrustning för bokningen',
      deadline: addDays(booking.rigdaydate, -4),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: orgId
    });
    
    // Utrustning packad: rigdaydate - 1 day
    tasks.push({
      packing_id: newPacking.id,
      title: 'Utrustning packad',
      description: 'All utrustning packad och redo för transport',
      deadline: addDays(booking.rigdaydate, -1),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: orgId
    });
    
    // Utleverans klarmarkerad: rigdaydate
    tasks.push({
      packing_id: newPacking.id,
      title: 'Utleverans klarmarkerad',
      description: 'Bekräfta att leveransen har gått iväg',
      deadline: booking.rigdaydate,
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: orgId
    });
  }
  
  // Tasks based on rigdowndate
  if (booking.rigdowndate) {
    // Inventering efter event: rigdowndate + 1 day
    tasks.push({
      packing_id: newPacking.id,
      title: 'Inventering efter event',
      description: 'Kontrollera att all utrustning är tillbaka och i gott skick',
      deadline: addDays(booking.rigdowndate, 1),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: orgId
    });
    
    // Upppackning klar: rigdowndate + 2 days
    tasks.push({
      packing_id: newPacking.id,
      title: 'Upppackning klar',
      description: 'All utrustning uppackad och återställd på lagerplats',
      deadline: addDays(booking.rigdowndate, 2),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: orgId
    });
  }
  
  // Insert tasks
  if (tasks.length > 0) {
    console.log(`[Packing] Creating ${tasks.length} tasks for packing ${newPacking.id}`);
    const { error: tasksError } = await supabase
      .from('packing_tasks')
      .insert(tasks);
    
    if (tasksError) {
      console.error(`[Packing] Error creating packing tasks:`, tasksError);
    } else {
      console.log(`[Packing] Successfully created ${tasks.length} tasks`);
    }
  }
  
  return true;
};

interface ProductData {
  booking_id: string;
  organization_id: string;
  name: string;
  quantity: number;
  notes?: string;
  unit_price?: number;
  total_price?: number;
  parent_product_id?: string;
  is_package_component?: boolean;
  parent_package_id?: string;
  sku?: string;
  // Cost fields for budget calculation
  labor_cost?: number;
  material_cost?: number;
  setup_hours?: number;
  external_cost?: number;
  cost_notes?: string;
  // New fields for package component support
  sort_index?: number;
  inventory_item_type_id?: string;
  inventory_package_id?: string;
  assembly_cost?: number;
  handling_cost?: number;
  purchase_cost?: number;
  package_components?: any;
  discount?: number;
  vat_rate?: number;
}

/**
 * Check if a product name indicates it's an accessory/sub-item
 * Accessories typically start with └, ↳, L, or similar prefixes
 */
const isAccessoryProduct = (name: string): boolean => {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.startsWith('└') || 
         trimmed.startsWith('↳') || 
         trimmed.startsWith('L,') || 
         trimmed.startsWith('└,') ||
         trimmed.startsWith('  ↳') ||
         trimmed.startsWith('  └');
};

/**
 * Check if a product is a package component (e.g., tent poles, roof sheets)
 * Package components have is_package_component: true from the external API
 */
const isPackageComponent = (product: any): boolean => {
  return product.is_package_component === true;
};

/**
 * External system IDs are not valid DB foreign keys, but we can use them as
 * *temporary* keys during the import to map parent->child relationships safely.
 */
const getExternalProductId = (product: any): string | null => {
  const candidate = product?.id ?? product?.product_id ?? product?.productId ?? null;
  if (candidate === null || candidate === undefined) return null;
  const s = String(candidate).trim();
  return s.length > 0 ? s : null;
};

interface AttachmentData {
  booking_id: string;
  url: string;
  file_name: string;
  file_type: string;
}

/**
 * Calculate end time by adding hours to a start time string.
 * Uses string manipulation to avoid timezone conversion issues from Date.toISOString().
 */
const getEndTimeForEventType = (startTime: string, eventType: 'rig' | 'event' | 'rigDown'): string => {
  let hoursToAdd: number;
  
  switch (eventType) {
    case 'rig':
      hoursToAdd = 4;
      break;
    case 'event':
      hoursToAdd = 3;
      break;
    case 'rigDown':
      hoursToAdd = 4;
      break;
    default:
      hoursToAdd = 4;
  }
  
  // Parse the start time parts to avoid timezone shifts
  const datePart = startTime.split('T')[0];
  const timePart = startTime.split('T')[1] || '08:00:00';
  const [hh, mm, ss] = timePart.split(':').map(Number);
  
  const totalMinutes = hh * 60 + mm + (hoursToAdd * 60);
  const endHH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const endMM = String(Math.floor(totalMinutes % 60)).padStart(2, '0');
  const endSS = String(ss || 0).padStart(2, '0');
  
  return `${datePart}T${endHH}:${endMM}:${endSS}`;
};

/**
 * Standalone calendar reconciliation — idempotently ensures calendar_events
 * match the booking's current dates & times.  Safe to call on every pass
 * (unchanged, recovery-only, or full update) because it compares desired
 * state against actual state and only touches rows that differ.
 */
async function reconcileCalendarEvents(
  supabase: any,
  bookingData: BookingData,
  organizationId: string,
  results: any,
  existingBooking?: any,
) {
  if (bookingData.status !== 'CONFIRMED') return;

  // 1. Fetch ALL existing calendar events for this booking
  const { data: existingEvents } = await supabase
    .from('calendar_events')
    .select('id, event_type, start_time, end_time, title, booking_number, delivery_address, resource_id, source_date')
    .eq('booking_id', bookingData.id)
    .eq('organization_id', bookingData.organization_id || organizationId);

  console.log(`[Calendar Reconcile] Booking ${bookingData.id}: ${existingEvents?.length || 0} existing events`);

  // 2. Compute the DESIRED state from booking data
  const desiredEvents: Array<{
    event_type: string;
    start_time: string;
    end_time: string;
    title: string;
    booking_number: string | null;
    delivery_address: string | null;
    date: string;
    isExplicitStart: boolean;
  }> = [];

  const rigDates = bookingData.allRigDates && bookingData.allRigDates.length > 0
    ? bookingData.allRigDates : (bookingData.rigdaydate ? [bookingData.rigdaydate] : []);
  const eventDates = bookingData.allEventDates && bookingData.allEventDates.length > 0
    ? bookingData.allEventDates : (bookingData.eventdate ? [bookingData.eventdate] : []);
  const rigdownDates = bookingData.allRigdownDates && bookingData.allRigdownDates.length > 0
    ? bookingData.allRigdownDates : (bookingData.rigdowndate ? [bookingData.rigdowndate] : []);

  const desiredTitle = bookingData.client || 'Bokning';

  for (const date of rigDates) {
    const start = buildDateTimeFromPartsEx(date, bookingData.rig_start_time);
    const end = bookingData.rig_end_time
      ? buildDateTimeFromPartsEx(date, bookingData.rig_end_time)
      : { dateTime: getEndTimeForEventType(start.dateTime, 'rig'), isExplicit: false };
    console.log(`[Calendar Time] rig ${date}: start=${start.dateTime} (${start.isExplicit ? 'EXPLICIT' : 'DEFAULT'}), end=${end.dateTime} (${end.isExplicit ? 'EXPLICIT' : 'DEFAULT'})`);
    desiredEvents.push({
      event_type: 'rig', start_time: start.dateTime, end_time: end.dateTime,
      title: desiredTitle, booking_number: bookingData.booking_number || null,
      delivery_address: bookingData.deliveryaddress || null, date,
      isExplicitStart: start.isExplicit
    });
  }

  // Event days: always 3h blocks on team-11, stacked sequentially (08:00, 11:00, 14:00, ...)
  // Count existing team-11 events for each date to determine stacking offset
  const eventDateSlotCounts = new Map<string, number>();
  if (eventDates.length > 0) {
    // Fetch existing team-11 events for these dates (excluding current booking's events)
    for (const date of eventDates) {
      const { data: existingTeam11 } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('organization_id', bookingData.organization_id || organizationId)
        .eq('resource_id', 'team-11')
        .eq('event_type', 'event')
        .eq('source_date', date)
        .neq('booking_id', bookingData.id);
      eventDateSlotCounts.set(date, (existingTeam11?.length || 0));
    }
  }

  for (const date of eventDates) {
    // Count already-pushed desired events for same date (for multi-event-date bookings)
    const alreadyPushedForDate = desiredEvents.filter(
      e => e.event_type === 'event' && e.date === date
    ).length;
    const slotIndex = (eventDateSlotCounts.get(date) || 0) + alreadyPushedForDate;
    const startHour = 8 + (slotIndex * 3);
    const startDateTime = `${date}T${String(startHour).padStart(2, '0')}:00:00`;
    const endHour = startHour + 3;
    const endDateTime = `${date}T${String(endHour).padStart(2, '0')}:00:00`;
    console.log(`[Calendar Time] event ${date}: slot=${slotIndex}, start=${startDateTime}, end=${endDateTime} (STACKED on team-11)`);
    desiredEvents.push({
      event_type: 'event', start_time: startDateTime, end_time: endDateTime,
      title: desiredTitle, booking_number: bookingData.booking_number || null,
      delivery_address: bookingData.deliveryaddress || null, date,
      isExplicitStart: false
    });
  }

  for (const date of rigdownDates) {
    const start = buildDateTimeFromPartsEx(date, bookingData.rigdown_start_time);
    const end = bookingData.rigdown_end_time
      ? buildDateTimeFromPartsEx(date, bookingData.rigdown_end_time)
      : { dateTime: getEndTimeForEventType(start.dateTime, 'rigDown'), isExplicit: false };
    console.log(`[Calendar Time] rigDown ${date}: start=${start.dateTime} (${start.isExplicit ? 'EXPLICIT' : 'DEFAULT'}), end=${end.dateTime} (${end.isExplicit ? 'EXPLICIT' : 'DEFAULT'})`);
    desiredEvents.push({
      event_type: 'rigDown', start_time: start.dateTime, end_time: end.dateTime,
      title: desiredTitle, booking_number: bookingData.booking_number || null,
      delivery_address: bookingData.deliveryaddress || null, date,
      isExplicitStart: start.isExplicit
    });
  }

  console.log(`[Calendar Reconcile] Booking ${bookingData.id}: ${desiredEvents.length} desired events (rig:${rigDates.length}, event:${eventDates.length}, rigDown:${rigdownDates.length})`);

  // 3. Build lookup of existing events by composite key: event_type|source_date
  const existingByKey = new Map<string, any>();
  for (const evt of (existingEvents || [])) {
    const evtDate = evt.source_date || evt.start_time?.split('T')[0] || '';
    const key = `${evt.event_type}|${evtDate}`;
    if (!existingByKey.has(key)) {
      existingByKey.set(key, evt);
    }
  }

  // Track which existing events are still desired (for stale detection)
  const matchedExistingIds = new Set<string>();

  // 4. Reconcile: create missing, update changed
  for (const desired of desiredEvents) {
    const key = `${desired.event_type}|${desired.date}`;
    const existing = existingByKey.get(key);

    if (existing) {
      matchedExistingIds.add(existing.id);
      const needsUpdate =
        existing.start_time !== desired.start_time ||
        existing.end_time !== desired.end_time ||
        existing.title !== desired.title ||
        existing.booking_number !== desired.booking_number ||
        existing.delivery_address !== desired.delivery_address;

      if (needsUpdate) {
        console.log(`[Calendar Reconcile] UPDATE event ${existing.id} (${desired.event_type} on ${desired.date}): time/title/address changed`);
        const { error: updateErr } = await supabase
          .from('calendar_events')
          .update({
            start_time: desired.start_time,
            end_time: desired.end_time,
            title: desired.title,
            booking_number: desired.booking_number,
            delivery_address: desired.delivery_address,
          })
          .eq('id', existing.id);

        if (updateErr) {
          console.error(`[Calendar Reconcile] Error updating event ${existing.id}:`, updateErr);
        } else {
          results.calendar_events_created++;
        }
      } else {
        console.log(`[Calendar Reconcile] SKIP event ${existing.id} (${desired.event_type} on ${desired.date}): already correct`);
      }
    } else {
      const assignedTeam = await getNextTeamAssignment(
        supabase,
        desired.event_type,
        desired.date,
        bookingData.id,
        bookingData.organization_id || organizationId,
        desired.start_time,
        desired.end_time,
        desired.isExplicitStart
      );

      if (results.team_distribution[assignedTeam] !== undefined) {
        results.team_distribution[assignedTeam]++;
      }

      console.log(`[Calendar Reconcile] CREATE ${desired.event_type} on ${desired.date} → ${assignedTeam}`);

      const { error: insertErr } = await supabase
        .from('calendar_events')
        .insert({
          booking_id: bookingData.id,
          booking_number: desired.booking_number,
          title: desired.title,
          start_time: desired.start_time,
          end_time: desired.end_time,
          event_type: desired.event_type,
          delivery_address: desired.delivery_address,
          resource_id: assignedTeam,
          organization_id: bookingData.organization_id || organizationId,
          source_date: desired.date
        });

      if (insertErr) {
        console.error(`[Calendar Reconcile] Error creating event:`, insertErr);
      } else {
        results.calendar_events_created++;
      }
    }
  }

  // 5. Delete stale events
  const staleEvents = (existingEvents || []).filter(e => !matchedExistingIds.has(e.id));
  if (staleEvents.length > 0) {
    const staleIds = staleEvents.map(e => e.id);
    console.log(`[Calendar Reconcile] DELETE ${staleEvents.length} stale events: ${staleEvents.map(e => `${e.event_type}@${e.start_time?.split('T')[0]}`).join(', ')}`);
    const { error: deleteErr } = await supabase
      .from('calendar_events')
      .delete()
      .in('id', staleIds);

    if (deleteErr) {
      console.error(`[Calendar Reconcile] Error deleting stale events:`, deleteErr);
    }
  }

  console.log(`[Calendar Reconcile] ✅ Booking ${bookingData.id} reconciliation complete`);

  // ── AUDIT LOG ──────────────────────────────
  {
    let auditEventsCreated = 0;
    let auditEventsUpdated = 0;
    let auditEventsDeleted = staleEvents.length;

    for (const desired of desiredEvents) {
      const key = `${desired.event_type}|${desired.date}`;
      const existing = existingByKey.get(key);
      if (!existing) {
        auditEventsCreated++;
      } else if (
        existing.start_time !== desired.start_time ||
        existing.end_time !== desired.end_time ||
        existing.title !== desired.title ||
        existing.booking_number !== desired.booking_number ||
        existing.delivery_address !== desired.delivery_address
      ) {
        auditEventsUpdated++;
      }
    }

    const { data: postReconcileEvents } = await supabase
      .from('calendar_events')
      .select('id, event_type, start_time, end_time, resource_id, source_date')
      .eq('booking_id', bookingData.id)
      .eq('organization_id', bookingData.organization_id || organizationId);

    const actualEventsJson = (postReconcileEvents || []).map((e: any) => ({
      id: e.id, event_type: e.event_type,
      date: e.source_date || e.start_time?.split('T')[0],
      start_time: e.start_time, end_time: e.end_time, resource_id: e.resource_id,
    }));

    const expectedEventsJson = desiredEvents.map(d => ({
      event_type: d.event_type, date: d.date,
      start_time: d.start_time, end_time: d.end_time,
    }));

    const expectedKeys = new Set(desiredEvents.map(d => `${d.event_type}|${d.date}`));
    const actualKeys = new Set(actualEventsJson.map((a: any) => `${a.event_type}|${a.date}`));
    const missingKeys = [...expectedKeys].filter(k => !actualKeys.has(k));
    const extraKeys = [...actualKeys].filter(k => !expectedKeys.has(k));

    const hasMismatch = missingKeys.length > 0 || extraKeys.length > 0;
    let mismatchDetails: string | null = null;
    if (hasMismatch) {
      const parts: string[] = [];
      if (missingKeys.length > 0) parts.push(`missing: ${missingKeys.join(', ')}`);
      if (extraKeys.length > 0) parts.push(`extra: ${extraKeys.join(', ')}`);
      mismatchDetails = parts.join('; ');
      console.error(`[Sync Audit] ⚠️ MISMATCH for ${bookingData.id}: ${mismatchDetails}`);
    }

    supabase.from('sync_audit_log').insert({
      booking_id: bookingData.id,
      organization_id: bookingData.organization_id || organizationId,
      sync_action: existingBooking ? 'updated' : 'imported',
      booking_status: bookingData.status,
      booking_dates: {
        rigdaydate: bookingData.rigdaydate || null,
        eventdate: bookingData.eventdate || null,
        rigdowndate: bookingData.rigdowndate || null,
        rig_start_time: bookingData.rig_start_time || null,
        rig_end_time: bookingData.rig_end_time || null,
        event_start_time: bookingData.event_start_time || null,
        event_end_time: bookingData.event_end_time || null,
        rigdown_start_time: bookingData.rigdown_start_time || null,
        rigdown_end_time: bookingData.rigdown_end_time || null,
      },
      expected_events: expectedEventsJson,
      actual_events: actualEventsJson,
      events_created: auditEventsCreated,
      events_updated: auditEventsUpdated,
      events_deleted: auditEventsDeleted,
      has_mismatch: hasMismatch,
      mismatch_details: mismatchDetails,
    }).then(({ error: auditErr }: any) => {
      if (auditErr) console.error(`[Sync Audit] Error writing audit log:`, auditErr);
    });
  }
}

/**
 * Smart team assignment with round-robin distribution and sequential scheduling.
 * 
 * Rules:
 * 1. EVENT type → always team-11 (Live)
 * 2. Explicit start time → find first team without overlap at that time; if all busy → first team (overlap ok)
 * 3. No explicit start time → round-robin (team with fewest events, lowest number breaks ties);
 *    start time adjusted to after last event on that team for sequential stacking
 */
const getNextTeamAssignment = async (
  supabase: any,
  eventType: string,
  eventDate: string,
  bookingId: string,
  organizationId: string,
  startTime?: string,
  endTime?: string,
  isExplicitStart: boolean = false
): Promise<string> => {
  // EVENT type events always go to team-11 (Live column)
  if (eventType === 'event') {
    console.log(`Assigning EVENT type to team-11 (Live) for booking ${bookingId}`);
    return 'team-11';
  }

  const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];

  try {
    // Fetch all events on same date for these teams
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('resource_id, start_time, end_time')
      .eq('organization_id', organizationId)
      .in('resource_id', teams)
      .gte('start_time', `${eventDate}T00:00:00`)
      .lt('start_time', `${eventDate}T23:59:59`);

    // Build per-team data: event count and latest end time
    const teamEventCounts = new Map<string, number>(teams.map(t => [t, 0]));
    const teamLatestEnd = new Map<string, Date>();

    existingEvents?.forEach((ev: any) => {
      if (!teams.includes(ev.resource_id)) return;
      teamEventCounts.set(ev.resource_id, (teamEventCounts.get(ev.resource_id) || 0) + 1);
      
      const evEnd = new Date(ev.end_time);
      const currentLatest = teamLatestEnd.get(ev.resource_id);
      if (!currentLatest || evEnd > currentLatest) {
        teamLatestEnd.set(ev.resource_id, evEnd);
      }
    });

    if (isExplicitStart && startTime && endTime) {
      // === EXPLICIT START TIME: find team with no overlap at this specific time ===
      const newStart = new Date(startTime);
      const newEnd = new Date(endTime);

      for (const team of teams) {
        let hasOverlap = false;
        existingEvents?.forEach((ev: any) => {
          if (ev.resource_id !== team) return;
          const evStart = new Date(ev.start_time);
          const evEnd = new Date(ev.end_time);
          if (newStart < evEnd && newEnd > evStart) {
            hasOverlap = true;
          }
        });
        if (!hasOverlap) {
          console.log(`[Team Assignment] Explicit time: booking ${bookingId} → ${team} (no overlap at ${startTime})`);
          return team;
        }
      }

      // All teams have overlap at this time — use first team (overlap allowed)
      console.log(`[Team Assignment] Explicit time: all teams busy at ${startTime}, booking ${bookingId} → team-1 (overlap allowed)`);
      return 'team-1';

    } else {
      // === NO EXPLICIT START: round-robin by event count, sequential stacking ===
      // Find minimum event count
      let minCount = Number.MAX_SAFE_INTEGER;
      for (const team of teams) {
        const count = teamEventCounts.get(team) || 0;
        if (count < minCount) minCount = count;
      }

      // Pick first team (lowest number) with minimum count
      let selectedTeam = teams[0];
      for (const team of teams) {
        if ((teamEventCounts.get(team) || 0) === minCount) {
          selectedTeam = team;
          break;
        }
      }

      console.log(`[Team Assignment] Round-robin: booking ${bookingId} → ${selectedTeam} (${minCount} existing events). Counts: ${JSON.stringify(Object.fromEntries(teamEventCounts))}`);
      return selectedTeam;
    }
  } catch (error) {
    console.error('Error calculating team assignment, falling back to team-1:', error);
    return 'team-1';
  }
};

/**
 * Generate a signature for products to detect changes
 */
const getProductsSignature = (products: any[]): string => {
  if (!products || products.length === 0) return '';
  
  const sorted = products
    .map(p => `${(p.name || '').trim()}_${p.quantity || 0}`)
    .sort();
  return sorted.join('|');
};

/**
 * Check if products have changed between external and existing data
 * Returns { changed: boolean, added: string[], removed: string[], updated: string[] }
 */
const checkProductChanges = async (
  supabase: any, 
  bookingId: string, 
  externalProducts: any[]
): Promise<{ 
  changed: boolean; 
  added: string[]; 
  removed: string[]; 
  updated: string[];
  existingProducts: any[];
}> => {
  // Fetch existing products
  const { data: existingProducts, error } = await supabase
    .from('booking_products')
    .select('id, name, quantity')
    .eq('booking_id', bookingId);
  
  if (error) {
    console.error(`Error fetching existing products for ${bookingId}:`, error);
    return { changed: false, added: [], removed: [], updated: [], existingProducts: [] };
  }
  
  const existingMap = new Map((existingProducts || []).map((p: any) => [(p.name || '').trim().toLowerCase(), p]));
  const externalMap = new Map((externalProducts || []).map(p => [(p.name || p.product_name || '').trim().toLowerCase(), p]));
  
  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  
  // Check for added and updated products
  for (const [name, extProduct] of externalMap) {
    const existing = existingMap.get(name);
    if (!existing) {
      added.push(extProduct.name || extProduct.product_name || 'Unknown');
    } else if (existing.quantity !== (extProduct.quantity || 1)) {
      updated.push(`${extProduct.name || extProduct.product_name}: ${existing.quantity} → ${extProduct.quantity || 1}`);
    }
  }
  
  // Check for removed products
  for (const [name, existingProduct] of existingMap) {
    if (!externalMap.has(name)) {
      removed.push(existingProduct.name);
    }
  }
  
  const changed = added.length > 0 || removed.length > 0 || updated.length > 0;
  
  if (changed) {
    console.log(`[Product Changes] Booking ${bookingId}: +${added.length} added, -${removed.length} removed, ~${updated.length} updated`);
  }
  
  return { changed, added, removed, updated, existingProducts: existingProducts || [] };
};

/**
 * Update packing_list_items to reconnect to new product IDs
 * Maps old products to new products by name and preserves packing status
 */
const reconnectPackingListItems = async (
  supabase: any,
  packingId: string,
  oldProducts: any[],
  newProducts: any[]
): Promise<{ reconnected: number; orphaned: number }> => {
  console.log(`[Packing Reconnect] Reconnecting packing list items for packing ${packingId}`);
  
  // Get existing packing_list_items
  const { data: packingItems, error: fetchError } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id, quantity_packed, packed_by, packed_at, verified_by, verified_at')
    .eq('packing_id', packingId);
  
  if (fetchError || !packingItems || packingItems.length === 0) {
    console.log(`[Packing Reconnect] No packing items found for packing ${packingId}`);
    return { reconnected: 0, orphaned: 0 };
  }
  
  // Build maps: old product ID -> name, new product name -> ID
  const oldIdToName = new Map(oldProducts.map(p => [p.id, (p.name || '').trim().toLowerCase()]));
  const newNameToId = new Map(newProducts.map(p => [(p.name || '').trim().toLowerCase(), p.id]));
  
  let reconnected = 0;
  let orphaned = 0;
  
  for (const item of packingItems) {
    const oldName = oldIdToName.get(item.booking_product_id);
    
    if (!oldName) {
      // Old product not found - orphaned
      orphaned++;
      console.log(`[Packing Reconnect] Orphaned item ${item.id} - old product ${item.booking_product_id} not found`);
      continue;
    }
    
    const newProductId = newNameToId.get(oldName);
    
    if (newProductId) {
      // Update the packing_list_item to point to new product ID
      const { error: updateError } = await supabase
        .from('packing_list_items')
        .update({ booking_product_id: newProductId })
        .eq('id', item.id);
      
      if (updateError) {
        console.error(`[Packing Reconnect] Error updating item ${item.id}:`, updateError);
        orphaned++;
      } else {
        reconnected++;
        console.log(`[Packing Reconnect] Reconnected item ${item.id}: ${item.booking_product_id} -> ${newProductId}`);
      }
    } else {
      // Product was removed - delete the packing_list_item
      const { error: deleteError } = await supabase
        .from('packing_list_items')
        .delete()
        .eq('id', item.id);
      
      if (deleteError) {
        console.error(`[Packing Reconnect] Error deleting orphaned item ${item.id}:`, deleteError);
      }
      orphaned++;
      console.log(`[Packing Reconnect] Removed orphaned item ${item.id} - product "${oldName}" no longer exists`);
    }
  }
  
  console.log(`[Packing Reconnect] Completed: ${reconnected} reconnected, ${orphaned} orphaned/removed`);
  return { reconnected, orphaned };
};

/**
 * Check if booking data has meaningfully changed
 */
const hasBookingChanged = (externalBooking: any, existingBooking: any): boolean => {
  const fields = [
    'client', 'rigdaydate', 'eventdate', 'rigdowndate', 'deliveryaddress',
    'delivery_city', 'delivery_postal_code', 'status', 'booking_number',
    'rig_start_time', 'rig_end_time', 'event_start_time', 'event_end_time',
    'rigdown_start_time', 'rigdown_end_time'
  ];
  
  for (const field of fields) {
    const external = externalBooking[field] || '';
    const existing = existingBooking[field] || '';
    if (external !== existing) {
      console.log(`Field ${field} changed: "${existing}" -> "${external}"`);
      return true;
    }
  }

  // Detect when economics_data arrives from external but is missing in DB
  if (externalBooking.economics_data && !existingBooking.economics_data) {
    console.log(`economics_data missing in DB but present in external API - marking as changed`);
    return true;
  }
  
  return false;
};

/**
 * Expand package_components JSONB into individual booking_product rows.
 * Reads parents with package_components from the DB and creates component rows
 * for any components not already expanded.
 */
const expandPackageComponents = async (
  supabase: any,
  bookingId: string,
  orgId?: string
): Promise<number> => {
  const normalizeComponentName = (value: string | null | undefined) =>
    (value || '').replace(/^\s*--\s*/, '').trim().toLowerCase();

  // Fetch all products for this booking
  const { data: products, error } = await supabase
    .from('booking_products')
    .select('id, name, quantity, package_components, sort_index, inventory_package_id, is_package_component, parent_product_id')
    .eq('booking_id', bookingId);

  if (error || !products || products.length === 0) return 0;

  // Find parents that have package_components JSONB
  const parentsWithComponents = products.filter(
    (p: any) => p.package_components && Array.isArray(p.package_components) && p.package_components.length > 0 && p.is_package_component !== true
  );

  if (parentsWithComponents.length === 0) return 0;

  let totalExpanded = 0;

  for (const parent of parentsWithComponents) {
    const parentId = parent.id;
    const parentInventoryPackageId = parent.inventory_package_id || null;
    const parentSortIndex = parent.sort_index ?? 0;
    const parentQuantity = Math.max(Number(parent.quantity) || 1, 1);

    const existingComponentsForParent = new Map(
      products
        .filter((p: any) => p.is_package_component === true && p.parent_product_id === parentId)
        .map((p: any) => [normalizeComponentName(p.name), p])
    );

    console.log(`[Package Expand] Reconciling ${parent.package_components.length} components for parent "${parent.name}" (ID: ${parentId}, qty: ${parentQuantity})`);

    for (let i = 0; i < parent.package_components.length; i++) {
      const comp = parent.package_components[i];
      const componentName = comp.name || 'Okänd komponent';
      const componentKey = normalizeComponentName(componentName);
      const componentSortIndex = parentSortIndex + (i + 1) * 0.001;
      const desiredQuantity = (Number(comp.quantity) || 1) * parentQuantity;
      const existingComponent = existingComponentsForParent.get(componentKey);

      const componentData: ProductData = {
        booking_id: bookingId,
        organization_id: orgId || '',
        name: `  -- ${componentName}`,
        quantity: desiredQuantity,
        unit_price: 0,
        total_price: 0,
        parent_product_id: parentId,
        is_package_component: true,
        parent_package_id: parentInventoryPackageId,
        sku: comp.sku || null,
        labor_cost: 0,
        material_cost: 0,
        setup_hours: 0,
        external_cost: 0,
        sort_index: componentSortIndex,
        inventory_item_type_id: comp.item_type_id || null,
        inventory_package_id: parentInventoryPackageId,
        assembly_cost: 0,
        handling_cost: 0,
        purchase_cost: 0,
        discount: 0,
        vat_rate: 0,
      };

      if (existingComponent) {
        if (
          Number(existingComponent.quantity) !== desiredQuantity ||
          existingComponent.parent_product_id !== parentId
        ) {
          const { error: updateError } = await supabase
            .from('booking_products')
            .update({
              quantity: desiredQuantity,
              parent_product_id: parentId,
              parent_package_id: parentInventoryPackageId,
              inventory_package_id: parentInventoryPackageId,
              sort_index: componentSortIndex,
            })
            .eq('id', existingComponent.id);

          if (updateError) {
            console.error(`[Package Expand] Error updating component "${componentName}":`, updateError);
          } else {
            totalExpanded++;
            console.log(`[Package Expand] Updated component "${componentName}" to qty ${desiredQuantity} for parent "${parent.name}"`);
          }
        }

        continue;
      }

      const { error: compError } = await supabase
        .from('booking_products')
        .insert(componentData);

      if (compError) {
        console.error(`[Package Expand] Error inserting component "${componentName}":`, compError);
      } else {
        totalExpanded++;
        console.log(`[Package Expand] Inserted component "${componentName}" (qty: ${desiredQuantity}) for parent "${parent.name}"`);
      }
    }
  }

  return totalExpanded;
};

/**
 * Full sync packing list items to exactly match booking_products.
 * - Add items for new products
 * - Remove items for deleted products
 * - Update quantity_to_pack for changed products
 */
const syncPackingListAfterExpansion = async (
  supabase: any,
  bookingId: string,
  orgId: string
): Promise<number> => {
  const { data: packingProject } = await supabase
    .from('packing_projects')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (!packingProject) {
    console.log(`[Packing Sync] No packing project found for booking ${bookingId}`);
    return 0;
  }

  const packingId = packingProject.id;

  const { data: allProducts } = await supabase
    .from('booking_products')
    .select('id, name, quantity')
    .eq('booking_id', bookingId);

  if (!allProducts || allProducts.length === 0) {
    // No products → remove all packing list items
    const { data: remaining } = await supabase
      .from('packing_list_items')
      .select('id')
      .eq('packing_id', packingId);
    if (remaining && remaining.length > 0) {
      await supabase.from('packing_list_items').delete().eq('packing_id', packingId);
      console.log(`[Packing Sync] Removed all ${remaining.length} packing list items (no products left)`);
      return remaining.length;
    }
    return 0;
  }

  const { data: existingItems } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id, quantity_to_pack')
    .eq('packing_id', packingId);

  const productMap = new Map(allProducts.map((p: any) => [p.id, p]));
  const existingByProductId = new Map((existingItems || []).map((i: any) => [i.booking_product_id, i]));

  let changes = 0;

  // 1. Add missing items
  const missingProducts = allProducts.filter((p: any) => !existingByProductId.has(p.id));
  if (missingProducts.length > 0) {
    console.log(`[Packing Sync] Creating ${missingProducts.length} new packing list items`);
    const newItems = missingProducts.map((p: any) => ({
      packing_id: packingId,
      booking_product_id: p.id,
      quantity_to_pack: p.quantity || 1,
      quantity_packed: 0,
      organization_id: orgId
    }));

    const { error: insertError } = await supabase.from('packing_list_items').insert(newItems);
    if (insertError) {
      console.error(`[Packing Sync] Error creating packing list items:`, insertError);
    } else {
      changes += missingProducts.length;
    }
  }

  // 2. Remove items for deleted products
  const orphanedItems = (existingItems || []).filter((i: any) => !productMap.has(i.booking_product_id));
  if (orphanedItems.length > 0) {
    const orphanedIds = orphanedItems.map((i: any) => i.id);
    console.log(`[Packing Sync] Removing ${orphanedItems.length} packing list items (products deleted)`);
    const { error: deleteError } = await supabase.from('packing_list_items').delete().in('id', orphanedIds);
    if (!deleteError) changes += orphanedItems.length;
  }

  // 3. Update quantity_to_pack where product quantity changed
  for (const [productId, item] of existingByProductId as any) {
    const product = productMap.get(productId);
    if (product && (product as any).quantity !== item.quantity_to_pack) {
      await supabase.from('packing_list_items').update({ quantity_to_pack: (product as any).quantity }).eq('id', item.id);
      changes++;
    }
  }

  if (changes > 0) {
    console.log(`[Packing Sync] Completed: ${changes} total changes for booking ${bookingId}`);
  }
  return changes;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json();

    const {
      quiet = false, 
      syncMode = 'incremental',
      historicalMode = false,
      forceHistoricalImport = false,
      startDate,
      endDate,
      booking_id: singleBookingId = null,
      event_type: webhookEventType = null,
      localOnly = false,
    } = body;

    const importStartedAt = new Date().toISOString();

    const normalizedSingleBookingId = typeof singleBookingId === 'string'
      ? singleBookingId.trim()
      : (singleBookingId ? String(singleBookingId) : null);

    // Resolve organization_id for all INSERTs (service_role bypasses RLS, so auth.uid() is null)
    // Accept explicit organization_id from payload (sent by Hub/receive-booking)
    const explicitOrgId = body?.organization_id;
    const organizationId = await resolveOrganizationId(supabase, explicitOrgId);

    const isHistoricalImport = historicalMode || forceHistoricalImport;
    const isSingleBookingRefresh = !!normalizedSingleBookingId;

    // ── Structured pipeline log ──────────────────────────────────────────
    console.log('[import-bookings] Pipeline started', JSON.stringify({
      import_started: importStartedAt,
      booking_id: normalizedSingleBookingId,
      organization_id: organizationId,
      event_type_hint: webhookEventType,
      sync_mode: syncMode,
      historical: isHistoricalImport,
    }))

    // Get API key from secrets
    const importApiKey = Deno.env.get('IMPORT_API_KEY')
    if (!importApiKey) {
      throw new Error('IMPORT_API_KEY not configured')
    }

    // Get the last sync timestamp for incremental sync (but not for historical)
    let lastSyncTimestamp = null;
    if (syncMode === 'incremental' && !isHistoricalImport) {
      const { data: syncState } = await supabase
        .from('sync_state')
        .select('last_sync_timestamp')
        .eq('sync_type', 'booking_import')
        .single()
      
      lastSyncTimestamp = syncState?.last_sync_timestamp;
      console.log(`Last sync timestamp: ${lastSyncTimestamp}`);
    } else if (isHistoricalImport) {
      console.log('HISTORICAL MODE: Ignoring last sync timestamp, will import all bookings');
    }

    // Update sync state to "in_progress" using UPSERT to avoid constraint violations
    const currentTimestamp = new Date().toISOString()
    const { error: syncStateError } = await supabase
      .from('sync_state')
      .upsert({
        sync_type: 'booking_import',
        organization_id: organizationId,
        last_sync_status: 'in_progress',
        last_sync_mode: syncMode,
        metadata: { 
          started_at: currentTimestamp,
          sync_mode: syncMode,
          filters: { startDate, endDate },
          historical_mode: isHistoricalImport
        },
        updated_at: currentTimestamp
      }, { onConflict: 'sync_type' })

    if (syncStateError) {
      console.error('Error updating sync state:', syncStateError)
    }

    // ── LOCAL-ONLY MODE ─────────────────────────────────────────────────
    // When localOnly=true and this is a single-booking refresh, skip the
    // external API entirely and jump straight to the local-data fallback.
    // This is used after local date edits (e.g. large-project schedule)
    // to prevent the external API from overwriting locally-saved dates.
    if (localOnly && isSingleBookingRefresh && normalizedSingleBookingId) {
      console.log(`[LocalOnly] Skipping external API for ${normalizedSingleBookingId}, reconciling from local DB`);
      const { data: localBooking, error: localErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', normalizedSingleBookingId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (localErr) {
        console.error(`[LocalOnly] Error fetching local booking:`, localErr.message);
        return new Response(JSON.stringify({ error: `Local booking fetch failed: ${localErr.message}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
        });
      }

      if (localBooking) {
        const fallbackResults = {
          calendar_events_created: 0,
          team_distribution: { 'team-1': 0, 'team-2': 0, 'team-3': 0, 'team-4': 0, 'team-5': 0, 'team-11': 0 },
        };
        const localBookingData: BookingData = {
          id: localBooking.id,
          client: localBooking.client,
          rigdaydate: localBooking.rigdaydate,
          eventdate: localBooking.eventdate,
          rigdowndate: localBooking.rigdowndate,
          rig_start_time: localBooking.rig_start_time,
          rig_end_time: localBooking.rig_end_time,
          event_start_time: localBooking.event_start_time,
          event_end_time: localBooking.event_end_time,
          rigdown_start_time: localBooking.rigdown_start_time,
          rigdown_end_time: localBooking.rigdown_end_time,
          deliveryaddress: localBooking.deliveryaddress,
          status: localBooking.status,
          booking_number: localBooking.booking_number,
          organization_id: localBooking.organization_id,
        };
        await reconcileCalendarEvents(supabase, localBookingData, organizationId, fallbackResults, localBooking);
        console.log(`[LocalOnly] Reconciliation complete. Events created/updated: ${fallbackResults.calendar_events_created}`);
        return new Response(JSON.stringify({
          success: true,
          results: {
            total: 1, imported: 0, failed: 0,
            calendar_events_created: fallbackResults.calendar_events_created,
            local_only: true,
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // No local booking found — fall through to normal flow
      console.log(`[LocalOnly] No local booking found for ${normalizedSingleBookingId}, falling through to external API`);
    }

    // Build API URL - always include organization_id
    const apiParams = new URLSearchParams();
    apiParams.append('organization_id', organizationId);
    
    if (isSingleBookingRefresh && normalizedSingleBookingId) {
      apiParams.append('booking_id', normalizedSingleBookingId);
      console.log(`Single booking refresh mode: fetching booking ${normalizedSingleBookingId}`);
    } else if (syncMode === 'incremental' && lastSyncTimestamp && !isHistoricalImport) {
      const sinceDate = new Date(lastSyncTimestamp).toISOString();
      apiParams.append('since', sinceDate);
      console.log(`Fetching bookings modified since: ${sinceDate}`);
    } else if (isHistoricalImport && (startDate || endDate)) {
      if (startDate) apiParams.append('start_date', startDate);
      if (endDate) apiParams.append('end_date', endDate);
      console.log(`Historical import with date range: ${startDate || 'beginning'} to ${endDate || 'end'}`);
    }
    
    const apiUrl = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?${apiParams.toString()}`;

    // Fetch bookings from export-bookings function with timeout and retry
    // Single-booking refresh: use fewer retries & longer timeout to stay within edge-function wall-clock limit
    const maxRetries = isSingleBookingRefresh ? 1 : 3;
    const perAttemptTimeout = isSingleBookingRefresh ? 45000 : 25000;
    const fetchWithRetry = async (url: string, options: RequestInit, retries = maxRetries): Promise<Response> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeout);
          const resp = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          // Also retry on 5xx server errors from external API
          if (resp.status >= 500 && attempt < retries) {
            const bodyText = await resp.text();
            console.error(`Fetch attempt ${attempt + 1} got ${resp.status}, retrying... Body: ${bodyText.substring(0, 200)}`);
            await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); // exponential backoff: 3s, 6s, 9s
            continue;
          }
          return resp;
        } catch (err) {
          console.error(`Fetch attempt ${attempt + 1} failed:`, err);
          if (attempt === retries) throw err;
          // Wait before retry with exponential backoff
          await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        }
      }
      throw new Error('All fetch attempts failed');
    };

    const requestHeaders = {
      'Authorization': `Bearer ${importApiKey}`,
      'x-api-key': importApiKey,
      'Content-Type': 'application/json'
    };

    const fetchExternalData = async (url: string) => {
      const externalResponse = await fetchWithRetry(url, { headers: requestHeaders });

      if (!externalResponse.ok) {
        let errorDetails = '';
        try {
          const errorBody = await externalResponse.text();
          errorDetails = errorBody.substring(0, 500);
          console.error(`External API error response body: ${errorDetails}`);
        } catch {
          console.error('Could not read external API error response body');
        }
        throw new Error(`External API error: ${externalResponse.status}${errorDetails ? ` - ${errorDetails}` : ''}`)
      }

      const payload = await externalResponse.json();
      if (!payload?.data || !Array.isArray(payload.data)) {
        throw new Error('Invalid external API response format - expected data array')
      }
      return payload;
    };

    let externalData = await fetchExternalData(apiUrl);

    // For booking-specific syncs: poll using booking_id (never timestamp-only) before giving up.
    if (isSingleBookingRefresh && normalizedSingleBookingId && externalData.data.length === 0) {
      const bookingPollAttempts = 3;
      for (let attempt = 1; attempt <= bookingPollAttempts; attempt++) {
        const delayMs = 1500 * attempt;
        console.log(`[Single booking poll] No data yet for ${normalizedSingleBookingId}. Retrying with booking_id in ${delayMs}ms (attempt ${attempt}/${bookingPollAttempts})`);
        await new Promise((r) => setTimeout(r, delayMs));

        externalData = await fetchExternalData(apiUrl);
        if (externalData.data.length > 0) {
          console.log(`[Single booking poll] Found booking ${normalizedSingleBookingId} on attempt ${attempt}`);
          break;
        }
      }
    }

    console.log(`Fetched ${externalData.data.length} bookings from external API`)

    // ── LOCAL-DATA FALLBACK for single-booking refresh ────────────────────
    // When the external API returns 0 bookings for a webhook-triggered sync,
    // fall back to local data so calendar reconciliation still runs.
    if (isSingleBookingRefresh && normalizedSingleBookingId && externalData.data.length === 0) {
      console.log(`[Local Fallback] External API returned 0 for ${normalizedSingleBookingId}, checking local bookings table`);
      const { data: localBooking, error: localErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', normalizedSingleBookingId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (localErr) {
        console.error(`[Local Fallback] Error fetching local booking:`, localErr.message);
      } else if (localBooking && localBooking.status === 'CONFIRMED') {
        console.log(`[Local Fallback] Found local CONFIRMED booking ${normalizedSingleBookingId}, running calendar reconciliation from local data`);

        // Build a minimal results object for reconciliation
        const fallbackResults = {
          calendar_events_created: 0,
          team_distribution: { 'team-1': 0, 'team-2': 0, 'team-3': 0, 'team-4': 0, 'team-5': 0, 'team-11': 0 },
        };

        const localBookingData: BookingData = {
          id: localBooking.id,
          client: localBooking.client,
          rigdaydate: localBooking.rigdaydate,
          eventdate: localBooking.eventdate,
          rigdowndate: localBooking.rigdowndate,
          rig_start_time: localBooking.rig_start_time,
          rig_end_time: localBooking.rig_end_time,
          event_start_time: localBooking.event_start_time,
          event_end_time: localBooking.event_end_time,
          rigdown_start_time: localBooking.rigdown_start_time,
          rigdown_end_time: localBooking.rigdown_end_time,
          deliveryaddress: localBooking.deliveryaddress,
          status: localBooking.status,
          booking_number: localBooking.booking_number,
          organization_id: localBooking.organization_id,
        };

        await reconcileCalendarEvents(supabase, localBookingData, organizationId, fallbackResults, localBooking);
        console.log(`[Local Fallback] Reconciliation complete. Events created/updated: ${fallbackResults.calendar_events_created}`);

        return new Response(
          JSON.stringify({
            success: true,
            results: {
              total: 1,
              imported: 0,
              failed: 0,
              calendar_events_created: fallbackResults.calendar_events_created,
              warehouse_events_created: 0,
              new_bookings: [],
              updated_bookings: [],
              unchanged_bookings_skipped: [],
              errors: [],
              sync_mode: 'local_fallback',
              fallback_reason: 'external_api_returned_0',
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } else {
        console.log(`[Local Fallback] Local booking ${normalizedSingleBookingId} not found or not CONFIRMED (status: ${localBooking?.status || 'NOT_FOUND'})`);
      }
    }

    const results = {
      total: 0,
      imported: 0,
      failed: 0,
      calendar_events_created: 0,
      warehouse_events_created: 0,
      packing_projects_created: 0,
      products_imported: 0,
      attachments_imported: 0,
      new_bookings: [] as string[],
      updated_bookings: [] as string[],
      status_changed_bookings: [] as string[],
      cancelled_bookings_skipped: [] as string[],
      duplicates_skipped: [] as string[],
      unchanged_bookings_skipped: [] as string[],
      products_updated_bookings: [] as string[],
      product_changes: [] as { bookingId: string; added: string[]; removed: string[]; updated: string[] }[],
      errors: [] as { booking_id: string; error: string }[],
      sync_mode: isHistoricalImport ? 'historical' : syncMode,
      team_distribution: {
        'team-1': 0,
        'team-2': 0,
        'team-3': 0,
        'team-4': 0,
        'team-5': 0,
        'team-11': 0
      }
    }

    // Get existing bookings for comparison — ONLY within current tenant
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, status, version, booking_number, client, rigdaydate, eventdate, rigdowndate, deliveryaddress, delivery_city, delivery_postal_code, organization_id')
      .eq('organization_id', organizationId)
    const existingBookingMap = new Map(existingBookings?.map(b => [b.id, b]) || [])
    const existingBookingNumberMap = new Map()
    
    // Build booking number map
    existingBookings?.forEach(booking => {
      if (booking.booking_number && booking.booking_number.trim() !== '') {
        existingBookingNumberMap.set(booking.booking_number.trim(), booking)
      }
    })

    console.log(`Found ${existingBookings?.length || 0} existing bookings in database`)

    // Helper to check if a booking has any dates >= 2026-01-01
    // This prevents syncing old/historical bookings back into the system
    const CUTOFF_DATE = new Date('2026-01-01');
    CUTOFF_DATE.setHours(0, 0, 0, 0);
    
    const hasFutureDates = (booking: any): boolean => {
      // External API sends dates as arrays: rig_up_dates, event_dates, rig_down_dates
      // Also check legacy field names (rigdaydate, eventdate, rigdowndate) for safety
      const allDates: string[] = [];
      
      // Array format from external API
      if (Array.isArray(booking.rig_up_dates)) allDates.push(...booking.rig_up_dates);
      if (Array.isArray(booking.rig_dates)) allDates.push(...booking.rig_dates);
      if (Array.isArray(booking.event_dates)) allDates.push(...booking.event_dates);
      if (Array.isArray(booking.rig_down_dates)) allDates.push(...booking.rig_down_dates);
      
      // Legacy single-value field names (fallback)
      if (booking.rigdaydate) allDates.push(booking.rigdaydate);
      if (booking.rig_up_date) allDates.push(booking.rig_up_date);
      if (booking.rig_date) allDates.push(booking.rig_date);
      if (booking.eventdate) allDates.push(booking.eventdate);
      if (booking.event_date) allDates.push(booking.event_date);
      if (booking.rigdowndate) allDates.push(booking.rigdowndate);
      if (booking.rig_down_date) allDates.push(booking.rig_down_date);
      
      const validDates = allDates.filter(Boolean);
      if (validDates.length === 0) {
        console.log(`[DateFilter] Booking has NO dates at all - blocking import`);
        return false; // No dates = block import (old bookings without dates)
      }
      
      return validDates.some(dateStr => {
        const date = new Date(dateStr);
        return date >= CUTOFF_DATE;
      });
    };

    for (const externalBooking of externalData.data) {
      // Skip bookings with only past dates (unless historical mode)
      if (!isHistoricalImport && !hasFutureDates(externalBooking)) {
        const allBookingDates: string[] = [];
        if (Array.isArray(externalBooking.rig_up_dates)) allBookingDates.push(...externalBooking.rig_up_dates);
        if (Array.isArray(externalBooking.rig_dates)) allBookingDates.push(...externalBooking.rig_dates);
        if (Array.isArray(externalBooking.event_dates)) allBookingDates.push(...externalBooking.event_dates);
        if (Array.isArray(externalBooking.rig_down_dates)) allBookingDates.push(...externalBooking.rig_down_dates);
        if (externalBooking.rigdaydate) allBookingDates.push(externalBooking.rigdaydate);
        if (externalBooking.rig_up_date) allBookingDates.push(externalBooking.rig_up_date);
        if (externalBooking.rig_date) allBookingDates.push(externalBooking.rig_date);
        if (externalBooking.eventdate) allBookingDates.push(externalBooking.eventdate);
        if (externalBooking.event_date) allBookingDates.push(externalBooking.event_date);
        if (externalBooking.rigdowndate) allBookingDates.push(externalBooking.rigdowndate);
        if (externalBooking.rig_down_date) allBookingDates.push(externalBooking.rig_down_date);
        const latestDate = allBookingDates.filter(Boolean).sort().pop() || 'no dates';
        console.log(`SKIPPING OLD BOOKING ${externalBooking.id} (${externalBooking.client}) - latest date: ${latestDate}`);
        continue;
      }

      // Variables for packing list reconnection (must be declared here for scope)
      let needsPackingReconnection = false;
      let packingIdForReconnection: string | null = null;
      let oldProductsForReconnection: any[] = [];
      let needsProductUpdate = false;
      let oldProducts: any[] | null = null;
      const seenExistingIds = new Set<string>();
      let productChanges: { added: string[]; removed: string[]; updated: string[]; existingProducts: any[] } = { added: [], removed: [], updated: [], existingProducts: [] };
      
      try {
        results.total++

// Normalize status for consistent comparison
        const normalizeStatus = (status: string | null | undefined): string => {
          const s = (status || 'PENDING').toString().trim().toUpperCase();
          if (s === 'BEKRÄFTAD' || s === 'CONFIRMED') return 'CONFIRMED';
          if (s === 'AVBOKAD' || s === 'CANCELLED') return 'CANCELLED';
          return s;
        };

        const bookingStatus = normalizeStatus(externalBooking.status);

        // Check for existing booking FIRST (before deciding to skip CANCELLED)
        const existingById = existingBookingMap.get(externalBooking.id)
        let existingByNumber = null
        
        if (externalBooking.booking_number && externalBooking.booking_number.trim() !== '') {
          existingByNumber = existingBookingNumberMap.get(externalBooking.booking_number.trim())
        }

        const existingBooking = existingById || existingByNumber

        if (existingBooking && !existingById && existingByNumber) {
          console.log(`DUPLICATE DETECTED: Booking number ${externalBooking.booking_number} already exists with different ID. Skipping import of ${externalBooking.id}`)
          results.duplicates_skipped.push(externalBooking.id)
          continue
        }

        // Handle CANCELLED bookings - process if exists locally, skip if new
        if (bookingStatus === 'CANCELLED' && !isHistoricalImport) {
          if (existingBooking) {
            // Existing booking is now CANCELLED - we need to update and remove calendar events
            console.log(`CANCELLED booking ${externalBooking.id} exists locally → updating status and removing calendar events`)
            
            // Update booking status to CANCELLED
            const { error: updateError } = await supabase
              .from('bookings')
              .update({
                status: 'CANCELLED',
                version: (existingBooking.version || 1) + 1,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingBooking.id)
            
            if (updateError) {
              console.error(`Error updating CANCELLED booking:`, updateError)
              results.errors.push({ booking_id: existingBooking.id, error: updateError.message })
              results.failed++
            } else {
              // Remove calendar events for this booking
              const { error: deleteCalError } = await supabase
                .from('calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id)
              
              if (deleteCalError) {
                console.error(`Error removing calendar events for CANCELLED booking:`, deleteCalError)
              } else {
                console.log(`Removed calendar events for CANCELLED booking ${existingBooking.id}`)
              }
              
              // Remove warehouse calendar events
              const { error: deleteWhError } = await supabase
                .from('warehouse_calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id)
              
              if (deleteWhError) {
                console.error(`Error removing warehouse events for CANCELLED booking:`, deleteWhError)
              } else {
                console.log(`Removed warehouse events for CANCELLED booking ${existingBooking.id}`)
              }
              
              // Handle linked project - set status to 'completed' (not 'cancelled' which is invalid)
              const { error: projectUpdateError } = await supabase
                .from('projects')
                .update({ 
                  status: 'completed',
                  updated_at: new Date().toISOString()
                })
                .eq('booking_id', existingBooking.id);
              
              if (projectUpdateError) {
                console.error(`Error updating project status to completed for CANCELLED booking:`, projectUpdateError);
              } else {
                console.log(`Updated projects for CANCELLED booking ${existingBooking.id} to completed`);
              }

              // Also complete linked jobs (small projects)
              const { error: jobUpdateError } = await supabase
                .from('jobs')
                .update({ 
                  status: 'completed',
                  updated_at: new Date().toISOString()
                })
                .eq('booking_id', existingBooking.id);
              
              if (jobUpdateError) {
                console.error(`Error updating jobs status to completed for CANCELLED booking:`, jobUpdateError);
              } else {
                console.log(`Updated jobs for CANCELLED booking ${existingBooking.id} to completed`);
              }
              
              // Remove packing projects for cancelled bookings
              const { error: deletePackingError } = await supabase
                .from('packing_projects')
                .delete()
                .eq('booking_id', existingBooking.id)
              
              if (deletePackingError) {
                console.error(`Error removing packing project for CANCELLED booking:`, deletePackingError)
              } else {
                console.log(`Removed packing project for CANCELLED booking ${existingBooking.id}`)
              }
              
              // Remove booking products for cancelled bookings
              const { error: deleteProductsError } = await supabase
                .from('booking_products')
                .delete()
                .eq('booking_id', existingBooking.id)
              
              if (deleteProductsError) {
                console.error(`Error removing booking products for CANCELLED booking:`, deleteProductsError)
              } else {
                console.log(`Removed booking products for CANCELLED booking ${existingBooking.id}`)
              }
              
              results.status_changed_bookings.push(existingBooking.id)
              results.imported++
            }
            continue
          } else {
            // New CANCELLED booking - skip import
            console.log(`CANCELLED booking ${externalBooking.id} does not exist locally → skipping`)
            results.cancelled_bookings_skipped.push(externalBooking.id)
            continue
          }
        }

        // For historical imports, log but still process cancelled bookings
        if (bookingStatus === 'CANCELLED' && isHistoricalImport) {
          console.log(`Historical mode: Processing CANCELLED booking: ${externalBooking.id}`)
        }

        // Extract client name
        let clientName = externalBooking.clientName
        if (!clientName && externalBooking.client?.name) {
          clientName = externalBooking.client.name
        }
        if (!clientName) {
          clientName = ''
        }

        // Handle multiple date formats from external API (arrays + legacy single fields)
        const allRigDates = normalizeDateArray(
          externalBooking.rig_up_dates,
          externalBooking.rigdaydate,
          externalBooking.rig_up_date,
          externalBooking.rig_date
        );
        const allEventDates = normalizeDateArray(
          externalBooking.event_dates,
          externalBooking.eventdate,
          externalBooking.event_date
        );
        const allRigdownDates = normalizeDateArray(
          externalBooking.rig_down_dates,
          externalBooking.rigdowndate,
          externalBooking.rig_down_date
        );

        const rigdaydate = allRigDates[0] || undefined;
        const eventdate = allEventDates[0] || undefined;
        const rigdowndate = allRigdownDates[0] || undefined;

        // ── Parse combined time-range fields from Booking export ─────────────
        // The external API may send "rig_up_time" / "rig_down_time" as combined
        // range strings like "08:00 - 12:00" instead of discrete start/end fields.
        const parsedRigUpRange = parseTimeRange(externalBooking.rig_up_time);
        const parsedRigDownRange = parseTimeRange(externalBooking.rig_down_time);
        const parsedEventRange = parseTimeRange(externalBooking.event_time);

        if (externalBooking.rig_up_time) {
          console.log(`[Time Parse] Booking ${externalBooking.id} rig_up_time raw: "${externalBooking.rig_up_time}" → parsed: ${parsedRigUpRange ? `${parsedRigUpRange.start} / ${parsedRigUpRange.end}` : 'UNPARSEABLE'}`);
        }
        if (externalBooking.rig_down_time) {
          console.log(`[Time Parse] Booking ${externalBooking.id} rig_down_time raw: "${externalBooking.rig_down_time}" → parsed: ${parsedRigDownRange ? `${parsedRigDownRange.start} / ${parsedRigDownRange.end}` : 'UNPARSEABLE'}`);
        }
        if (externalBooking.event_time) {
          console.log(`[Time Parse] Booking ${externalBooking.id} event_time raw: "${externalBooking.event_time}" → parsed: ${parsedEventRange ? `${parsedEventRange.start} / ${parsedEventRange.end}` : 'UNPARSEABLE'}`);
        }

        // Discrete fields take priority; combined range fields are fallback
        const rigStartRaw = externalBooking.rig_start_time ?? externalBooking.rig_up_start_time ?? parsedRigUpRange?.start;
        const rigEndRaw = externalBooking.rig_end_time ?? externalBooking.rig_up_end_time ?? parsedRigUpRange?.end;
        const rigdownStartRaw = externalBooking.rigdown_start_time ?? externalBooking.rig_down_start_time ?? parsedRigDownRange?.start;
        const rigdownEndRaw = externalBooking.rigdown_end_time ?? externalBooking.rig_down_end_time ?? parsedRigDownRange?.end;
        const eventStartRaw = externalBooking.event_start_time ?? externalBooking.event_start ?? parsedEventRange?.start;
        const eventEndRaw = externalBooking.event_end_time ?? externalBooking.event_end ?? parsedEventRange?.end;

        // Log resolved time sources
        console.log(`[Time Resolve] Booking ${externalBooking.id}: rig=${rigStartRaw || 'DEFAULT'}-${rigEndRaw || 'DEFAULT'}, event=${eventStartRaw || 'DEFAULT'}-${eventEndRaw || 'DEFAULT'}, rigdown=${rigdownStartRaw || 'DEFAULT'}-${rigdownEndRaw || 'DEFAULT'}`);

        // NOTE: If Booking export does not send a discrete event_start_time / event_end_time
        // or an event_time range field, event calendar times will fall back to defaults (08:00).
        // This is documented behavior — event-specific times require the Booking system to
        // export them explicitly.

        const bookingData: BookingData = {
          id: externalBooking.id,
          client: clientName,
          rigdaydate: rigdaydate,
          eventdate: eventdate,
          rigdowndate: rigdowndate,
          rig_start_time: normalizeDateTimeForBookingField(rigStartRaw, rigdaydate),
          rig_end_time: normalizeDateTimeForBookingField(rigEndRaw, rigdaydate),
          event_start_time: normalizeDateTimeForBookingField(eventStartRaw, eventdate),
          event_end_time: normalizeDateTimeForBookingField(eventEndRaw, eventdate),
          rigdown_start_time: normalizeDateTimeForBookingField(rigdownStartRaw, rigdowndate),
          rigdown_end_time: normalizeDateTimeForBookingField(rigdownEndRaw, rigdowndate),
          allRigDates,
          allEventDates,
          allRigdownDates,
          deliveryaddress: externalBooking.delivery_address,
          delivery_city: externalBooking.delivery_city,
          delivery_postal_code: externalBooking.delivery_postal_code,
          delivery_latitude: externalBooking.delivery_geocode?.lat,
          delivery_longitude: externalBooking.delivery_geocode?.lng,
          carry_more_than_10m: externalBooking.carry_more_than_10m || false,
          ground_nails_allowed: externalBooking.ground_nails_allowed || false,
          exact_time_needed: externalBooking.exact_time_needed || false,
          exact_time_info: externalBooking.exact_time_info,
          internalnotes: externalBooking.internal_notes,
          status: bookingStatus,
          booking_number: externalBooking.booking_number,
          version: 1,
          assigned_project_id: externalBooking.assigned_project_id,
          assigned_project_name: externalBooking.assigned_project_name,
          assigned_to_project: parseAssignedToProject(externalBooking.assigned_to_project),
          map_drawing_url: externalBooking.map_drawing_url || null,
          economics_data: externalBooking.economics || (externalBooking.totals ? {
            total_revenue_ex_vat: externalBooking.totals.total_ex_vat,
            total_costs: externalBooking.totals.total_costs,
            gross_margin: externalBooking.totals.gross_margin,
          } : null),
          organization_id: organizationId
        }

        console.log(`Processing booking ${bookingData.id} with status: ${bookingData.status} and project: ${bookingData.assigned_project_name || 'No project'}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)

        // Declare recovery flags at booking-level scope so they're accessible later
        // Calendar reconciliation is now fully deterministic (handled later in the pipeline).
        // Recovery flags for warehouse and products still needed.
        let needsCalendarRecovery = false; // kept for variable reference compatibility
        let needsWarehouseRecovery = false;
        let needsProductRecovery = false;

        if (existingBooking) {
          // EXISTING BOOKING - UPDATE ONLY IF ACTUALLY DIFFERENT
          console.log(`Found existing booking ${existingBooking.id}, checking for changes...`)
          
          const hasChanged = hasBookingChanged(bookingData, existingBooking);
          const statusChanged = existingBooking.status !== bookingData.status;
          
          if (bookingData.status === 'CONFIRMED') {
            // Calendar recovery is handled by deterministic reconciliation below — no check needed here

            // Check if warehouse events are missing or outdated
            const { data: existingWhEvents, error: whCheckError } = await supabase
              .from('warehouse_calendar_events')
              .select('id, source_rig_date, source_event_date, source_rigdown_date')
              .eq('booking_id', existingBooking.id)
              .eq('organization_id', bookingData.organization_id)
              .limit(1);
            
            if (!whCheckError) {
              // Recovery needed if no warehouse events exist
              if (!existingWhEvents || existingWhEvents.length === 0) {
                needsWarehouseRecovery = true;
                console.log(`Booking ${bookingData.id} is CONFIRMED but has NO warehouse events - will recover`);
              } else {
                // Check if warehouse events have outdated source dates
                const whEvent = existingWhEvents[0];
                if (whEvent.source_rig_date !== bookingData.rigdaydate ||
                    whEvent.source_event_date !== bookingData.eventdate ||
                    whEvent.source_rigdown_date !== bookingData.rigdowndate) {
                  needsWarehouseRecovery = true;
                  console.log(`Booking ${bookingData.id} warehouse events have outdated dates - will recover`);
                }
              }
            }
            
            // Check if products need recovery (accessories missing parent_product_id or missing new metadata columns)
            const { data: existingProducts, error: productCheckError } = await supabase
              .from('booking_products')
              .select('id, parent_product_id, parent_package_id, is_package_component, name, vat_rate, inventory_package_id, package_components')
              .eq('booking_id', existingBooking.id)
              .eq('organization_id', bookingData.organization_id);
            
            if (!productCheckError && existingProducts) {
              // Check if any accessory is missing parent_product_id
              const accessoriesWithoutParent = existingProducts.filter(
                p => isAccessoryProduct(p.name) && !p.parent_product_id
              );

              // Check if any package component is missing parent_product_id
              const pkgComponentsWithoutParent = existingProducts.filter(
                p => p.is_package_component === true && !p.parent_product_id
              );
              
              if (accessoriesWithoutParent.length > 0) {
                needsProductRecovery = true;
                console.log(`Booking ${bookingData.id} has ${accessoriesWithoutParent.length} accessories without parent_product_id - will recover`);
              }

              if (pkgComponentsWithoutParent.length > 0) {
                needsProductRecovery = true;
                console.log(`Booking ${bookingData.id} has ${pkgComponentsWithoutParent.length} package components without parent_product_id - will recover`);
              }
              
              // Also recover if external has more products than what's stored (missing package components)
              if (externalBooking.products && externalBooking.products.length > 0) {
                if (existingProducts.length === 0) {
                  needsProductRecovery = true;
                  console.log(`Booking ${bookingData.id} has NO products but external has ${externalBooking.products.length} - will recover`);
                } else if (externalBooking.products.length > existingProducts.length) {
                  needsProductRecovery = true;
                  console.log(`Booking ${bookingData.id} has ${existingProducts.length} products but external has ${externalBooking.products.length} (missing components) - will recover`);
                }
              }
              
              // Recover if products are missing new metadata columns (inventory_package_id is null but external has it)
              if (!needsProductRecovery && existingProducts.length > 0 && externalBooking.products) {
                const externalHasPackageIds = externalBooking.products.some((p: any) => p.inventory_package_id);
                const localHasPackageIds = existingProducts.some((p: any) => p.inventory_package_id);
                if (externalHasPackageIds && !localHasPackageIds) {
                  needsProductRecovery = true;
                  console.log(`Booking ${bookingData.id} products missing inventory_package_id metadata - will recover`);
                }
              }
              
              // NEW: Check if package_components JSONB exists but hasn't been expanded into rows
              if (!needsProductRecovery && existingProducts.length > 0) {
                const productsWithComponents = existingProducts.filter(
                  (p: any) => p.package_components !== null && p.package_components !== undefined
                );
                if (productsWithComponents.length > 0) {
                  const expandedComponents = existingProducts.filter(
                    (p: any) => p.is_package_component === true
                  );
                  if (expandedComponents.length === 0) {
                    needsProductRecovery = true;
                    console.log(`Booking ${bookingData.id} has ${productsWithComponents.length} products with package_components JSONB but 0 expanded component rows - will recover`);
                  }
                }
              }
            }
          }
          
          // CHECK FOR PRODUCT CHANGES (even if booking metadata hasn't changed)
          // Note: needsProductUpdate and productChanges are declared at the top of the loop
          
          if (externalBooking.products && Array.isArray(externalBooking.products)) {
            productChanges = await checkProductChanges(supabase, existingBooking.id, externalBooking.products);
            needsProductUpdate = productChanges.changed;
            
            if (needsProductUpdate) {
              console.log(`[Product Update] Products changed for booking ${bookingData.id}:`, {
                added: productChanges.added.length,
                removed: productChanges.removed.length,
                updated: productChanges.updated.length
              });
              
              // Store product changes in results
              results.product_changes.push({
                bookingId: bookingData.id,
                added: productChanges.added,
                removed: productChanges.removed,
                updated: productChanges.updated
              });
              results.products_updated_bookings.push(bookingData.id);
            }
          }
          
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && !needsWarehouseRecovery && !needsProductRecovery && !needsProductUpdate) {
            console.log(`No changes detected for ${bookingData.id}, skipping update`)
            
            // Backfill economics_data if it's missing in DB but present in external API
            if (!existingBooking.economics_data && bookingData.economics_data) {
              console.log(`[Economics] Backfilling economics_data for unchanged booking ${bookingData.id}`);
              const { error: econError } = await supabase
                .from('bookings')
                .update({ economics_data: bookingData.economics_data })
                .eq('id', existingBooking.id);
              if (econError) {
                console.error(`[Economics] Failed to backfill economics_data for ${bookingData.id}:`, econError.message);
              } else {
                console.log(`[Economics] Successfully backfilled economics_data for ${bookingData.id}`);
              }
            }

            // Sync all attachments (products, files_metadata, tent_images) with shared dedup
            await syncAllAttachments(
              supabase, bookingData.id,
              externalBooking.products || [],
              externalBooking.files_metadata || [],
              externalBooking.tent_images || [],
              results,
              organizationId
            );
            
            results.unchanged_bookings_skipped.push(bookingData.id)
            // Always reconcile calendar even for unchanged bookings
            await reconcileCalendarEvents(supabase, bookingData, organizationId, results, existingBooking);
            continue; // SKIP UPDATE - NO CHANGES
          }
          
          // If only warehouse recovery is needed, sync now and continue
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && needsWarehouseRecovery && !needsProductRecovery) {
            console.log(`Only warehouse recovery needed for ${bookingData.id}`);
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData, organizationId);
            results.warehouse_events_created += warehouseEventsCreated;
            // Sync all attachments with shared dedup
            await syncAllAttachments(
              supabase, bookingData.id,
              externalBooking.products || [],
              externalBooking.files_metadata || [],
              externalBooking.tent_images || [],
              results,
              organizationId
            );
            results.imported++;
            // Always reconcile calendar even for warehouse-only recovery
            await reconcileCalendarEvents(supabase, bookingData, organizationId, results, existingBooking);
            continue;
          }
          
          // If only product recovery is needed, clear products and reimport
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && !needsWarehouseRecovery && needsProductRecovery) {
            console.log(`Only product recovery needed for ${bookingData.id} - clearing and reimporting products`);
            
            // Delete packing list items BEFORE products to avoid FK constraint violations
            const { data: packingForRecovery } = await supabase
              .from('packing_projects')
              .select('id')
              .eq('booking_id', existingBooking.id)
              .maybeSingle();
            
            if (packingForRecovery) {
              await supabase.from('packing_list_items').delete().eq('packing_id', packingForRecovery.id);
              console.log(`[Product Recovery] Cleared packing list items for packing ${packingForRecovery.id}`);
            }
            
            await supabase.from('booking_products').delete().eq('booking_id', existingBooking.id);
            
            // Process products with parent-child relationship tracking
            if (externalBooking.products && Array.isArray(externalBooking.products)) {
              console.log(`[Product Recovery] Processing ${externalBooking.products.length} raw products for booking ${bookingData.id}`)
              
              // DEDUPLICATE: External API sometimes sends duplicate rows - merge by name + parent
              const deduplicatedProducts: any[] = [];
              const productKeyMap = new Map<string, number>();
              
              for (const rawProduct of externalBooking.products) {
                const name = (rawProduct.name || rawProduct.product_name || '').trim();
                const parentId = rawProduct.parent_product_id || rawProduct.parent_package_id || rawProduct.inventory_package_id || 'root';
                const isPkg = rawProduct.is_package_component === true;
                const key = `${name}::${parentId}::${isPkg}`;
                
                if (productKeyMap.has(key)) {
                  const existingIdx = productKeyMap.get(key)!;
                  deduplicatedProducts[existingIdx].quantity = 
                    (deduplicatedProducts[existingIdx].quantity || 1) + (rawProduct.quantity || 1);
                  console.log(`[Product Recovery][Dedup] Merged duplicate "${name}" - new quantity: ${deduplicatedProducts[existingIdx].quantity}`);
                } else {
                  productKeyMap.set(key, deduplicatedProducts.length);
                  deduplicatedProducts.push({ ...rawProduct, quantity: rawProduct.quantity || 1 });
                }
              }
              
              console.log(`[Product Recovery] Processing ${deduplicatedProducts.length} deduplicated products`);
              
              const externalIdToInternalId = new Map<string, string>();
              const pendingByExternalParentId = new Map<string, string[]>();
              const pendingSequentialAccessoryIds: string[] = [];
              let lastParentProductId: string | null = null;
              
              for (const product of deduplicatedProducts) {
                try {
                  const unitPrice = product.price || product.unit_price || product.rental_price || product.cost || null;
                  const quantity = product.quantity || 1;
                  const totalPrice = unitPrice ? unitPrice * quantity : null;
                  const productName = product.name || product.product_name || 'Unknown Product';
                  const isAccessory = isAccessoryProduct(productName);
                  const isPkgComponent = isPackageComponent(product);

                  const externalId = getExternalProductId(product);
                  const externalParentIdRaw = (isPkgComponent ? product.parent_package_id : product.parent_product_id) ?? null;
                  const externalParentId = externalParentIdRaw === null || externalParentIdRaw === undefined
                    ? null
                    : String(externalParentIdRaw).trim();
                  const mappedParentId = externalParentId ? (externalIdToInternalId.get(externalParentId) || null) : null;
                  const sequentialParentId = (isAccessory || isPkgComponent) ? lastParentProductId : null;
                  const resolvedParentId = mappedParentId || sequentialParentId;
                  
                  console.log(`[Product Recovery] Product "${productName}": isAccessory=${isAccessory}, isPkgComponent=${isPkgComponent}, externalId=${externalId}, externalParentId=${externalParentId}, resolvedParentId=${resolvedParentId}`)
                  
                  // Extract cost data from external product (also for recovery)
                  const laborCost = product.labor_cost || product.work_cost || product.setup_cost || 0;
                  const materialCost = product.material_cost || product.material || 0;
                  const setupHours = product.setup_hours || product.work_hours || product.hours || 0;
                  const externalCost = product.external_cost || product.subrent_cost || product.rental_cost_out || 0;
                  const costNotes = product.cost_notes || null;

                  // IMPORTANT: Do NOT use parent_product_id from external API - it references IDs in the source system
                  // which don't exist in our database. Only use lastParentProductId which we track locally.
                  const productData: ProductData = {
                    booking_id: existingBooking.id,
                    organization_id: organizationId,
                    name: productName,
                    quantity: quantity,
                    notes: product.notes || product.description || null,
                    unit_price: product.unit_price ?? unitPrice,
                    total_price: product.total ?? totalPrice,
                    parent_product_id: resolvedParentId || undefined,
                    is_package_component: isPkgComponent || false,
                    parent_package_id: isPkgComponent ? (product.parent_package_id || product.inventory_package_id || null) : null,
                    sku: product.sku || product.article_number || null,
                    // Cost fields for budget calculation
                    labor_cost: laborCost,
                    material_cost: materialCost,
                    setup_hours: setupHours,
                    external_cost: externalCost,
                    cost_notes: costNotes,
                    // Package component metadata
                    sort_index: product.sort_index ?? undefined,
                    inventory_item_type_id: product.inventory_item_type_id || null,
                    inventory_package_id: product.inventory_package_id || null,
                    assembly_cost: product.assembly_cost ?? 0,
                    handling_cost: product.handling_cost ?? 0,
                    purchase_cost: product.purchase_cost ?? 0,
                    package_components: product.package_components || null,
                    discount: product.discount ?? 0,
                    vat_rate: product.vat_rate ?? 25,
                  }

                  const { data: insertedProduct, error: productError } = await supabase
                    .from('booking_products')
                    .insert(productData)
                    .select('id')
                    .single()

                  if (productError) {
                    console.error(`[Product Recovery] Error inserting product:`, productError)
                  } else {
                    results.products_imported++

                    // Map external ID -> internal ID for later children (safe: only used in-memory during import)
                    if (externalId && insertedProduct?.id) {
                      externalIdToInternalId.set(externalId, insertedProduct.id);

                      // If any children were waiting for this parent external ID, attach them now
                      const pendingChildren = pendingByExternalParentId.get(externalId);
                      if (pendingChildren && pendingChildren.length > 0) {
                        const { error: pendingUpdateError } = await supabase
                          .from('booking_products')
                          .update({ parent_product_id: insertedProduct.id })
                          .in('id', pendingChildren);

                        if (pendingUpdateError) {
                          console.error(`[Product Recovery] Error attaching pending children to ${insertedProduct.id}:`, pendingUpdateError);
                        }
                        pendingByExternalParentId.delete(externalId);
                      }
                    }

                    // If we couldn't resolve parent yet but we have an external parent ref, park it until parent shows up
                    if (!resolvedParentId && externalParentId && insertedProduct?.id) {
                      const list = pendingByExternalParentId.get(externalParentId) || [];
                      list.push(insertedProduct.id);
                      pendingByExternalParentId.set(externalParentId, list);
                    }

                    // If accessory comes before first parent and has no explicit external parent, attach it to next parent we see
                    if (isAccessory && !externalParentId && !resolvedParentId && insertedProduct?.id) {
                      pendingSequentialAccessoryIds.push(insertedProduct.id);
                    }
                    
                    if (!isAccessory && !isPkgComponent && insertedProduct) {
                      lastParentProductId = insertedProduct.id;
                      console.log(`[Product Recovery] Set lastParentProductId to ${lastParentProductId} for "${productName}"`)

                      if (pendingSequentialAccessoryIds.length > 0) {
                        const { error: seqUpdateError } = await supabase
                          .from('booking_products')
                          .update({ parent_product_id: lastParentProductId })
                          .in('id', pendingSequentialAccessoryIds);

                        if (seqUpdateError) {
                          console.error(`[Product Recovery] Error attaching early accessories to ${lastParentProductId}:`, seqUpdateError);
                        }
                        pendingSequentialAccessoryIds.length = 0;
                      }
                    }
                  }
                } catch (productErr) {
                  console.error(`[Product Recovery] Error processing product:`, productErr)
                }
              }
            }
            
            // EXPAND package_components JSONB into individual rows
            const recoveryExpanded = await expandPackageComponents(supabase, existingBooking.id, organizationId);
            if (recoveryExpanded > 0) {
              results.products_imported += recoveryExpanded;
              console.log(`[Product Recovery] Expanded ${recoveryExpanded} package components for booking ${bookingData.id}`);
            }
            
            // SYNC packing list items for all products (including expanded components)
            const recoveryPackingSynced = await syncPackingListAfterExpansion(supabase, existingBooking.id, organizationId);
            if (recoveryPackingSynced > 0) {
              console.log(`[Product Recovery] Synced ${recoveryPackingSynced} packing list items for booking ${bookingData.id}`);
            }
            
            // Sync all attachments with shared dedup
            await syncAllAttachments(
              supabase, bookingData.id,
              externalBooking.products || [],
              externalBooking.files_metadata || [],
              externalBooking.tent_images || [],
              results,
              organizationId
            );
            results.imported++;
            results.updated_bookings.push(existingBooking.id);
            console.log(`[Product Recovery] Completed for booking ${bookingData.id}`);
            // Always reconcile calendar even for product-only recovery
            await reconcileCalendarEvents(supabase, bookingData, organizationId, results, existingBooking);
            continue;
          }
          
          // Declare status variables at the broader scope so they're available for updateData
          const wasConfirmed = existingBooking.status === 'CONFIRMED';
          const isNowConfirmed = bookingData.status === 'CONFIRMED';
          
          if (statusChanged) {
            console.log(`Status changed for ${bookingData.id}: ${existingBooking.status} -> ${bookingData.status}`)
            results.status_changed_bookings.push(bookingData.id)
            
            // If booking was confirmed but now isn't - REMOVE all calendar events
            if (wasConfirmed && !isNowConfirmed) {
              console.log(`Booking ${bookingData.id} is no longer CONFIRMED - removing calendar events`);
              
              // Remove from calendar_events
              const { error: deleteCalError } = await supabase
                .from('calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id);
              
              if (deleteCalError) {
                console.error(`Error removing calendar events:`, deleteCalError);
              } else {
                console.log(`Removed calendar events for booking ${existingBooking.id}`);
              }
              
              // Remove from warehouse_calendar_events
              const { error: deleteWhError } = await supabase
                .from('warehouse_calendar_events')
                .delete()
                .eq('booking_id', existingBooking.id);
              
              if (deleteWhError) {
                console.error(`Error removing warehouse events:`, deleteWhError);
              } else {
                console.log(`Removed warehouse events for booking ${existingBooking.id}`);
              }

              // Cancel linked projects when booking is no longer confirmed
              const { error: projCompleteErr } = await supabase
                .from('projects')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('booking_id', existingBooking.id);
              
              if (projCompleteErr) {
                console.error(`Error cancelling projects for de-confirmed booking:`, projCompleteErr);
              } else {
                console.log(`Cancelled projects for de-confirmed booking ${existingBooking.id}`);
              }

              // Cancel linked jobs
              const { error: jobCompleteErr } = await supabase
                .from('jobs')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('booking_id', existingBooking.id);
              
              if (jobCompleteErr) {
                console.error(`Error cancelling jobs for de-confirmed booking:`, jobCompleteErr);
              } else {
                console.log(`Cancelled jobs for de-confirmed booking ${existingBooking.id}`);
              }

              // Remove packing projects
              const { error: packingErr } = await supabase
                .from('packing_projects')
                .delete()
                .eq('booking_id', existingBooking.id);
              
              if (packingErr) {
                console.error(`Error removing packing projects for de-confirmed booking:`, packingErr);
              }

              // Remove booking products
              const { error: productsErr } = await supabase
                .from('booking_products')
                .delete()
                .eq('booking_id', existingBooking.id);
              
              if (productsErr) {
                console.error(`Error removing products for de-confirmed booking:`, productsErr);
              }
            }
            
            // If booking is now confirmed but wasn't before - calendar events will be created below
            // Also reset viewed flag so it appears as a new booking in the dashboard
            if (!wasConfirmed && isNowConfirmed) {
              console.log(`Booking ${bookingData.id} is now CONFIRMED - calendar events will be created and viewed will be reset`);
            }
          } else {
            console.log(`Data changed for ${bookingData.id}, updating`)
            results.updated_bookings.push(bookingData.id)
          }

          // Prepare update data - strip non-DB fields and reset viewed flag if booking is newly confirmed
          // CRITICAL: Never overwrite organization_id on existing bookings to prevent cross-tenant data theft
          const { allRigDates: _ard, allEventDates: _aed, allRigdownDates: _ardd, organization_id: _stripOrgId, ...dbBookingData } = bookingData as any;
          const updateData: any = {
            ...dbBookingData,
            id: existingBooking.id,
            version: (existingBooking.version || 1) + 1,
            updated_at: new Date().toISOString()
          };
          
          // CRITICAL: Preserve local project assignment flags
          // BUT skip preservation when booking is being re-confirmed (from cancelled/non-confirmed → confirmed)
          // so it appears in triage for manual assignment
          if (!(!wasConfirmed && isNowConfirmed)) {
            // Check for existing active project
            const { data: localProject } = await supabase
              .from('projects')
              .select('id, name, status')
              .eq('booking_id', existingBooking.id)
              .neq('status', 'cancelled')
              .limit(1);
            
            // Check for existing job (small project)
            const { data: localJob } = await supabase
              .from('jobs')
              .select('id, name, status')
              .eq('booking_id', existingBooking.id)
              .neq('status', 'completed')
              .limit(1);
            
            const activeProject = localProject && localProject.length > 0 ? localProject[0] : null;
            const activeJob = localJob && localJob.length > 0 ? localJob[0] : null;
            
            if (activeProject) {
              console.log(`[Preserve Flags] Booking ${bookingData.id} has local project ${activeProject.id} (${activeProject.status}) - preserving assignment flags`);
              updateData.assigned_to_project = true;
              updateData.assigned_project_id = activeProject.id;
              updateData.assigned_project_name = activeProject.name;
            } else if (activeJob) {
              console.log(`[Preserve Flags] Booking ${bookingData.id} has local job ${activeJob.id} (${activeJob.status}) - preserving assignment flags`);
              updateData.assigned_to_project = true;
              updateData.assigned_project_id = activeJob.id;
              updateData.assigned_project_name = `Jobb: ${activeJob.name}`;
            }
          } else {
            console.log(`[Skip Preserve] Booking ${bookingData.id} is being re-confirmed — skipping flag preservation to allow triage`);
          }
          
          // Reset viewed flag when a booking transitions to CONFIRMED (re-confirmed after cancellation)
          if (!wasConfirmed && isNowConfirmed) {
            updateData.viewed = false;
            console.log(`Resetting viewed flag for re-confirmed booking ${bookingData.id}`);
            // Do NOT auto-reactivate projects/jobs — let booking appear in triage for manual assignment
          }

          // Update existing booking
          const { error: updateError } = await supabase
            .from('bookings')
            .update(updateData)
            .eq('id', existingBooking.id)

          if (updateError) {
            console.error(`Error updating booking ${existingBooking.id}:`, updateError)
            results.errors.push({ booking_id: existingBooking.id, error: updateError.message })
            results.failed++
            continue
          }

          // Calendar reconciliation is now handled deterministically below (lines ~2644+)
          // No longer delete-and-recreate here — the reconciler handles create/update/delete

          // PRODUCT UPDATE WITH PACKING LIST RECONNECTION
          // 1. Fetch packing project for this booking (if exists)
          const { data: packingProject } = await supabase
            .from('packing_projects')
            .select('id')
            .eq('booking_id', existingBooking.id)
            .single();
          
          // 2. Fetch existing products BEFORE deletion (for packing list reconnection)
          const { data: oldProductsData } = await supabase
            .from('booking_products')
            .select('id, name, quantity')
            .eq('booking_id', existingBooking.id);
          oldProducts = oldProductsData || null;
          
          // 3. Attachments: never delete existing ones during sync.
          // New attachments are added additively via dedup check (seenUrls) in insertAttachment().
          // Attachments should only be removed by explicit user action, not by background sync.

          // Store references for packing reconnection after products are merged
          needsPackingReconnection = !!(packingProject?.id && oldProducts && oldProducts.length > 0 && needsProductUpdate);
          packingIdForReconnection = packingProject?.id || null;
          oldProductsForReconnection = oldProducts || [];

          bookingData.id = existingBooking.id

        } else {
          // NEW BOOKING - but first check if it exists in ANOTHER organization
          const { data: crossOrgBooking } = await supabase
            .from('bookings')
            .select('id, organization_id')
            .eq('id', externalBooking.id)
            .maybeSingle();

          if (crossOrgBooking && crossOrgBooking.organization_id !== organizationId) {
            console.error(`[CROSS-ORG BLOCK] Booking ${externalBooking.id} already exists in org ${crossOrgBooking.organization_id}, current import is for org ${organizationId}. SKIPPING to prevent data theft.`);
            // Write audit record for the blocked attempt
            await supabase.from('booking_import_audit').insert({
              booking_id: externalBooking.id,
              booking_number: externalBooking.booking_number || null,
              source: isSingleBookingRefresh ? 'single_refresh' : (body.quiet ? 'background' : 'manual'),
              request_organization_id: organizationId,
              external_organization_id: crossOrgBooking.organization_id,
              resolved_organization_id: organizationId,
              org_match: false,
              action: 'blocked_cross_org'
            });
            results.errors.push({ booking_id: externalBooking.id, error: `Cross-org conflict: booking belongs to org ${crossOrgBooking.organization_id}` });
            results.failed++;
            continue;
          }

          console.log(`Inserting new booking ${bookingData.id}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)
          
          const { allRigDates: _ard2, allEventDates: _aed2, allRigdownDates: _ardd2, ...dbInsertData } = bookingData as any;
          const { error: insertError } = await supabase
            .from('bookings')
            .insert(dbInsertData)

          if (insertError) {
            if (insertError.message.includes('duplicate key') || insertError.message.includes('already exists')) {
              console.log(`Duplicate booking detected during insert: ${bookingData.id}, skipping...`)
              results.duplicates_skipped.push(bookingData.id)
              continue
            }
            
            console.error(`Error inserting booking ${bookingData.id}:`, insertError)
            results.errors.push({ booking_id: bookingData.id, error: insertError.message })
            results.failed++
            continue
          }

          // Audit successful new import
          await supabase.from('booking_import_audit').insert({
            booking_id: bookingData.id,
            booking_number: bookingData.booking_number || null,
            source: isSingleBookingRefresh ? 'single_refresh' : (body.quiet ? 'background' : 'manual'),
            request_organization_id: organizationId,
            resolved_organization_id: organizationId,
            org_match: true,
            action: 'insert'
          });

          results.new_bookings.push(bookingData.id)
        }

        // Process products with parent-child relationship tracking
        if (externalBooking.products && Array.isArray(externalBooking.products)) {
        // Only re-process products if they have changed (prevents duplicates from parallel imports)
        if (needsProductUpdate || !existingBooking) {
          console.log(`Processing ${externalBooking.products.length} raw products for booking ${bookingData.id}`)
          
          // DEDUPLICATE: merge only true duplicate component rows, never collapse repeated parent packages
          const deduplicatedProducts: any[] = [];
          const productKeyMap = new Map<string, number>(); // key -> index in deduplicatedProducts
          const shouldMergeDuplicateProduct = (product: any) => {
            const productName = (product.name || product.product_name || '').trim();
            const isPkgComponent = product.is_package_component === true;
            const hasExplicitParent = Boolean(product.parent_product_id || product.parent_package_id || product.inventory_package_id);
            const hasPackageComponents = Array.isArray(product.package_components) && product.package_components.length > 0;
            const isAccessory = isAccessoryProduct(productName);

            return isPkgComponent || isAccessory || hasExplicitParent || !hasPackageComponents;
          };
          
          for (const product of externalBooking.products) {
            const name = (product.name || product.product_name || '').trim();
            const parentId = product.parent_product_id || product.parent_package_id || product.inventory_package_id || 'root';
            const isPkg = product.is_package_component === true;
            const key = `${name}::${parentId}::${isPkg}`;
            const shouldMerge = shouldMergeDuplicateProduct(product);
            
            if (shouldMerge && productKeyMap.has(key)) {
              // Merge: add quantities
              const existingIdx = productKeyMap.get(key)!;
              deduplicatedProducts[existingIdx].quantity = 
                (deduplicatedProducts[existingIdx].quantity || 1) + (product.quantity || 1);
              console.log(`[Dedup] Merged duplicate "${name}" - new quantity: ${deduplicatedProducts[existingIdx].quantity}`);
            } else {
              if (shouldMerge) {
                productKeyMap.set(key, deduplicatedProducts.length);
              }
              deduplicatedProducts.push({ ...product, quantity: product.quantity || 1 });
            }
          }
          
          console.log(`Processing ${deduplicatedProducts.length} deduplicated products for booking ${bookingData.id}`);

          // ── MERGE STRATEGY ──────────────────────────────────────────────────────
          // Build a lookup of existing products by a stable composite key so we can
          // UPDATE in-place without collapsing repeated package parents with same name.
          const existingProductsByKey = new Map<string, Array<{ id: string; name: string; parent_product_id?: string | null; is_package_component?: boolean | null }>>();
          const buildExistingProductKey = (product: any) => {
            const normalizedName = (product.name || '').trim().toLowerCase();
            const parentKey = product.parent_product_id || '__root__';
            const typeKey = product.is_package_component === true ? 'pkg' : 'item';
            return `${normalizedName}::${parentKey}::${typeKey}`;
          };
          if (oldProducts) {
            for (const ep of oldProducts) {
              const bucketKey = buildExistingProductKey(ep);
              const bucket = existingProductsByKey.get(bucketKey) || [];
              bucket.push(ep);
              existingProductsByKey.set(bucketKey, bucket);
            }
          }
          // ────────────────────────────────────────────────────────────────────────
          
          // Track the last parent product ID for linking accessories
          const externalIdToInternalId = new Map<string, string>();
          const pendingByExternalParentId = new Map<string, string[]>();
          const pendingSequentialAccessoryIds: string[] = [];
          let lastParentProductId: string | null = null;
          
          
          for (const product of deduplicatedProducts) {
            try {
              // Log raw product data to see all available fields from external API
              console.log(`RAW PRODUCT DATA from external API for booking ${bookingData.id}:`, JSON.stringify(product, null, 2))
              
              // Extract price data - try multiple possible field names
              const unitPrice = product.price || product.unit_price || product.rental_price || product.cost || null;
              const quantity = product.quantity || 1;
              const totalPrice = unitPrice ? unitPrice * quantity : null;
              const productName = product.name || product.product_name || 'Unknown Product';
              
              // Check if this is an accessory (starts with ↳, └, etc.) OR a package component
              const isAccessory = isAccessoryProduct(productName);
              const isPkgComponent = isPackageComponent(product);

              const externalId = getExternalProductId(product);
              const externalParentIdRaw = (isPkgComponent ? product.parent_package_id : product.parent_product_id) ?? null;
              const externalParentId = externalParentIdRaw === null || externalParentIdRaw === undefined
                ? null
                : String(externalParentIdRaw).trim();
              const mappedParentId = externalParentId ? (externalIdToInternalId.get(externalParentId) || null) : null;
              const sequentialParentId = (isAccessory || isPkgComponent) ? lastParentProductId : null;
              const resolvedParentId = mappedParentId || sequentialParentId;
              
              // Log package component detection
              if (isPkgComponent) {
                console.log(`[PACKAGE COMPONENT] "${productName}": parent_package_id=${product.parent_package_id}`)
              }
              
              console.log(`Product "${productName}": unit_price=${unitPrice}, quantity=${quantity}, total_price=${totalPrice}, isAccessory=${isAccessory}, isPkgComponent=${isPkgComponent}, externalId=${externalId}, externalParentId=${externalParentId}, resolvedParentId=${resolvedParentId}`)
              
              // Extract cost data from external product
              const laborCost = product.labor_cost || product.work_cost || product.setup_cost || 0;
              const materialCost = product.material_cost || product.material || 0;
              const setupHours = product.setup_hours || product.work_hours || product.hours || 0;
              const externalCost = product.external_cost || product.subrent_cost || product.rental_cost_out || 0;
              const costNotes = product.cost_notes || null;

              // IMPORTANT: Do NOT use parent_product_id from external API - it references IDs in the source system
              // which don't exist in our database. Only use lastParentProductId which we track locally.
              const productData: ProductData = {
                booking_id: bookingData.id,
                organization_id: organizationId,
                name: productName,
                quantity: quantity,
                notes: product.notes || product.description || null,
                unit_price: product.unit_price ?? unitPrice,
                total_price: product.total ?? totalPrice,
                parent_product_id: resolvedParentId || undefined,
                is_package_component: isPkgComponent || false,
                parent_package_id: isPkgComponent ? (product.parent_package_id || product.inventory_package_id || null) : null,
                sku: product.sku || product.article_number || null,
                // Cost fields for budget calculation
                labor_cost: laborCost,
                material_cost: materialCost,
                setup_hours: setupHours,
                external_cost: externalCost,
                cost_notes: costNotes,
                // Package component metadata
                sort_index: product.sort_index ?? undefined,
                inventory_item_type_id: product.inventory_item_type_id || null,
                inventory_package_id: product.inventory_package_id || null,
                assembly_cost: product.assembly_cost ?? 0,
                handling_cost: product.handling_cost ?? 0,
                purchase_cost: product.purchase_cost ?? 0,
                package_components: product.package_components || null,
                discount: product.discount ?? 0,
                vat_rate: product.vat_rate ?? 25,
              }

              // ── MERGE: UPDATE existing or INSERT new ────────────────────────────
              const existingProductKey = `${productName.trim().toLowerCase()}::${resolvedParentId || '__root__'}::${isPkgComponent ? 'pkg' : 'item'}`;
              const existingBucket = existingProductsByKey.get(existingProductKey) || [];
              const existingMatch = existingBucket.shift();
              if (existingBucket.length > 0) {
                existingProductsByKey.set(existingProductKey, existingBucket);
              } else {
                existingProductsByKey.delete(existingProductKey);
              }
              
              let upsertedProductId: string | null = null;
              let productError: any = null;

              if (existingMatch) {
                // UPDATE in-place — keeps existing ID stable (no race condition gap)
                seenExistingIds.add(existingMatch.id);
                const { error: updateErr } = await supabase
                  .from('booking_products')
                  .update({ ...productData, parent_product_id: resolvedParentId || undefined })
                  .eq('id', existingMatch.id);
                productError = updateErr;
                upsertedProductId = existingMatch.id;
                if (!updateErr) console.log(`[Merge] Updated existing product "${productName}" (id=${existingMatch.id})`);
              } else {
                // INSERT new product
                const { data: insertedProduct, error: insertErr } = await supabase
                  .from('booking_products')
                  .insert(productData)
                  .select('id')
                  .single();
                productError = insertErr;
                upsertedProductId = insertedProduct?.id ?? null;
                if (!insertErr) console.log(`[Merge] Inserted new product "${productName}" (id=${upsertedProductId})`);
              }
              // ────────────────────────────────────────────────────────────────────

              if (productError) {
                console.error(`Error upserting product for booking ${bookingData.id}:`, productError)
              } else if (upsertedProductId) {
                results.products_imported++

                // Map external ID -> internal ID for later children
                if (externalId) {
                  externalIdToInternalId.set(externalId, upsertedProductId);

                  const pendingChildren = pendingByExternalParentId.get(externalId);
                  if (pendingChildren && pendingChildren.length > 0) {
                    const { error: pendingUpdateError } = await supabase
                      .from('booking_products')
                      .update({ parent_product_id: upsertedProductId })
                      .in('id', pendingChildren);
                    if (pendingUpdateError) {
                      console.error(`Error attaching pending children to ${upsertedProductId}:`, pendingUpdateError);
                    }
                    pendingByExternalParentId.delete(externalId);
                  }
                }

                if (!resolvedParentId && externalParentId) {
                  const list = pendingByExternalParentId.get(externalParentId) || [];
                  list.push(upsertedProductId);
                  pendingByExternalParentId.set(externalParentId, list);
                }

                if (isAccessory && !externalParentId && !resolvedParentId) {
                  pendingSequentialAccessoryIds.push(upsertedProductId);
                }
                
                if (!isAccessory && !isPkgComponent) {
                  lastParentProductId = upsertedProductId;
                  console.log(`Set lastParentProductId to ${lastParentProductId} for product "${productName}"`)

                  if (pendingSequentialAccessoryIds.length > 0) {
                    const { error: seqUpdateError } = await supabase
                      .from('booking_products')
                      .update({ parent_product_id: lastParentProductId })
                      .in('id', pendingSequentialAccessoryIds);
                    if (seqUpdateError) {
                      console.error(`Error attaching early accessories to ${lastParentProductId}:`, seqUpdateError);
                    }
                    pendingSequentialAccessoryIds.length = 0;
                  }
                }
              }
            } catch (productErr) {
              console.error(`Error processing product for booking ${bookingData.id}:`, productErr)
            }
            }
          }

          // ── DELETE products no longer in the external API ─────────────────────
          if (oldProducts && oldProducts.length > 0) {
            const toDelete = oldProducts.filter((p: any) => !seenExistingIds.has(p.id));
            if (toDelete.length > 0) {
              const idsToDelete = toDelete.map((p: any) => p.id);
              console.log(`[Merge] Deleting ${idsToDelete.length} products no longer in external API`);
              await supabase.from('booking_products').delete().in('id', idsToDelete);
            }
          }
          // ─────────────────────────────────────────────────────────────────────
          
          // EXPAND package_components JSONB into individual rows (shared function)
          const mainExpanded = await expandPackageComponents(supabase, bookingData.id, organizationId);
          if (mainExpanded > 0) {
            results.products_imported += mainExpanded;
            console.log(`[Main Flow] Expanded ${mainExpanded} package components for booking ${bookingData.id}`);
          }
          
          // SYNC packing list items for expanded components
          const mainPackingSynced = await syncPackingListAfterExpansion(supabase, bookingData.id, organizationId);
          if (mainPackingSynced > 0) {
            console.log(`[Main Flow] Synced ${mainPackingSynced} packing list items for booking ${bookingData.id}`);
          }
        } // end if (needsProductUpdate || !existingBooking)
        // RECONNECT PACKING LIST ITEMS after products have been created
        if (needsPackingReconnection && packingIdForReconnection) {
          console.log(`[Packing Reconnect] Starting packing list reconnection for booking ${bookingData.id}`);
          
          // Fetch newly created products
          const { data: newProducts } = await supabase
            .from('booking_products')
            .select('id, name, quantity')
            .eq('booking_id', bookingData.id);
          
          if (newProducts && newProducts.length > 0) {
            const reconnectResult = await reconnectPackingListItems(
              supabase,
              packingIdForReconnection,
              oldProductsForReconnection,
              newProducts
            );
            
            console.log(`[Packing Reconnect] Booking ${bookingData.id}: ${reconnectResult.reconnected} items reconnected, ${reconnectResult.orphaned} orphaned/removed`);
            
            // Create packing list items for NEW products that didn't exist before
            const oldProductNames = new Set(oldProductsForReconnection.map((p: any) => (p.name || '').trim().toLowerCase()));
            const newProductsToAdd = newProducts.filter(p => !oldProductNames.has((p.name || '').trim().toLowerCase()));
            
            if (newProductsToAdd.length > 0) {
              console.log(`[Packing Reconnect] Creating ${newProductsToAdd.length} new packing list items`);
              
              const newPackingItems = newProductsToAdd.map(product => ({
                packing_id: packingIdForReconnection,
                booking_product_id: product.id,
                quantity_to_pack: product.quantity || 1,
                quantity_packed: 0,
                organization_id: organizationId
              }));
              
              const { error: insertError } = await supabase
                .from('packing_list_items')
                .insert(newPackingItems);
              
              if (insertError) {
                console.error(`[Packing Reconnect] Error creating new packing list items:`, insertError);
              }
            }
          }
        }

        // Process attachments
        if (externalBooking.attachments && Array.isArray(externalBooking.attachments)) {
          console.log(`Processing ${externalBooking.attachments.length} attachments for booking ${bookingData.id}`)
          
          for (const attachment of externalBooking.attachments) {
            try {
              let attUrl: string | null = attachment.public_url || attachment.url || attachment.file_url || null;
              const attFileName = attachment.file_name || attachment.name || 'Unknown File';

              // New format: upload base64 to Storage
              if (!attUrl && attachment.content_base64) {
                const ext = attFileName.includes('.') ? attFileName.split('.').pop()!.toLowerCase() : 'bin';
                const safeFileName = attFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
                const filePath = `${bookingData.id}/attachments/${safeFileName}`;
                const mimeMap: Record<string, string> = {
                  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                  png: 'image/png', webp: 'image/webp', gif: 'image/gif'
                };
                const contentType = mimeMap[ext] || 'application/octet-stream';
                attUrl = await uploadBase64ToStorage(supabase, attachment.content_base64, filePath, contentType);
                if (attUrl) {
                  console.log(`[Attachment] Uploaded base64 attachment "${attFileName}" to Storage`);
                } else {
                  console.error(`[Attachment] Failed to upload base64 for "${attFileName}", booking ${bookingData.id}`);
                  continue;
                }
              }

              if (!attUrl) {
                console.warn(`[Attachment] No URL for attachment "${attFileName}", skipping`);
                continue;
              }

              const attachmentData: AttachmentData = {
                booking_id: bookingData.id,
                url: attUrl,
                file_name: attFileName,
                file_type: attachment.file_type || attachment.type || 'unknown'
              }

              const { error: attachmentError } = await supabase
                .from('booking_attachments')
                .insert(attachmentData)

              if (attachmentError) {
                console.error(`Error inserting attachment for booking ${bookingData.id}:`, attachmentError)
              } else {
                results.attachments_imported++
              }
            } catch (attachmentErr) {
              console.error(`Error processing attachment for booking ${bookingData.id}:`, attachmentErr)
            }
          }
        }

        // Process map_drawing (situationsplan) — supports both map_drawing_url and content_base64
        if (externalBooking.map_drawing) {
          const md = externalBooking.map_drawing;
          let mdUrl: string | null = md.public_url || md.url || externalBooking.map_drawing_url || null;

          if (!mdUrl && md.content_base64) {
            const filePath = `${bookingData.id}/map_drawing.jpg`;
            mdUrl = await uploadBase64ToStorage(supabase, md.content_base64, filePath, 'image/jpeg');
            if (mdUrl) {
              console.log(`[Map Drawing] Uploaded base64 map_drawing to Storage for booking ${bookingData.id}`);
            } else {
              console.error(`[Map Drawing] Failed to upload base64 map_drawing for booking ${bookingData.id}`);
            }
          }

          if (mdUrl && mdUrl !== bookingData.map_drawing_url) {
            const { error: mdErr } = await supabase
              .from('bookings')
              .update({ map_drawing_url: mdUrl })
              .eq('id', bookingData.id);
            if (mdErr) {
              console.error(`[Map Drawing] Error updating map_drawing_url for booking ${bookingData.id}:`, mdErr);
            } else {
              console.log(`[Map Drawing] Updated map_drawing_url for booking ${bookingData.id}`);
            }
          }
        } else if (externalBooking.map_drawing_url && externalBooking.map_drawing_url !== bookingData.map_drawing_url) {
          // Legacy: map_drawing_url directly on the booking object
          await supabase.from('bookings').update({ map_drawing_url: externalBooking.map_drawing_url }).eq('id', bookingData.id);
        }

        // Sync all attachments (products, files_metadata, tent_images) with shared dedup
        await syncAllAttachments(
          supabase, bookingData.id,
          externalBooking.products || [],
          externalBooking.files_metadata || [],
          externalBooking.tent_images || [],
          results,
          organizationId
        );

        results.imported++

        // ═══════════════════════════════════════════════════════════════════
        // DETERMINISTIC CALENDAR RECONCILIATION (extracted to helper)
        // ═══════════════════════════════════════════════════════════════════
        await reconcileCalendarEvents(supabase, bookingData, organizationId, results, existingBooking);

        if (bookingData.status === 'CONFIRMED') {
          // Sync warehouse calendar events for confirmed bookings with dates
          // Guard: only sync if booking is new, dates changed, or status just became CONFIRMED
          // This prevents duplicate events when only products change (needsProductUpdate=true)
          const isNewBooking = !existingBooking;
          const justConfirmed = existingBooking
            ? (existingBooking.status !== 'CONFIRMED' && bookingData.status === 'CONFIRMED')
            : false;
          if ((isNewBooking || needsWarehouseRecovery || justConfirmed) &&
              (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate)) {
            console.log(`[Warehouse Sync] Syncing events for ${bookingData.id} (isNew=${isNewBooking}, needsRecovery=${needsWarehouseRecovery}, justConfirmed=${justConfirmed})`);
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData, organizationId);
            results.warehouse_events_created += warehouseEventsCreated;
          } else {
            console.log(`[Warehouse Sync] Skipping for ${bookingData.id} - dates unchanged and not new/justConfirmed`);
          }
          
          // Create packing project for confirmed bookings
          const packingCreated = await createPackingForBooking(supabase, bookingData, organizationId);
          if (packingCreated) {
            results.packing_projects_created++;
          }
        }

      } catch (error) {
        console.error(`Error processing booking ${externalBooking.id}:`, error)
        results.errors.push({ booking_id: externalBooking.id, error: error.message })
        results.failed++
      }
    }

    // SAVE SYNC TIMESTAMP using UPSERT - but only for non-historical, non-single-booking imports
    const finalTimestamp = new Date().toISOString()
    console.log(`Saving sync timestamp: ${finalTimestamp}`)
    console.log(`Team distribution summary:`, results.team_distribution)
    console.log(`Unchanged bookings skipped: ${results.unchanged_bookings_skipped.length}`)
    
    if (!isHistoricalImport && !isSingleBookingRefresh) {
      const { error: syncError } = await supabase
        .from('sync_state')
      .upsert({
          sync_type: 'booking_import',
          organization_id: organizationId,
          last_sync_timestamp: finalTimestamp,
          last_sync_mode: syncMode,
          last_sync_status: results.failed > 0 ? 'partial_success' : 'success',
          metadata: { results },
          updated_at: finalTimestamp
        }, { onConflict: 'sync_type' })

      if (syncError) {
        console.error('Error saving sync state:', syncError)
      } else {
        console.log('Sync timestamp saved successfully')
      }
    } else if (isSingleBookingRefresh) {
      console.log('Single booking refresh: NOT updating sync timestamp to avoid moving incremental window')
    } else {
      console.log('Historical import: NOT updating sync timestamp to preserve incremental sync state')
    }

    const importCompletedAt = new Date().toISOString();

    // ── Structured pipeline completion log ───────────────────────────────
    console.log('[import-bookings] Pipeline completed', JSON.stringify({
      import_started: importStartedAt,
      import_completed: importCompletedAt,
      booking_id: normalizedSingleBookingId,
      organization_id: organizationId,
      event_type_hint: webhookEventType,
      total: results.total,
      imported: results.imported,
      failed: results.failed,
      new_bookings: results.new_bookings.length,
      updated_bookings: results.updated_bookings.length,
      unchanged_skipped: results.unchanged_bookings_skipped.length,
      duplicates_skipped: results.duplicates_skipped.length,
      cancelled_skipped: results.cancelled_bookings_skipped.length,
      calendar_events_created: results.calendar_events_created,
      calendar_reconciled: results.calendar_events_created > 0 || results.status_changed_bookings.length > 0,
      warehouse_events_created: results.warehouse_events_created,
      packing_projects_created: results.packing_projects_created,
      team_distribution: results.team_distribution,
      mode: isHistoricalImport ? 'HISTORICAL' : syncMode,
      errors: results.errors.length > 0 ? results.errors : undefined,
    }))

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('[import-bookings] Pipeline failed', JSON.stringify({
      error: error.message,
      import_started: typeof importStartedAt !== 'undefined' ? importStartedAt : null,
      import_completed: new Date().toISOString(),
    }))
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        results: {
          total: 0,
          imported: 0,
          failed: 0,
          calendar_events_created: 0,
          warehouse_events_created: 0,
          products_imported: 0,
          attachments_imported: 0,
          new_bookings: [],
          updated_bookings: [],
          status_changed_bookings: [],
          cancelled_bookings_skipped: [],
          duplicates_skipped: [],
          unchanged_bookings_skipped: [],
          errors: [error.message],
          sync_mode: 'failed',
          team_distribution: {}
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

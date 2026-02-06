// Import bookings from external API - filters out bookings before 2026-01-01
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

/**
 * Sync warehouse calendar events for a confirmed booking
 * Creates 6 logistics events based on rig/event/rigdown dates
 */
const syncWarehouseEventsForBooking = async (supabase: any, booking: any): Promise<number> => {
  console.log(`[Warehouse] Syncing warehouse events for booking ${booking.id}`);
  
  // Delete existing warehouse events for this booking (to avoid duplicates)
  const { error: deleteError } = await supabase
    .from('warehouse_calendar_events')
    .delete()
    .eq('booking_id', booking.id);
  
  if (deleteError) {
    console.error(`[Warehouse] Error deleting existing events:`, deleteError);
  }
  
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
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate,
      source_rigdown_date: booking.rigdowndate || null,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Return delivery: same day as rigdown, 17:00-19:00
  // Inventory: day after rigdown, 08:00-10:00
  // Unpacking: day after rigdown, 10:00-12:00
  if (booking.rigdowndate) {
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Återleverans - ${clientName}`,
      event_type: 'return',
      start_time: `${booking.rigdowndate}T17:00:00`,
      end_time: `${booking.rigdowndate}T19:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    const dayAfterRigdown = addDays(booking.rigdowndate, 1);
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Inventering - ${clientName}`,
      event_type: 'inventory',
      start_time: `${dayAfterRigdown}T08:00:00`,
      end_time: `${dayAfterRigdown}T10:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
    
    events.push({
      booking_id: booking.id,
      booking_number: bookingNumber,
      title: `Upppackning - ${clientName}`,
      event_type: 'unpacking',
      start_time: `${dayAfterRigdown}T10:00:00`,
      end_time: `${dayAfterRigdown}T12:00:00`,
      delivery_address: deliveryAddress,
      resource_id: 'warehouse',
      source_rig_date: booking.rigdaydate || null,
      source_event_date: booking.eventdate || null,
      source_rigdown_date: booking.rigdowndate,
      has_source_changes: false,
      manually_adjusted: false,
      viewed: false
    });
  }
  
  // Insert all warehouse events
  if (events.length > 0) {
    console.log(`[Warehouse] Inserting ${events.length} warehouse events for booking ${booking.id}`);
    const { error: insertError } = await supabase
      .from('warehouse_calendar_events')
      .insert(events);
    
    if (insertError) {
      console.error(`[Warehouse] Error inserting events:`, insertError);
      return 0;
    }
    
    console.log(`[Warehouse] Successfully created ${events.length} warehouse events for booking ${booking.id}`);
    return events.length;
  }
  
  return 0;
};

/**
 * Create packing project and tasks for a confirmed booking
 * Creates standard tasks with deadlines based on rig/event/rigdown dates
 */
const createPackingForBooking = async (supabase: any, booking: any): Promise<boolean> => {
  console.log(`[Packing] Checking if packing exists for booking ${booking.id}`);
  
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
    console.log(`[Packing] Packing already exists for booking ${booking.id}, skipping creation`);
    return false;
  }
  
  const clientName = booking.client || 'Okänd kund';
  const eventDate = booking.eventdate ? new Date(booking.eventdate).toLocaleDateString('sv-SE') : '';
  const packingName = eventDate ? `${clientName} - ${eventDate}` : clientName;
  
  console.log(`[Packing] Creating packing project: ${packingName}`);
  
  // Create packing project
  const { data: newPacking, error: insertError } = await supabase
    .from('packing_projects')
    .insert({
      booking_id: booking.id,
      name: packingName,
      status: 'planning'
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
      is_info_only: false
    });
    
    // Utrustning packad: rigdaydate - 1 day
    tasks.push({
      packing_id: newPacking.id,
      title: 'Utrustning packad',
      description: 'All utrustning packad och redo för transport',
      deadline: addDays(booking.rigdaydate, -1),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
    });
    
    // Utleverans klarmarkerad: rigdaydate
    tasks.push({
      packing_id: newPacking.id,
      title: 'Utleverans klarmarkerad',
      description: 'Bekräfta att leveransen har gått iväg',
      deadline: booking.rigdaydate,
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
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
      is_info_only: false
    });
    
    // Upppackning klar: rigdowndate + 2 days
    tasks.push({
      packing_id: newPacking.id,
      title: 'Upppackning klar',
      description: 'All utrustning uppackad och återställd på lagerplats',
      deadline: addDays(booking.rigdowndate, 2),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false
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
 * Helper function to calculate end time based on event type
 */
const getEndTimeForEventType = (startTime: string, eventType: 'rig' | 'event' | 'rigDown'): string => {
  const start = new Date(startTime);
  let hoursToAdd: number;
  
  switch (eventType) {
    case 'rig':
      hoursToAdd = 4; // 4 hours for rig events
      break;
    case 'event':
      hoursToAdd = 2.5; // 2.5 hours for event days
      break;
    case 'rigDown':
      hoursToAdd = 4; // 4 hours for rig down events
      break;
    default:
      hoursToAdd = 4; // fallback to 4 hours
  }
  
  const end = new Date(start.getTime() + (hoursToAdd * 60 * 60 * 1000));
  return end.toISOString();
};

/**
 * Smart team assignment that distributes bookings evenly across teams
 * Only assigns teams for NEW events, never overrides existing assignments
 */
const getNextTeamAssignment = async (supabase: any, eventType: string, eventDate: string, bookingId: string): Promise<string> => {
  // EVENT type events always go to team-11 (Live column)
  if (eventType === 'event') {
    console.log(`Assigning EVENT type to team-11 (Live) for booking ${bookingId}`);
    return 'team-11';
  }

  const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
  
  try {
    // Check existing events for this date to find the team with least events
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('resource_id')
      .eq('event_type', eventType)
      .gte('start_time', `${eventDate}T00:00:00`)
      .lt('start_time', `${eventDate}T23:59:59`);

    // Count events per team for this date and event type
    const teamCounts = new Map<string, number>();
    teams.forEach(team => teamCounts.set(team, 0));
    
    existingEvents?.forEach(event => {
      if (teams.includes(event.resource_id)) {
        teamCounts.set(event.resource_id, (teamCounts.get(event.resource_id) || 0) + 1);
      }
    });

    // Find the team with the least events
    let selectedTeam = teams[0];
    let minCount = teamCounts.get(selectedTeam) || 0;
    
    for (const team of teams) {
      const count = teamCounts.get(team) || 0;
      if (count < minCount) {
        minCount = count;
        selectedTeam = team;
      }
    }

    console.log(`Team distribution for ${eventDate} ${eventType}:`, Object.fromEntries(teamCounts));
    console.log(`Assigning booking ${bookingId} to ${selectedTeam} (has ${minCount} events)`);
    
    return selectedTeam;
  } catch (error) {
    console.error('Error calculating team assignment, falling back to round-robin:', error);
    // Fallback to simple round-robin based on booking position
    const bookingNumber = parseInt(bookingId.replace(/\D/g, ''), 10) || 0;
    const selectedTeam = teams[bookingNumber % teams.length];
    console.log(`Fallback assignment: booking ${bookingId} to ${selectedTeam}`);
    return selectedTeam;
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
    'assigned_project_id', 'assigned_project_name', 'assigned_to_project'
  ];
  
  for (const field of fields) {
    const external = externalBooking[field] || '';
    const existing = existingBooking[field] || '';
    if (external !== existing) {
      console.log(`Field ${field} changed: "${existing}" -> "${external}"`);
      return true;
    }
  }
  
  return false;
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

    const { 
      quiet = false, 
      syncMode = 'incremental',
      historicalMode = false,
      forceHistoricalImport = false,
      startDate,
      endDate
    } = await req.json()
    
    const isHistoricalImport = historicalMode || forceHistoricalImport;
    
    console.log(`Starting import with sync mode: ${syncMode}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)

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
        last_sync_status: 'in_progress',
        last_sync_mode: syncMode,
        metadata: { 
          started_at: currentTimestamp,
          sync_mode: syncMode,
          filters: { startDate, endDate },
          historical_mode: isHistoricalImport
        },
        updated_at: currentTimestamp
      })

    if (syncStateError) {
      console.error('Error updating sync state:', syncStateError)
    }

    // Build API URL with timestamp filter for incremental sync
    let apiUrl = 'https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings';
    
    // For incremental sync (non-historical), use timestamp filtering
    if (syncMode === 'incremental' && lastSyncTimestamp && !isHistoricalImport) {
      const sinceDate = new Date(lastSyncTimestamp).toISOString();
      apiUrl += `?since=${encodeURIComponent(sinceDate)}`;
      console.log(`Fetching bookings modified since: ${sinceDate}`);
    }
    
    // For historical imports with date range
    if (isHistoricalImport && (startDate || endDate)) {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (params.toString()) {
        apiUrl += `?${params.toString()}`;
        console.log(`Historical import with date range: ${startDate || 'beginning'} to ${endDate || 'end'}`);
      }
    }

    // Fetch bookings from export-bookings function
    const externalResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${importApiKey}`,
        'x-api-key': importApiKey,
        'Content-Type': 'application/json'
      }
    })

    if (!externalResponse.ok) {
      // Try to get error details from response body
      let errorDetails = '';
      try {
        const errorBody = await externalResponse.text();
        errorDetails = errorBody.substring(0, 500); // Limit to 500 chars
        console.error(`External API error response body: ${errorDetails}`);
      } catch (e) {
        console.error('Could not read external API error response body');
      }
      throw new Error(`External API error: ${externalResponse.status}${errorDetails ? ` - ${errorDetails}` : ''}`)
    }

    const externalData = await externalResponse.json()
    console.log(`Fetched ${externalData.data?.length || 0} bookings from external API`)

    // Handle the response format from export-bookings function
    if (!externalData.data || !Array.isArray(externalData.data)) {
      throw new Error('Invalid external API response format - expected data array')
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

    // Get existing bookings for comparison
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, status, version, booking_number, client, rigdaydate, eventdate, rigdowndate, deliveryaddress, delivery_city, delivery_postal_code')

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
      const dates = [booking.rigdaydate, booking.eventdate, booking.rigdowndate].filter(Boolean);
      if (dates.length === 0) return true; // No dates = allow import (edge case)
      
      return dates.some(dateStr => {
        const date = new Date(dateStr);
        return date >= CUTOFF_DATE;
      });
    };

    for (const externalBooking of externalData.data) {
      // Skip bookings with only past dates (unless historical mode)
      if (!isHistoricalImport && !hasFutureDates(externalBooking)) {
        const latestDate = [externalBooking.rigdaydate, externalBooking.eventdate, externalBooking.rigdowndate]
          .filter(Boolean)
          .sort()
          .pop() || 'no dates';
        console.log(`SKIPPING OLD BOOKING ${externalBooking.id} (${externalBooking.client}) - latest date: ${latestDate}`);
        continue;
      }

      // Variables for packing list reconnection (must be declared here for scope)
      let needsPackingReconnection = false;
      let packingIdForReconnection: string | null = null;
      let oldProductsForReconnection: any[] = [];
      let needsProductUpdate = false;
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

        // Handle multiple date arrays - use first date from each array
        const rigdaydate = externalBooking.rig_up_dates && externalBooking.rig_up_dates.length > 0 
          ? externalBooking.rig_up_dates[0] 
          : undefined

        const eventdate = externalBooking.event_dates && externalBooking.event_dates.length > 0 
          ? externalBooking.event_dates[0] 
          : undefined

        const rigdowndate = externalBooking.rig_down_dates && externalBooking.rig_down_dates.length > 0 
          ? externalBooking.rig_down_dates[0] 
          : undefined

        const bookingData: BookingData = {
          id: externalBooking.id,
          client: clientName,
          rigdaydate: rigdaydate,
          eventdate: eventdate,
          rigdowndate: rigdowndate,
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
          assigned_to_project: parseAssignedToProject(externalBooking.assigned_to_project)
        }

        console.log(`Processing booking ${bookingData.id} with status: ${bookingData.status} and project: ${bookingData.assigned_project_name || 'No project'}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)

        if (existingBooking) {
          // EXISTING BOOKING - UPDATE ONLY IF ACTUALLY DIFFERENT
          console.log(`Found existing booking ${existingBooking.id}, checking for changes...`)
          
          const hasChanged = hasBookingChanged(bookingData, existingBooking);
          const statusChanged = existingBooking.status !== bookingData.status;
          
          // Check if this CONFIRMED booking is missing calendar events (recovery scenario)
          let needsCalendarRecovery = false;
          let needsWarehouseRecovery = false;
          let needsProductRecovery = false;
          
          if (bookingData.status === 'CONFIRMED') {
            const { data: existingCalEvents, error: calCheckError } = await supabase
              .from('calendar_events')
              .select('id')
              .eq('booking_id', existingBooking.id)
              .limit(1);
            
            if (!calCheckError && (!existingCalEvents || existingCalEvents.length === 0)) {
              needsCalendarRecovery = true;
              console.log(`Booking ${bookingData.id} is CONFIRMED but has NO calendar events - will recover`);
            }
            
            // Check if warehouse events are missing or outdated
            const { data: existingWhEvents, error: whCheckError } = await supabase
              .from('warehouse_calendar_events')
              .select('id, source_rig_date, source_event_date, source_rigdown_date')
              .eq('booking_id', existingBooking.id)
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
            
            // Check if products need recovery (accessories missing parent_product_id)
            const { data: existingProducts, error: productCheckError } = await supabase
              .from('booking_products')
              .select('id, parent_product_id, parent_package_id, is_package_component, name')
              .eq('booking_id', existingBooking.id);
            
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
              
              // Also recover if booking has no products but external data has products
              if (existingProducts.length === 0 && externalBooking.products && externalBooking.products.length > 0) {
                needsProductRecovery = true;
                console.log(`Booking ${bookingData.id} has NO products but external has ${externalBooking.products.length} - will recover`);
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
            results.unchanged_bookings_skipped.push(bookingData.id)
            continue; // SKIP UPDATE - NO CHANGES
          }
          
          // If only warehouse recovery is needed, sync now and continue
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && needsWarehouseRecovery && !needsProductRecovery) {
            console.log(`Only warehouse recovery needed for ${bookingData.id}`);
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
            results.warehouse_events_created += warehouseEventsCreated;
            results.imported++;
            continue;
          }
          
          // If only product recovery is needed, clear products and reimport
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && !needsWarehouseRecovery && needsProductRecovery) {
            console.log(`Only product recovery needed for ${bookingData.id} - clearing and reimporting products`);
            await supabase.from('booking_products').delete().eq('booking_id', existingBooking.id);
            
            // Process products with parent-child relationship tracking
            if (externalBooking.products && Array.isArray(externalBooking.products)) {
              console.log(`[Product Recovery] Processing ${externalBooking.products.length} raw products for booking ${bookingData.id}`)
              
              // DEDUPLICATE: External API sometimes sends duplicate rows - merge by name + parent
              const deduplicatedProducts: any[] = [];
              const productKeyMap = new Map<string, number>();
              
              for (const rawProduct of externalBooking.products) {
                const name = (rawProduct.name || rawProduct.product_name || '').trim();
                const parentId = rawProduct.parent_product_id || rawProduct.parent_package_id || 'root';
                const key = `${name}::${parentId}`;
                
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
                    name: productName,
                    quantity: quantity,
                    notes: product.notes || product.description || null,
                    unit_price: unitPrice,
                    total_price: totalPrice,
                    parent_product_id: resolvedParentId || undefined,
                    is_package_component: isPkgComponent || false,
                    // parent_package_id is stored as text (no FK constraint) so it's safe to store external IDs
                    parent_package_id: isPkgComponent ? (product.parent_package_id || null) : null,
                    sku: product.sku || product.inventory_item_type_id || product.article_number || null,
                    // Cost fields for budget calculation
                    labor_cost: laborCost,
                    material_cost: materialCost,
                    setup_hours: setupHours,
                    external_cost: externalCost,
                    cost_notes: costNotes
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
            
            results.imported++;
            results.updated_bookings.push(existingBooking.id);
            console.log(`[Product Recovery] Completed for booking ${bookingData.id}`);
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

              // Complete linked projects when booking is no longer confirmed
              const { error: projCompleteErr } = await supabase
                .from('projects')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('booking_id', existingBooking.id);
              
              if (projCompleteErr) {
                console.error(`Error completing projects for de-confirmed booking:`, projCompleteErr);
              } else {
                console.log(`Completed projects for de-confirmed booking ${existingBooking.id}`);
              }

              // Complete linked jobs
              const { error: jobCompleteErr } = await supabase
                .from('jobs')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('booking_id', existingBooking.id);
              
              if (jobCompleteErr) {
                console.error(`Error completing jobs for de-confirmed booking:`, jobCompleteErr);
              } else {
                console.log(`Completed jobs for de-confirmed booking ${existingBooking.id}`);
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

          // Prepare update data - reset viewed flag if booking is newly confirmed
          const updateData: any = {
            ...bookingData,
            id: existingBooking.id,
            version: (existingBooking.version || 1) + 1,
            updated_at: new Date().toISOString()
          };
          
          // Reset viewed flag when a booking transitions to CONFIRMED (re-confirmed after cancellation)
          if (!wasConfirmed && isNowConfirmed) {
            updateData.viewed = false;
            console.log(`Resetting viewed flag for re-confirmed booking ${bookingData.id}`);
            
            // Check if there's a cancelled project with data that should be reactivated
            const { data: existingProject, error: projectCheckError } = await supabase
              .from('projects')
              .select('id, status')
              .eq('booking_id', existingBooking.id)
              .limit(1);
            
            if (!projectCheckError && existingProject && existingProject.length > 0) {
              const project = existingProject[0];
              console.log(`Found existing project ${project.id} for re-confirmed booking ${bookingData.id} (status: ${project.status})`);
              
              // Check if project has any valuable data (time reports, labor costs, purchases, etc.)
              const { data: timeReports } = await supabase
                .from('time_reports')
                .select('id')
                .eq('booking_id', existingBooking.id)
                .limit(1);
              
              const { data: laborCosts } = await supabase
                .from('project_labor_costs')
                .select('id')
                .eq('project_id', project.id)
                .limit(1);
              
              const { data: purchases } = await supabase
                .from('project_purchases')
                .select('id')
                .eq('project_id', project.id)
                .limit(1);
              
              const { data: quotes } = await supabase
                .from('project_quotes')
                .select('id')
                .eq('project_id', project.id)
                .limit(1);
              
              const { data: invoices } = await supabase
                .from('project_invoices')
                .select('id')
                .eq('project_id', project.id)
                .limit(1);
              
              const hasTimeReports = timeReports && timeReports.length > 0;
              const hasLaborCosts = laborCosts && laborCosts.length > 0;
              const hasPurchases = purchases && purchases.length > 0;
              const hasQuotes = quotes && quotes.length > 0;
              const hasInvoices = invoices && invoices.length > 0;
              const hasValuableData = hasTimeReports || hasLaborCosts || hasPurchases || hasQuotes || hasInvoices;
              
              if (hasValuableData) {
                console.log(`Project ${project.id} has valuable data - reactivating instead of creating new`);
                console.log(`  - Time reports: ${hasTimeReports}, Labor costs: ${hasLaborCosts}, Purchases: ${hasPurchases}, Quotes: ${hasQuotes}, Invoices: ${hasInvoices}`);
                
                // Reactivate the project by setting status to 'planning'
                const { error: reactivateError } = await supabase
                  .from('projects')
                  .update({ 
                    status: 'planning',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', project.id);
                
                if (reactivateError) {
                  console.error(`Error reactivating project ${project.id}:`, reactivateError);
                } else {
                  console.log(`Successfully reactivated project ${project.id} for re-confirmed booking ${bookingData.id}`);
                }
              } else if (project.status === 'cancelled') {
                // Project exists but has no data - also reactivate it
                console.log(`Project ${project.id} exists but is cancelled with no data - reactivating`);
                
                const { error: reactivateError } = await supabase
                  .from('projects')
                  .update({ 
                    status: 'planning',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', project.id);
                
                if (reactivateError) {
                  console.error(`Error reactivating project ${project.id}:`, reactivateError);
                } else {
                  console.log(`Successfully reactivated cancelled project ${project.id}`);
                }
              }
            }
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

          // Only clear and recreate calendar events if booking data has MEANINGFULLY changed
          if (hasChanged) {
            console.log(`Recreating calendar events for changed booking ${existingBooking.id}`)
            // Clear existing calendar events
            await supabase
              .from('calendar_events')
              .delete()
              .eq('booking_id', existingBooking.id);
          }

          // PRODUCT UPDATE WITH PACKING LIST RECONNECTION
          // 1. Fetch packing project for this booking (if exists)
          const { data: packingProject } = await supabase
            .from('packing_projects')
            .select('id')
            .eq('booking_id', existingBooking.id)
            .single();
          
          // 2. Fetch existing products BEFORE deletion (for packing list reconnection)
          const { data: oldProducts } = await supabase
            .from('booking_products')
            .select('id, name, quantity')
            .eq('booking_id', existingBooking.id);
          
          // 3. Clear existing products and attachments for updated bookings
          await supabase.from('booking_products').delete().eq('booking_id', existingBooking.id)
          await supabase.from('booking_attachments').delete().eq('booking_id', existingBooking.id)

          // Store references for packing reconnection after products are created
          // Note: These variables are declared at the top of the loop
          needsPackingReconnection = !!(packingProject?.id && oldProducts && oldProducts.length > 0 && needsProductUpdate);
          packingIdForReconnection = packingProject?.id || null;
          oldProductsForReconnection = oldProducts || [];

          bookingData.id = existingBooking.id

        } else {
          // NEW BOOKING - Insert only if truly new
          console.log(`Inserting new booking ${bookingData.id}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)
          
          const { error: insertError } = await supabase
            .from('bookings')
            .insert(bookingData)

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

          results.new_bookings.push(bookingData.id)
        }

        // Process products with parent-child relationship tracking
        if (externalBooking.products && Array.isArray(externalBooking.products)) {
          console.log(`Processing ${externalBooking.products.length} raw products for booking ${bookingData.id}`)
          
          // DEDUPLICATE: External API sometimes sends duplicate rows - merge by name + parent
          const deduplicatedProducts: any[] = [];
          const productKeyMap = new Map<string, number>(); // key -> index in deduplicatedProducts
          
          for (const product of externalBooking.products) {
            const name = (product.name || product.product_name || '').trim();
            const parentId = product.parent_product_id || product.parent_package_id || 'root';
            const key = `${name}::${parentId}`;
            
            if (productKeyMap.has(key)) {
              // Merge: add quantities
              const existingIdx = productKeyMap.get(key)!;
              deduplicatedProducts[existingIdx].quantity = 
                (deduplicatedProducts[existingIdx].quantity || 1) + (product.quantity || 1);
              console.log(`[Dedup] Merged duplicate "${name}" - new quantity: ${deduplicatedProducts[existingIdx].quantity}`);
            } else {
              productKeyMap.set(key, deduplicatedProducts.length);
              deduplicatedProducts.push({ ...product, quantity: product.quantity || 1 });
            }
          }
          
          console.log(`Processing ${deduplicatedProducts.length} deduplicated products for booking ${bookingData.id}`);
          
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
                name: productName,
                quantity: quantity,
                notes: product.notes || product.description || null,
                unit_price: unitPrice,
                total_price: totalPrice,
                parent_product_id: resolvedParentId || undefined,
                is_package_component: isPkgComponent || false,
                // parent_package_id is stored as text (no FK constraint) so it's safe to store external IDs
                parent_package_id: isPkgComponent ? (product.parent_package_id || null) : null,
                sku: product.sku || product.inventory_item_type_id || product.article_number || null,
                // Cost fields for budget calculation
                labor_cost: laborCost,
                material_cost: materialCost,
                setup_hours: setupHours,
                external_cost: externalCost,
                cost_notes: costNotes
              }

              const { data: insertedProduct, error: productError } = await supabase
                .from('booking_products')
                .insert(productData)
                .select('id')
                .single()

              if (productError) {
                console.error(`Error inserting product for booking ${bookingData.id}:`, productError)
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
                      console.error(`Error attaching pending children to ${insertedProduct.id}:`, pendingUpdateError);
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
                
                // If this is a parent product (not an accessory and not a package component), store its ID for subsequent accessories
                if (!isAccessory && !isPkgComponent && insertedProduct) {
                  lastParentProductId = insertedProduct.id;
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
                quantity_packed: 0
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
              const attachmentData: AttachmentData = {
                booking_id: bookingData.id,
                url: attachment.url || attachment.file_url,
                file_name: attachment.file_name || attachment.name || 'Unknown File',
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

        results.imported++

        // SMART CALENDAR EVENT HANDLING - CREATE EVENTS FOR ALL CONFIRMED BOOKINGS (INCLUDING HISTORICAL)
        if (bookingData.status === 'CONFIRMED') {
          // Check if calendar events already exist for this booking
          const { data: existingEvents } = await supabase
            .from('calendar_events')
            .select('id, event_type, start_time, booking_id, resource_id')
            .eq('booking_id', bookingData.id)

          const existingEventTypes = new Set(existingEvents?.map(e => e.event_type) || [])
          console.log(`Found ${existingEvents?.length || 0} existing calendar events for booking ${bookingData.id}`)

          const calendarEvents = []
          
          // Only create events that don't already exist OR that aren't manually assigned
          if (bookingData.rigdaydate && !existingEventTypes.has('rig')) {
            const startTime = `${bookingData.rigdaydate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'rig')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'rig',
              delivery_address: bookingData.deliveryaddress,
              date: bookingData.rigdaydate
            })
          }

          if (bookingData.eventdate && !existingEventTypes.has('event')) {
            const startTime = `${bookingData.eventdate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'event')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'event',
              delivery_address: bookingData.deliveryaddress,
              date: bookingData.eventdate
            })
          }

          if (bookingData.rigdowndate && !existingEventTypes.has('rigDown')) {
            const startTime = `${bookingData.rigdowndate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'rigDown')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'rigDown',
              delivery_address: bookingData.deliveryaddress,
              date: bookingData.rigdowndate
            })
          }

          if (calendarEvents.length > 0) {
            console.log(`Creating ${calendarEvents.length} new calendar events for booking ${bookingData.id}${isHistoricalImport ? ' (HISTORICAL)' : ''}`)

            // Use smart team assignment for each event
            for (const event of calendarEvents) {
              const assignedTeam = await getNextTeamAssignment(supabase, event.event_type, event.date, bookingData.id);
              
              // Track team distribution
              if (results.team_distribution[assignedTeam] !== undefined) {
                results.team_distribution[assignedTeam]++;
              }

              console.log(`Assigning ${event.event_type} event to ${assignedTeam} for booking ${bookingData.id} on ${event.date}`);

              const { error: eventError } = await supabase
                .from('calendar_events')
                .upsert({
                  booking_id: event.booking_id,
                  booking_number: event.booking_number,
                  title: event.title,
                  start_time: event.start_time,
                  end_time: event.end_time,
                  event_type: event.event_type,
                  delivery_address: event.delivery_address,
                  resource_id: assignedTeam
                })

              if (eventError) {
                console.error(`Error creating calendar event:`, eventError)
              } else {
                results.calendar_events_created++
              }
            }
          } else {
            console.log(`No new calendar events needed for booking ${bookingData.id}`)
          }
          
          // Sync warehouse calendar events for confirmed bookings with dates
          if (bookingData.rigdaydate || bookingData.eventdate || bookingData.rigdowndate) {
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData);
            results.warehouse_events_created += warehouseEventsCreated;
          }
          
          // Create packing project for confirmed bookings
          const packingCreated = await createPackingForBooking(supabase, bookingData);
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

    // SAVE SYNC TIMESTAMP using UPSERT - but only for non-historical imports
    const finalTimestamp = new Date().toISOString()
    console.log(`Saving sync timestamp: ${finalTimestamp}`)
    console.log(`Team distribution summary:`, results.team_distribution)
    console.log(`Unchanged bookings skipped: ${results.unchanged_bookings_skipped.length}`)
    
    // Only update sync timestamp for non-historical imports
    if (!isHistoricalImport) {
      const { error: syncError } = await supabase
        .from('sync_state')
        .upsert({
          sync_type: 'booking_import',
          last_sync_timestamp: finalTimestamp,
          last_sync_mode: syncMode,
          last_sync_status: results.failed > 0 ? 'partial_success' : 'success',
          metadata: { results },
          updated_at: finalTimestamp
        })

      if (syncError) {
        console.error('Error saving sync state:', syncError)
      } else {
        console.log('Sync timestamp saved successfully')
      }
    } else {
      console.log('Historical import: NOT updating sync timestamp to preserve incremental sync state')
    }

    console.log('Import results:', {
      total: results.total,
      imported: results.imported,
      new_bookings: results.new_bookings.length,
      updated_bookings: results.updated_bookings.length,
      unchanged_skipped: results.unchanged_bookings_skipped.length,
      duplicates_skipped: results.duplicates_skipped.length,
      cancelled_skipped: results.cancelled_bookings_skipped.length,
      calendar_events_created: results.calendar_events_created,
      warehouse_events_created: results.warehouse_events_created,
      packing_projects_created: results.packing_projects_created,
      team_distribution: results.team_distribution,
      mode: isHistoricalImport ? 'HISTORICAL' : syncMode
    })

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Import error:', error)
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

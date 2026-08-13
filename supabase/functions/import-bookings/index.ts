// @ts-nocheck
// Import bookings from external API - filters out bookings before 2026-01-01
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeBookingStatus } from '../_shared/booking-status.ts'
import { createBatch, attachJobsToBatch } from '../_shared/syncBatch.ts'
import {
  buildSingleBookingEnvelope,
  deriveSingleBookingOutcome,
} from '../_shared/singleBookingResult.ts'
import {
  parseSingleBookingSourceResponse,
  evaluateDestructiveAction,
} from '../_shared/singleBookingSource.ts'
// STEG 3L: import-bookings importerar MEDVETET INTE cancellation-handlern.
// Normal sync får aldrig utföra destruktiv cancellation.
import {
  logBlockedCancellation,
  CANCELLATION_REQUIRES_EXPLICIT_APPLY,
} from '../_shared/destructiveSyncFlag.ts'
import { loadAppliedSourceRevision, recordAppliedSourceRevision } from '../_shared/appliedSourceRevision.ts'
import {
  normalizeIncomingRevision,
  reserveCanonicalRevision,
  commitCanonicalRevision,
  releaseCanonicalRevision,
  startLeaseRenewal,
  LeaseOwnershipLostError,
} from '../_shared/canonicalRevisionGuard.ts'
import type { LeaseControl } from '../_shared/canonicalRevisionGuard.ts'
import {
  readProductSourceCompleteness,
  canDeleteProducts,
  diffProducts,
  planPackingReconnect,
  PRODUCT_DESTRUCTIVE_BLOCKED_LOG,
} from '../_shared/productCompleteness.ts'
import type { ProductSourceCompleteness } from '../_shared/productCompleteness.ts'
import {
  buildDatePresence,
  canDeleteCanonicalDateEvent,
  canMutateCalendar,
  dedupeDesiredEvents,
  eventCanonicalDate,
  fallbackCalendarContext,
  isBookingGeneratedEvent,
  readDateSourceCompleteness,
  CALENDAR_DESTRUCTIVE_BLOCKED_LOG,
  CALENDAR_MUTATION_BLOCKED_LOG,
} from '../_shared/calendarSourceAuthority.ts'
import type { CalendarSyncContext } from '../_shared/calendarSourceAuthority.ts'
import {
  canMutateProjection,
  buildProjectionPatch,
  hasProjectionChanges,
  assertNoProtectedFields,
  PROJECTION_MUTATION_BLOCKED_LOG,
} from '../_shared/projectionSourceAuthority.ts'
import type { ProjectionSyncContext } from '../_shared/projectionSourceAuthority.ts'
// STEG 3G — observability: audit, counters, circuit breaker, dry-run, anomalier.
import {
  createSyncCounters,
  createDryRunClient,
  createSafetyGuardedClient,
  resolveDryRun,
  logSyncAudit,
  detectSyncAnomalies,
  logAnomalies,
  SafetyCircuitBreakerError,
  SAFETY_LIMITS,
  SAFETY_CIRCUIT_BREAKER,
  guardedDeleteByIds,
  guardedDeleteWhere,
  UnknownDestructiveRowCountError,
  UNKNOWN_DESTRUCTIVE_ROW_COUNT,
  UNKNOWN_RPC_IN_DRY_RUN,
} from '../_shared/syncObservability.ts'
// STEG 4G: global kill switch + per-org metrics (ren diagnostik).
import {
  resolveMutatingSyncPause,
  logSyncBlock,
  MUTATING_SYNC_PAUSED,
} from '../_shared/syncKillSwitch.ts'
import {
  OrgMetricsRegistry,
} from '../_shared/syncOpsMetrics.ts'
import type { SyncCounters } from '../_shared/syncObservability.ts'
import { SyncPerfTracker, verboseProductLogging } from '../_shared/syncPerf.ts'

/** STEG 4E: verbose per-produkt-loggning är dyr → default AV (SYNC_DEBUG_PRODUCTS=true slår på). */
const VERBOSE_PRODUCT_LOGS = verboseProductLogging();

/**
 * STEG 3I: counters hämtas från den guardade klienten så att varje
 * destruktiv kodväg kan deklarera sitt VERKLIGA radantal före mutation.
 */
const countersOf = (client: any): SyncCounters => (client?.__syncCounters ?? createSyncCounters());



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
  title?: string | null;
  rigdaydate?: string;
  eventdate?: string;
  rigdowndate?: string;
  rig_start_time?: string;
  rig_end_time?: string;
  event_start_time?: string;
  event_end_time?: string;
  rigdown_start_time?: string;
  rigdown_end_time?: string;
  // External (Booking-system) snapshot — never written by planner UI
  rig_start_time_external?: string | null;
  rig_end_time_external?: string | null;
  event_start_time_external?: string | null;
  event_end_time_external?: string | null;
  rigdown_start_time_external?: string | null;
  rigdown_end_time_external?: string | null;
  // Lock flags — true means time is "fast" and cannot be moved in calendar
  rig_time_locked?: boolean;
  event_time_locked?: boolean;
  rigdown_time_locked?: boolean;
  // Full date arrays for multi-day support (calendar level only)
  allRigDates?: string[];
  allEventDates?: string[];
  allRigdownDates?: string[];
  deliveryaddress?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  carry_more_than_10m?: boolean;
  ground_nails_allowed?: boolean;
  exact_time_needed?: boolean;
  exact_time_info?: string;
  rental_only?: boolean;
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
 * Compute Europe/Stockholm UTC offset (in minutes) for a given wall-clock instant.
 * DST-aware: returns 60 for CET, 120 for CEST. Uses Intl.DateTimeFormat which is
 * available in the Deno runtime.
 */
const stockholmOffsetMinutes = (date: string, time: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) return 60;
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(utcGuess)).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const wallUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, ss || 0);
  return Math.round((wallUtc - utcGuess) / 60000);
};

/** Format an offset in minutes as `+HH:MM` / `-HH:MM`. */
const formatOffset = (offsetMin: number): string => {
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

/**
 * Build a datetime string from a date and an explicit time value.
 * Naiv strategi: vi appendar +00:00 så Postgres accepterar det som timestamptz
 * utan att skifta värdet. "08:00" lagras som "08:00:00+00" och visas som 08:00.
 */
const buildDateTimeFromPartsEx = (
  date: string,
  explicitTime: unknown,
  fallbackTime = '08:00:00'
): { dateTime: string; isExplicit: boolean } => {
  const extracted = extractTimePart(explicitTime);
  const time = extracted || fallbackTime;
  return { dateTime: `${date}T${time}+00:00`, isExplicit: !!extracted };
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
      .upsert(
        { booking_id: bookingId, url, file_name: fileName, file_type: fileType, organization_id: orgId, source: 'import' },
        { onConflict: 'booking_id,file_name', ignoreDuplicates: true }
      );
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
 * Reducerad till en ren "extract unique booking_ids"-hjälpare. Själva
 * jobbskapandet + batch-kopplingen sköts av `attachJobsToBatch` i
 * `_shared/syncBatch.ts` som gör upsert med partial unique index och kopplar
 * via `sync_batch_jobs` (many-to-many). Detta löser coalescing när samma
 * bokning redan har ett aktivt jobb från en tidigare batch — det jobbet
 * adopteras av den nya batchen i stället för att en dublett skapas.
 */
function collectSyncBookingIds(bookings: any[]): string[] {
  return Array.from(new Set(
    (bookings || [])
      .map((booking) => typeof booking?.id === 'string' ? booking.id.trim() : '')
      .filter(Boolean)
  ));
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
      .upsert(events, { onConflict: 'organization_id,booking_id,event_type', ignoreDuplicates: false });
    
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
 *
 * STEG 3F:
 * - Mutation gate (source found + revision + lease + org/booking) före all skrivning.
 * - Explicit allowlist-patch: endast Booking-ägda fält skrivs, aldrig WMS-ägd packstatus.
 * - Saknat fält i partial source-response nollar aldrig befintlig data.
 * - Tenant-scoped queries (organization_id + booking_id) och strukturerade fel.
 */
const createPackingForBooking = async (
  supabase: any,
  booking: any,
  orgId: string,
  ctx?: ProjectionSyncContext,
): Promise<{ created: boolean; error?: string }> => {
  console.log(`[Packing] Checking if packing exists for booking ${booking.id}`);

  const projectionCtx: ProjectionSyncContext = ctx ?? {
    sourceFound: false,
    revisionValidated: false,
    leaseOwned: false,
    organizationId: orgId,
    bookingId: booking.id,
  };
  const gate = canMutateProjection(projectionCtx);
  if (!gate.allowed) {
    console.warn(`[Packing] ${PROJECTION_MUTATION_BLOCKED_LOG} booking ${booking.id}: ${gate.reason} → 0 projection mutations`);
    return { created: false };
  }

  const clientName = booking.client || 'Okänd kund';
  const eventDate = booking.eventdate ? new Date(booking.eventdate).toLocaleDateString('sv-SE') : '';
  const packingName = eventDate ? `${clientName} - ${eventDate}` : clientName;

  // Allowlist: endast Booking-ägda fält. undefined = fältet saknas i källan → rör inte.
  const bookingOwnedSource: Record<string, unknown> = {
    name: packingName,
    client_name: booking.client ?? undefined,
    start_date: booking.rigdaydate ?? undefined,
    end_date: booking.rigdowndate ?? undefined,
    delivery_address: booking.deliveryaddress ?? undefined,
    notes: booking.internalnotes ?? undefined,
  };
  const { patch: syncFields, blockedProtected } = buildProjectionPatch('packing_projects', bookingOwnedSource);
  if (blockedProtected.length > 0) {
    console.warn(`[Packing] ${PROJECTION_MUTATION_BLOCKED_LOG} booking ${booking.id}: blocked fields ${blockedProtected.join(',')}`);
  }
  assertNoProtectedFields('packing_projects', syncFields);

  // Check if packing already exists for this booking (tenant-scoped)
  const { data: existingPacking, error: checkError } = await supabase
    .from('packing_projects')
    .select('id')
    .eq('booking_id', booking.id)
    .eq('organization_id', orgId)
    .limit(1);
  
  if (checkError) {
    console.error(`[Packing] Error checking existing packing:`, checkError);
    return { created: false, error: checkError.message || String(checkError) };
  }
  
  if (existingPacking && existingPacking.length > 0) {
    // Idempotent update: endast Booking-ägda fält, WMS-ägd status/scan/kontroll rörs aldrig.
    if (!hasProjectionChanges(syncFields)) {
      console.log(`[Packing] No booking-owned changes for booking ${booking.id} — skipping update`);
      return { created: false };
    }
    console.log(`[Packing] Updating existing packing for booking ${booking.id} (fields: ${Object.keys(syncFields).join(',')})`);
    const { error: updateError } = await supabase
      .from('packing_projects')
      .update({ ...syncFields, updated_at: new Date().toISOString() })
      .eq('id', existingPacking[0].id)
      .eq('booking_id', booking.id)
      .eq('organization_id', orgId);
    if (updateError) {
      console.error(`[Packing] Error updating packing project:`, updateError);
      return { created: false, error: updateError.message || String(updateError) };
    }
    return { created: false };
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
    return { created: false, error: insertError?.message || 'packing_project_insert_failed' };
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
  
  return { created: true };
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
  tags?: string[];
  tags_en?: string[];
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
  const timeWithMaybeOffset = startTime.split('T')[1] || '08:00:00';
  // Strip any trailing offset (+HH:MM, -HH:MM or Z) before arithmetic
  const timePart = timeWithMaybeOffset.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  const [hh, mm, ss] = timePart.split(':').map(Number);

  const totalMinutes = hh * 60 + mm + (hoursToAdd * 60);
  const endHH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const endMM = String(Math.floor(totalMinutes % 60)).padStart(2, '0');
  const endSS = String(ss || 0).padStart(2, '0');
  const endTime = `${endHH}:${endMM}:${endSS}`;

  // Naiv: lagra som +00:00 så Postgres inte skiftar wall-clock-värdet.
  return `${datePart}T${endTime}+00:00`;
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
  calendarCtx: CalendarSyncContext = fallbackCalendarContext(),
): Promise<{ ok: boolean; error?: string }> {
  if (bookingData.status !== 'CONFIRMED') return { ok: true };

  // ── STEG 3E: MUTATION GATE ──────────────────────────────────────────────
  // Ingen kalendermutation innan kontrakt + revision + lease är validerade.
  const mutationGate = canMutateCalendar(calendarCtx);
  if (!mutationGate.allowed) {
    console.warn(`[Calendar Reconcile] ${CALENDAR_MUTATION_BLOCKED_LOG} booking ${bookingData.id}: ${mutationGate.reason} → 0 calendar mutations`);
    return { ok: true };
  }
  const calendarOrgId = bookingData.organization_id || organizationId;
  let calendarError: string | null = null;

  // ── PLANNING-STATUS GUARD ──────────────────────────────────────────────
  // Nyskapade projekt börjar med planning_status='needs_planning' och hanteras
  // i UI-containern "Att planera" innan de hamnar i kalendern. Reconcilern
  // får INTE materialisera calendar_events för dessa — användaren sätter
  // tider och team manuellt i ProjectPlanningSheet, vilket flippar status
  // till 'planned'. Befintliga projekt har redan satts till 'planned' av
  // migrationen, så detta påverkar bara nya projekt.
  // STEG 3N: alla beslutsgrundade reads nedan är tenant-isolerade
  // (booking_id/id + organization_id). Ingen global fallback tillåts, och ett
  // DB-fel får aldrig tolkas som "ingen koppling finns" → fail-closed (skip).
  try {
    const { data: linkedProject, error: linkedProjectErr } = await supabase
      .from('projects')
      .select('planning_status')
      .eq('booking_id', bookingData.id)
      .eq('organization_id', calendarOrgId)
      .maybeSingle();
    if (linkedProjectErr) {
      console.error(`[Calendar Reconcile] FAIL-CLOSED booking ${bookingData.id}: project planning_status read failed`, linkedProjectErr);
      return { ok: true };
    }
    if (linkedProject?.planning_status === 'needs_planning') {
      console.log(`[Calendar Reconcile] SKIP booking ${bookingData.id}: linked project is needs_planning`);
      return { ok: true };
    }
    const { data: parentForLP, error: parentForLPErr } = await supabase
      .from('bookings')
      .select('large_project_id')
      .eq('id', bookingData.id)
      .eq('organization_id', calendarOrgId)
      .maybeSingle();
    if (parentForLPErr) {
      console.error(`[Calendar Reconcile] FAIL-CLOSED booking ${bookingData.id}: parent booking read failed`, parentForLPErr);
      return { ok: true };
    }
    if (parentForLP?.large_project_id) {
      // Parent-bokningen är redan tenant-verifierad ovan → LP-lookupen scopas
      // dessutom på organization_id (kolumnen finns på large_projects).
      const { data: lp, error: lpErr } = await supabase
        .from('large_projects')
        .select('planning_status')
        .eq('id', parentForLP.large_project_id)
        .eq('organization_id', calendarOrgId)
        .maybeSingle();
      if (lpErr) {
        console.error(`[Calendar Reconcile] FAIL-CLOSED booking ${bookingData.id}: large_project planning_status read failed`, lpErr);
        return { ok: true };
      }
      if (lp?.planning_status === 'needs_planning') {
        console.log(`[Calendar Reconcile] SKIP booking ${bookingData.id}: large project ${parentForLP.large_project_id} is needs_planning`);
        return { ok: true };
      }
    }

    // NEW: Skydda nya oplanerade bokningar. Om bokningen varken har ett länkat
    // project eller large_project ÄNNU, och inga calendar_events finns för den,
    // så är det en ny bokning som ska igenom "Att planera"-flödet. Frontend
    // skapar projektet asynkront (med default needs_planning), men reconcilern
    // kan hinna före. Skippa då tills någon koppling/planering finns.
    if (!linkedProject && !parentForLP?.large_project_id) {
      const { count: existingCeCount, error: ceCountErr } = await supabase
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingData.id)
        .eq('organization_id', calendarOrgId)
        .neq('event_type', 'activity');
      if (ceCountErr) {
        console.error(`[Calendar Reconcile] FAIL-CLOSED booking ${bookingData.id}: calendar_events count read failed`, ceCountErr);
        return { ok: true };
      }
      if (!existingCeCount || existingCeCount === 0) {
        console.log(`[Calendar Reconcile] SKIP booking ${bookingData.id}: no linked project/large_project and no existing events (awaiting manual planning)`);
        return { ok: true };
      }
    }
  } catch (planningGuardErr) {
    console.error('[Calendar Reconcile] FAIL-CLOSED planning_status guard threw:', planningGuardErr);
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────────────────

  // 1. Fetch ALL existing calendar events for this booking
  // NOTE: Exclude event_type='activity' — those are user-created activity syncs
  // (establishment_tasks → calendar_events) and must NOT be touched by the reconciler.
  const { data: existingEvents } = await supabase
    .from('calendar_events')
    .select('id, event_type, start_time, end_time, title, booking_number, delivery_address, resource_id, source_date, times_locked')
    .eq('booking_id', bookingData.id)
    .eq('organization_id', bookingData.organization_id || organizationId)
    .neq('event_type', 'activity');

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

  let rigDates = bookingData.allRigDates && bookingData.allRigDates.length > 0
    ? bookingData.allRigDates : (bookingData.rigdaydate ? [bookingData.rigdaydate] : []);
  let eventDates = bookingData.allEventDates && bookingData.allEventDates.length > 0
    ? bookingData.allEventDates : (bookingData.eventdate ? [bookingData.eventdate] : []);
  let rigdownDates = bookingData.allRigdownDates && bookingData.allRigdownDates.length > 0
    ? bookingData.allRigdownDates : (bookingData.rigdowndate ? [bookingData.rigdowndate] : []);

  // ── EXTRA-DAY EXPANSION (from existing calendar_events only) ───────────
  // Tidigare användes booking_staff_assignments som källa för "extra dagar"
  // utöver det externa Booking-systemets rigdaydate/rigdowndate. Det vände
  // dataflödet bakvänt: BSA ska SPEGLA calendar_events (calendar-team-model-v1),
  // inte styra vilka datum som finns. När externa systemet flyttade ett rigdag
  // (t.ex. 2026-06-03 → 2026-06-04) återuppstod den gamla 06-03-raden eftersom
  // BSA låg kvar — calendar_events blev permanent stale.
  //
  // Ny regel: extra calendar_events-rader (skapade via planner-UI:t
  // AddRiggDayDialog m.fl.) bevaras endast om deras source_date ligger INOM
  // bokningens externa fönster [min(rig, event, rigdown), max(...)]. Datum
  // utanför fönstret betraktas som stale och raderas i steg 5.
  try {
    const allBookingDates: string[] = [
      ...(bookingData.rigdaydate ? [bookingData.rigdaydate] : []),
      ...(bookingData.eventdate ? [bookingData.eventdate] : []),
      ...(bookingData.rigdowndate ? [bookingData.rigdowndate] : []),
      ...rigDates, ...eventDates, ...rigdownDates,
    ].filter(Boolean).sort();
    const windowStart = allBookingDates[0];
    const windowEnd = allBookingDates[allBookingDates.length - 1];

    if (windowStart && windowEnd) {
      const rigSet = new Set<string>(rigDates);
      const evSet = new Set<string>(eventDates);
      const downSet = new Set<string>(rigdownDates);
      const evDate = bookingData.eventdate as string | null;

      for (const ev of (existingEvents || [])) {
        if (ev.event_type !== 'rig' && ev.event_type !== 'rigDown') continue;
        const d = (ev.source_date as string | null) || (ev.start_time as string | null)?.slice(0, 10) || '';
        if (!d) continue;
        if (d < windowStart || d > windowEnd) continue; // utanför fönster = stale
        if (rigSet.has(d) || evSet.has(d) || downSet.has(d)) continue;
        if (ev.event_type === 'rigDown' || (evDate && d > evDate)) downSet.add(d);
        else rigSet.add(d);
      }

      rigDates = Array.from(rigSet).sort();
      rigdownDates = Array.from(downSet).sort();
      console.log(`[Calendar Reconcile] In-window extra-day expansion for ${bookingData.id} (${windowStart}..${windowEnd}): rig=${rigDates.length}, rigDown=${rigdownDates.length}`);
    }
  } catch (expandErr) {
    console.error(`[Calendar Reconcile] In-window expansion failed:`, expandErr);
  }
  // ────────────────────────────────────────────────────────────────────────

  // ── LARGE PROJECT OVERRIDE ──────────────────────────────────────────────
  // If this booking belongs to a "Projekt stort" (large_projects), the project
  // owns the authoritative multi-day schedule. We CONSOLIDATE: only ONE
  // representative sub-booking per LP writes calendar_events. All other
  // sub-bookings skip phase-event creation entirely (logged via
  // [large-project-booking-phase-skipped]). The planner derivation already
  // groups by (largeProjectId, phase, date, team) so the rep row is enough
  // to render the project tile; sibling bookings are exposed as metadata.
  let isLargeProjectRep = false;
  let largeProjectIdForGuard: string | null = null;
  try {
    // STEG 3N: parent-bokningen måste vara tenant-verifierad innan dess
    // large_project_id får användas. Ingen global fallback.
    const { data: parentBooking, error: parentBookingErr } = await supabase
      .from('bookings')
      .select('large_project_id')
      .eq('id', bookingData.id)
      .eq('organization_id', calendarOrgId)
      .maybeSingle();
    if (parentBookingErr) throw parentBookingErr;
    let lpId: string | null = parentBooking?.large_project_id ?? null;
    if (!lpId) {
      const { data: lpbRow, error: lpbErr } = await supabase
        .from('large_project_bookings')
        .select('large_project_id')
        .eq('booking_id', bookingData.id)
        .eq('organization_id', calendarOrgId)
        .maybeSingle();
      if (lpbErr) throw lpbErr;
      lpId = lpbRow?.large_project_id ?? null;
    }
    if (lpId) {
      largeProjectIdForGuard = lpId;
      // Find ALL sibling booking_ids in this LP (master = large_project_bookings,
      // fallback = bookings.large_project_id) and pick the lexicographically
      // smallest UUID as the deterministic rep.
      const [{ data: lpbRows, error: lpbRowsErr }, { data: bRows, error: bRowsErr }] = await Promise.all([
        supabase.from('large_project_bookings').select('booking_id').eq('large_project_id', lpId).eq('organization_id', calendarOrgId),
        supabase.from('bookings').select('id').eq('large_project_id', lpId).eq('organization_id', calendarOrgId),
      ]);
      if (lpbRowsErr || bRowsErr) throw (lpbRowsErr || bRowsErr);

      const siblingIds = new Set<string>([
        bookingData.id,
        ...((lpbRows || []).map((r: any) => r.booking_id).filter(Boolean)),
        ...((bRows || []).map((r: any) => r.id).filter(Boolean)),
      ]);
      const repId = Array.from(siblingIds).sort()[0];
      isLargeProjectRep = repId === bookingData.id;

      if (!isLargeProjectRep) {
        // Skip ALL phase-event creation for non-rep sub-bookings. Log each
        // would-be phase explicitly so we can audit Game Fair-class issues.
        const skippedPhases: Array<{ phase: string; date: string }> = [];
        for (const d of rigDates) skippedPhases.push({ phase: 'rig', date: d });
        for (const d of eventDates) skippedPhases.push({ phase: 'event', date: d });
        for (const d of rigdownDates) skippedPhases.push({ phase: 'rigDown', date: d });
        for (const sp of skippedPhases) {
          console.info('[large-project-booking-phase-skipped]', {
            booking_id: bookingData.id,
            booking_number: bookingData.booking_number || null,
            phase: sp.phase,
            date: sp.date,
            largeProjectId: lpId,
            rep_booking_id: repId,
            reason: 'booking belongs to large project; only the representative sub-booking materializes calendar_events for the LP',
          });
        }
        // Remove any pre-existing phase rows owned by this non-rep booking.
        if ((existingEvents || []).length > 0) {
          // STEG 3E: endast bevisligen Booking-genererade rader, aldrig manuella.
          const idsToDelete = (existingEvents || [])
            .filter((e: any) => isBookingGeneratedEvent(e, bookingData.id) && e.times_locked !== true)
            .map((e: any) => e.id);
          if (idsToDelete.length > 0) {
            // STEG 3I: exakt radantal + circuit breaker FÖRE mutation.
            const del = await guardedDeleteByIds(supabase, {
              table: 'calendar_events',
              ids: idsToDelete,
              kind: 'calendar_deletes',
              counters: countersOf(supabase),
              filters: { organization_id: calendarOrgId, booking_id: bookingData.id },
              ctx: { booking_id: bookingData.id, organization_id: calendarOrgId },
            });
            if (del.error) {
              console.error('[Calendar Reconcile] Failed to clean up non-rep LP phase events:', del.error);
              return { ok: false, error: `calendar_delete_failed:${del.error}` };
            }
            console.log(`[Calendar Reconcile] Cleaned ${idsToDelete.length} stale non-rep LP phase events for booking ${bookingData.id}`);
          }
        }
        return { ok: true };
      }

      // REP path: use the LP's authoritative date arrays.
      const { data: lp, error: lpReadErr } = await supabase
        .from('large_projects')
        .select('start_date, event_date, end_date')
        .eq('id', lpId)
        .eq('organization_id', calendarOrgId)
        .maybeSingle();
      if (lpReadErr) throw lpReadErr;
      const lpRig = Array.isArray(lp?.start_date) ? lp!.start_date.filter(Boolean) : [];
      const lpEvent = Array.isArray(lp?.event_date) ? lp!.event_date.filter(Boolean) : [];
      const lpDown = Array.isArray(lp?.end_date) ? lp!.end_date.filter(Boolean) : [];
      if (lpRig.length > 0) rigDates = [...new Set(lpRig)].sort();
      if (lpEvent.length > 0) eventDates = [...new Set(lpEvent)].sort();
      if (lpDown.length > 0) rigdownDates = [...new Set(lpDown)].sort();
      console.log(`[Calendar Reconcile] LP REP override for booking ${bookingData.id} (lp=${lpId}): rig=${rigDates.length}, event=${eventDates.length}, rigDown=${rigdownDates.length}`);
    }
  } catch (lpErr) {
    // STEG 3N: fail-closed — vi vet inte om bokningen tillhör ett stort projekt
    // eller vilka datum som gäller, så ingen calendar-mutation får ske.
    console.error(`[Calendar Reconcile] FAIL-CLOSED large project resolution failed:`, lpErr);
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────────────────

  const bookingTitle = (bookingData.title || '').trim();
  const clientLabel = bookingData.client || 'Bokning';
  const desiredTitle = bookingTitle ? `${bookingTitle} – ${clientLabel}` : clientLabel;

  const rentalOnly = bookingData.rental_only === true;

  for (const date of rigDates) {
    const start = buildDateTimeFromPartsEx(date, bookingData.rig_start_time);
    const end = bookingData.rig_end_time
      ? buildDateTimeFromPartsEx(date, bookingData.rig_end_time)
      : { dateTime: getEndTimeForEventType(start.dateTime, 'rig'), isExplicit: false };
    console.log(`[Calendar Time] rig ${date}: start=${start.dateTime} (${start.isExplicit ? 'EXPLICIT' : 'DEFAULT'}), end=${end.dateTime} (${end.isExplicit ? 'EXPLICIT' : 'DEFAULT'})`);
    desiredEvents.push({
      event_type: 'rig', start_time: start.dateTime, end_time: end.dateTime,
      title: rentalOnly ? `Leverans UT – ${desiredTitle}` : desiredTitle,
      booking_number: bookingData.booking_number || null,
      delivery_address: bookingData.deliveryaddress || null, date,
      isExplicitStart: start.isExplicit,
      isExplicitEnd: end.isExplicit,
      lockRequested: start.isExplicit && end.isExplicit,
      rentalOnly,
    });
  }

  // Event days are NO LONGER persisted to calendar_events.
  // The "Live" column (team-11) was removed; eventdate is kept on the booking row only.
  // Any pre-existing event-type calendar rows are treated as stale and removed by the
  // reconciliation pass below (step 5).

  for (const date of rigdownDates) {
    const start = buildDateTimeFromPartsEx(date, bookingData.rigdown_start_time);
    const end = bookingData.rigdown_end_time
      ? buildDateTimeFromPartsEx(date, bookingData.rigdown_end_time)
      : { dateTime: getEndTimeForEventType(start.dateTime, 'rigDown'), isExplicit: false };
    console.log(`[Calendar Time] rigDown ${date}: start=${start.dateTime} (${start.isExplicit ? 'EXPLICIT' : 'DEFAULT'}), end=${end.dateTime} (${end.isExplicit ? 'EXPLICIT' : 'DEFAULT'})`);
    desiredEvents.push({
      event_type: 'rigDown', start_time: start.dateTime, end_time: end.dateTime,
      title: rentalOnly ? `Retur IN – ${desiredTitle}` : desiredTitle,
      booking_number: bookingData.booking_number || null,
      delivery_address: bookingData.deliveryaddress || null, date,
      isExplicitStart: start.isExplicit,
      isExplicitEnd: end.isExplicit,
      lockRequested: start.isExplicit && end.isExplicit,
      rentalOnly,
    });
  }

  console.log(`[Calendar Reconcile] Booking ${bookingData.id}: ${desiredEvents.length} desired events (rig:${rigDates.length}, event:${eventDates.length}, rigDown:${rigdownDates.length})`);

  // ── Safety guard: empty payload + existing rows → skip reconciliation entirely
  // The Booking system occasionally returns empty date arrays mid-flight. Without
  // this guard, the reconciler would delete every event for the booking, then
  // recreate them on the next pass → flicker. We only delete events on explicit
  // CANCELLED status, never on empty payload.
  const nonActivityExisting = (existingEvents || []).filter((e: any) => e.event_type !== 'activity');
  if (desiredEvents.length === 0 && nonActivityExisting.length > 0 && bookingData.status === 'CONFIRMED') {
    console.warn(`[Calendar Reconcile] ⚠️ Booking ${bookingData.id} has ${nonActivityExisting.length} existing events but desired=0. Skipping to avoid mass-delete (likely transient empty payload from Booking API).`);
    return { ok: true };
  }

  // STEG 3E: idempotens — en desired-rad per (event_type|date).
  const dedupedDesired = dedupeDesiredEvents(desiredEvents as any[]);
  if (dedupedDesired.length !== desiredEvents.length) {
    console.log(`[Calendar Reconcile] Deduped desired events ${desiredEvents.length} → ${dedupedDesired.length} for booking ${bookingData.id}`);
  }
  desiredEvents.length = 0;
  desiredEvents.push(...(dedupedDesired as any[]));

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

      // STABILITY: never move a non-explicit (default 08:00) event that's already
      // been placed by an earlier reconcile pass. The desired.start_time is just
      // a preference for *new* events. Only force a time update when the booking
      // now has an EXPLICIT time and that explicit time differs from existing.
      // LOCK GUARD: en rad som är låst ("Fast tid") ägs av användaren/Booking-låset
      // och får aldrig få sina tider omskrivna av en senare import.
      const rowLocked = existing.times_locked === true;
      const explicitTimeChanged = !rowLocked && desired.isExplicitStart && (
        existing.start_time !== desired.start_time ||
        existing.end_time !== desired.end_time
      );
      const metaChanged =
        existing.title !== desired.title ||
        existing.booking_number !== desired.booking_number ||
        existing.delivery_address !== desired.delivery_address;

      if (explicitTimeChanged || metaChanged) {
        console.log(`[Calendar Reconcile] UPDATE event ${existing.id} (${desired.event_type} on ${desired.date}): ${explicitTimeChanged ? 'explicit time' : 'meta'} changed`);
        const updatePayload: any = {
          title: desired.title,
          booking_number: desired.booking_number,
          delivery_address: desired.delivery_address,
        };
        if (explicitTimeChanged) {
          updatePayload.start_time = desired.start_time;
          updatePayload.end_time = desired.end_time;
          // Auto-lock when Booking sent explicit start+end. Never auto-unlock:
          // users may have locked manually via QuickTimeEditPopover.
          if (desired.lockRequested === true) {
            updatePayload.times_locked = true;
          }
        }
        const { error: updateErr } = await supabase
          .from('calendar_events')
          .update(updatePayload)
          .eq('id', existing.id)
          .eq('organization_id', calendarOrgId)
          .eq('booking_id', bookingData.id);

        if (updateErr) {
          console.error(`[Calendar Reconcile] Error updating event ${existing.id}:`, updateErr);
          calendarError = calendarError || `calendar_update_failed:${updateErr.message || updateErr}`;
        } else {
          results.calendar_events_created++;
        }
      } else {
        console.log(`[Calendar Reconcile] SKIP event ${existing.id} (${desired.event_type} on ${desired.date}): already correct`);
      }
    } else {
      // Rental-only: gå direkt till Lager-kolumnen (resource_id='transport'),
      // hoppa över team-1..5 round-robin helt.
      const placement = desired.rentalOnly
        ? { team: 'transport', start_time: desired.start_time, end_time: desired.end_time }
        : await assignTeamAndTime(
            supabase,
            desired.event_type,
            desired.date,
            bookingData.id,
            bookingData.organization_id || organizationId,
            desired.start_time,
            desired.end_time,
            desired.isExplicitStart,
            largeProjectIdForGuard,
          );

      if (results.team_distribution[placement.team] !== undefined) {
        results.team_distribution[placement.team]++;
      }

      console.log(`[Calendar Reconcile] CREATE ${desired.event_type} on ${desired.date} → ${placement.team} @ ${placement.start_time}${desired.rentalOnly ? ' (RENTAL_ONLY → Lager)' : ''}`);

      const { error: insertErr } = await supabase
        .from('calendar_events')
        .insert({
          booking_id: bookingData.id,
          booking_number: desired.booking_number,
          title: desired.title,
          start_time: placement.start_time,
          end_time: placement.end_time,
          event_type: desired.event_type,
          delivery_address: desired.delivery_address,
          resource_id: placement.team,
          organization_id: bookingData.organization_id || organizationId,
          source_date: desired.date,
          // Fast tid från Booking (explicit start + slut) → lås direkt.
          times_locked: desired.lockRequested === true,
        });

      if (insertErr) {
        console.error(`[Calendar Reconcile] Error creating event:`, insertErr);
        calendarError = calendarError || `calendar_insert_failed:${insertErr.message || insertErr}`;
      } else {
        results.calendar_events_created++;
      }
    }
  }

  // 5. Delete stale events — but PROTECT rows that match the booking's own
  // authoritative date columns (rigdaydate/rigdowndate). The external system
  // occasionally lags behind a local UI date change (savePhaseDays writes the
  // booking row + a new calendar_events row, but the next external import may
  // not yet reflect the change). Without this guard the reconciler deletes
  // the freshly created row as "stale", which is exactly how booking 2604-8
  // lost its rig row on 2026-05-27. See memory: booking-dates-single-source-v1.
  const localAuthoritativeKeys = new Set<string>();
  if (bookingData.rigdaydate) localAuthoritativeKeys.add(`rig|${bookingData.rigdaydate}`);
  if (bookingData.rigdowndate) localAuthoritativeKeys.add(`rigDown|${bookingData.rigdowndate}`);
  // event-days are intentionally NOT persisted (see line 1101-1104), so we
  // don't protect them here.

  // STEG 3E: canonical dates som fortfarande finns efter reconcile.
  const canonicalDatesForDelete = {
    rig: [...rigDates],
    event: [...eventDates],
    rigDown: [...rigdownDates],
  } as Record<'rig' | 'event' | 'rigDown', string[]>;

  const staleEvents = (existingEvents || []).filter((e: any) => {
    if (matchedExistingIds.has(e.id)) return false;
    const evtDate = eventCanonicalDate(e);
    const key = `${e.event_type}|${evtDate}`;

    // STEG 3E: fail-closed delete-gate (found:true + nyare revision + lease +
    // komplett/canonical datumfält + datumet saknas + bevisligen Booking-genererat).
    const deleteGate = canDeleteCanonicalDateEvent(e, calendarCtx, {
      bookingId: bookingData.id,
      canonicalDates: canonicalDatesForDelete,
    });
    if (!deleteGate.allowed) {
      console.log(`[Calendar Reconcile] ${CALENDAR_DESTRUCTIVE_BLOCKED_LOG} keep ${e.event_type}@${evtDate} (${deleteGate.reason})`);
      return false;
    }
    // LOCK GUARD: en låst dag ("Fast tid") är alltid användarens/Bookings beslut.
    // Externa importen får aldrig radera den som "stale".
    if (e.times_locked === true) {
      console.log(`[Calendar Reconcile] KEEP-LOCKED ${e.event_type}@${evtDate} (times_locked)`);
      return false;
    }
    if (localAuthoritativeKeys.has(key)) {
      console.log(`[Calendar Reconcile] KEEP-LOCAL ${e.event_type}@${evtDate} (matches booking.${e.event_type === 'rig' ? 'rigdaydate' : 'rigdowndate'}; not in external desired but locally authoritative)`);
      return false;
    }
    return true;
  });

  if (staleEvents.length > 0) {
    const staleIds = staleEvents.map((e: any) => e.id);
    console.log(`[Calendar Reconcile] DELETE ${staleEvents.length} stale events: ${staleEvents.map((e: any) => `${e.event_type}@${e.start_time?.split('T')[0]}`).join(', ')}`);
    const staleDel = await guardedDeleteByIds(supabase, {
      table: 'calendar_events',
      ids: staleIds,
      kind: 'calendar_deletes',
      counters: countersOf(supabase),
      filters: { organization_id: calendarOrgId, booking_id: bookingData.id },
      ctx: { booking_id: bookingData.id, organization_id: calendarOrgId },
    });

    if (staleDel.error) {
      console.error(`[Calendar Reconcile] Error deleting stale events:`, staleDel.error);
      calendarError = calendarError || `calendar_delete_failed:${staleDel.error}`;
    }
  }

  if (calendarError) {
    console.error(`[Calendar Reconcile] ❌ Booking ${bookingData.id} reconciliation failed: ${calendarError}`);
    return { ok: false, error: calendarError };
  }

  console.log(`[Calendar Reconcile] ✅ Booking ${bookingData.id} reconciliation complete`);

  // ── BSA RECOMPUTE ───────────────────────────────
  // Personalen tillhör teamet, bokningen flyttas mellan team. BSA är en
  // härledd spegel av staff_assignments × calendar_events.resource_id.
  // Räkna om BSA för varje datum som har antingen en calendar_events-rad
  // ELLER befintliga BSA-rader (sistnämnda för att fånga "spöken" från äldre data).
  try {
    const calendarDates = new Set<string>([
      ...desiredEvents.map((d: any) => d.date as string),
      ...((existingEvents || []) as any[]).map((e: any) => (e.source_date || (e.start_time as string)?.slice(0, 10)) as string).filter(Boolean),
    ]);

    const { data: existingBsaDates } = await supabase
      .from('booking_staff_assignments')
      .select('assignment_date')
      .eq('booking_id', bookingData.id);

    const allDates = new Set<string>([
      ...calendarDates,
      ...((existingBsaDates || []) as any[]).map((r: any) => r.assignment_date as string).filter(Boolean),
    ]);

    let recomputedAdded = 0;
    let recomputedRemoved = 0;
    for (const d of allDates) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('recompute_booking_staff_for_day', {
          p_booking_id: bookingData.id,
          p_date: d,
        });
        if (rpcErr) {
          console.warn(`[BSA Recompute] RPC error for ${bookingData.id}@${d}:`, rpcErr.message);
        } else if (rpcRes) {
          recomputedAdded += (rpcRes as any).added || 0;
          recomputedRemoved += (rpcRes as any).removed || 0;
        }
      } catch (e: any) {
        console.warn(`[BSA Recompute] Threw for ${bookingData.id}@${d}:`, e?.message || e);
      }
    }
    if (recomputedAdded || recomputedRemoved) {
      console.log(`[BSA Recompute] Booking ${bookingData.id}: +${recomputedAdded} / -${recomputedRemoved} across ${allDates.size} day(s)`);
    }
  } catch (e: any) {
    console.warn(`[BSA Recompute] Outer error for ${bookingData.id}:`, e?.message || e);
  }

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
    // Filter out activity rows from actualKeys — those are user-managed task syncs,
    // not owned by this reconciler, and would cause false "extra:" mismatches.
    const actualKeys = new Set(
      actualEventsJson
        .filter((a: any) => a.event_type !== 'activity')
        .map((a: any) => `${a.event_type}|${a.date}`)
    );
    const missingKeys = [...expectedKeys].filter((k: any) => !actualKeys.has(k));
    const extraKeys = [...actualKeys].filter((k: any) => !expectedKeys.has(k as string));

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

  return { ok: true };
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
/**
 * Add minutes to a `YYYY-MM-DDTHH:MM:SS` string without timezone conversion.
 */
const addMinutesToDateTime = (dateTime: string, minutes: number): string => {
  const datePart = dateTime.split('T')[0];
  const timePart = dateTime.split('T')[1] || '00:00:00';
  const [hh, mm, ss] = timePart.split(':').map(Number);
  const total = hh * 60 + mm + minutes;
  const endHH = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const endMM = String(Math.floor(total % 60)).padStart(2, '0');
  const endSS = String(ss || 0).padStart(2, '0');
  return `${datePart}T${endHH}:${endMM}:${endSS}`;
};

/**
 * Calculate the earliest non-overlapping start time on a given team.
 * Walks through team's events in chronological order and returns the first
 * gap large enough to fit `durationMin` starting at or after `preferredStart`.
 */
const earliestSlotForTeam = (
  teamEvents: Array<{ start: Date; end: Date }>,
  preferredStart: Date,
  durationMin: number
): Date => {
  // Sort by start time
  const sorted = [...teamEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
  let candidate = new Date(preferredStart);
  const durationMs = durationMin * 60 * 1000;

  // Walk forward: any event that overlaps the candidate window pushes start to event.end
  let changed = true;
  while (changed) {
    changed = false;
    for (const ev of sorted) {
      const candidateEnd = new Date(candidate.getTime() + durationMs);
      if (candidate < ev.end && candidateEnd > ev.start) {
        // overlap → push candidate to ev.end
        candidate = new Date(ev.end);
        changed = true;
      }
    }
  }
  return candidate;
};

/**
 * Decide BOTH the team and the actual start/end time for a new calendar event.
 *
 * - Explicit start: keep the time, find first team without overlap.
 * - Default (08:00) start: stack sequentially per team. Choose the team where
 *   the new event can start earliest. Tie-break: lowest team number.
 *
 * Returns `null` if assignment cannot be computed (caller falls back to defaults).
 */
const assignTeamAndTime = async (
  supabase: any,
  eventType: string,
  eventDate: string,
  bookingId: string,
  organizationId: string,
  startTime: string,
  endTime: string,
  isExplicitStart: boolean,
  largeProjectId: string | null = null,
): Promise<{ team: string; start_time: string; end_time: string }> => {
  if (eventType === 'event') {
    console.warn(`[Team Assignment] Unexpected EVENT-type calendar request for booking ${bookingId}; Live column is removed. Falling back to round-robin.`);
  }

  const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
  const fallback = { team: 'team-1', start_time: startTime, end_time: endTime };

  // ── PROJECT TEAM STICKINESS ─────────────────────────────────────────────
  // Om bokningen (eller dess large project) redan har minst en rad på något
  // team-1..5 ska den nya dagen ÄRVA samma team. Overlap tillåts hellre än
  // att splittra projektet över flera team. Round-robin/earliest-slot körs
  // bara när bokningen är helt ny i kalendern.
  try {
    const { getStickyTeamForBooking, getStickyTeamForLargeProject } =
      await import('../_shared/team-assignment/projectTeamStickiness.ts');

    let stickyTeam: string | null = null;
    if (largeProjectId) {
      stickyTeam = await getStickyTeamForLargeProject(
        supabase, largeProjectId, organizationId, eventType, eventDate,
      );
    }
    if (!stickyTeam) {
      stickyTeam = await getStickyTeamForBooking(supabase, bookingId, organizationId);
    }
    if (stickyTeam) {
      console.log(
        `[Team Assignment] Sticky: booking ${bookingId} (lp=${largeProjectId ?? 'none'}) ` +
        `already on ${stickyTeam} → reusing for ${eventType} on ${eventDate}`,
      );
      return { team: stickyTeam, start_time: startTime, end_time: endTime };
    }
  } catch (stickyErr) {
    console.warn('[Team Assignment] stickiness lookup failed, falling back to round-robin', stickyErr);
  }
  // ────────────────────────────────────────────────────────────────────────

  try {
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('resource_id, start_time, end_time')
      .eq('organization_id', organizationId)
      .in('resource_id', teams)
      .gte('start_time', `${eventDate}T00:00:00`)
      .lt('start_time', `${eventDate}T23:59:59`);

    // Group events per team
    const perTeam = new Map<string, Array<{ start: Date; end: Date }>>();
    for (const t of teams) perTeam.set(t, []);
    (existingEvents || []).forEach((ev: any) => {
      if (!teams.includes(ev.resource_id)) return;
      perTeam.get(ev.resource_id)!.push({
        start: new Date(ev.start_time),
        end: new Date(ev.end_time),
      });
    });

    if (isExplicitStart) {
      // === EXPLICIT START: keep the time, find first team without overlap ===
      const newStart = new Date(startTime);
      const newEnd = new Date(endTime);
      for (const team of teams) {
        const hasOverlap = perTeam.get(team)!.some(ev => newStart < ev.end && newEnd > ev.start);
        if (!hasOverlap) {
          console.log(`[Team Assignment] Explicit ${startTime}: booking ${bookingId} → ${team} (no overlap)`);
          return { team, start_time: startTime, end_time: endTime };
        }
      }
      console.log(`[Team Assignment] Explicit ${startTime}: all teams busy → team-1 (overlap allowed)`);
      return fallback;
    }

    // === DEFAULT START: sequential stacking — find earliest free slot per team ===
    const preferredStart = new Date(startTime);
    const durationMin = Math.max(
      30,
      Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
    );

    let bestTeam: string | null = null;
    let bestStart: Date | null = null;
    for (const team of teams) {
      const slot = earliestSlotForTeam(perTeam.get(team)!, preferredStart, durationMin);
      if (bestStart === null || slot < bestStart) {
        bestStart = slot;
        bestTeam = team;
      }
    }

    if (!bestTeam || !bestStart) return fallback;

    // Format slot back into the same `YYYY-MM-DDTHH:MM:SS` string shape
    // (avoid Date.toISOString — it would shift to UTC).
    const slotMinutesFromMidnight =
      bestStart.getHours() * 60 + bestStart.getMinutes();
    const preferredMinutesFromMidnight =
      preferredStart.getHours() * 60 + preferredStart.getMinutes();
    const minutesShift = slotMinutesFromMidnight - preferredMinutesFromMidnight;

    const newStartStr = addMinutesToDateTime(startTime, minutesShift);
    const newEndStr = addMinutesToDateTime(endTime, minutesShift);

    console.log(
      `[Team Assignment] Stack: booking ${bookingId} → ${bestTeam} ` +
      `(preferred ${startTime} → assigned ${newStartStr})`
    );
    return { team: bestTeam, start_time: newStartStr, end_time: newEndStr };
  } catch (error) {
    console.error('Error calculating team+time assignment, falling back:', error);
    return fallback;
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
 * Check if products have changed between external and existing data.
 *
 * STEG 3D: `completeness` MÅSTE skickas in. `removed` populeras endast när
 * Booking explicit säger products_complete === true. Vid false/unknown
 * returneras removed = [] även om externa listan är kortare än den lokala.
 */
export const checkProductChanges = async (
  supabase: any,
  bookingId: string,
  externalProducts: any[],
  completeness: ProductSourceCompleteness = 'unknown',
  organizationId?: string | null,
): Promise<{
  changed: boolean;
  added: string[];
  removed: string[];
  updated: string[];
  existingProducts: any[];
  completeness: ProductSourceCompleteness;
  deleteAllowed: boolean;
  blockedRemovals: string[];
  error?: string | null;
}> => {
  // Fetch existing products (include price/notes/sku/vat/discount/tags to detect content changes,
  // not just add/remove/quantity — otherwise price-only or notes-only edits in Booking never sync)
  let query = supabase
    .from('booking_products')
    .select('id, name, quantity, unit_price, total_price, notes, sku, vat_rate, discount, tags, package_components')
    .eq('booking_id', bookingId);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data: existingProducts, error } = await query;

  if (error) {
    console.error(`Error fetching existing products for ${bookingId}:`, error);
    return {
      changed: false, added: [], removed: [], updated: [], existingProducts: [],
      completeness, deleteAllowed: false, blockedRemovals: [], error: error.message || String(error),
    };
  }

  // GUARD: Treat empty external payload as transient/missing source, NOT as deletion intent.
  const externalCount = Array.isArray(externalProducts) ? externalProducts.length : 0;
  const localCount = (existingProducts || []).length;
  if (externalCount === 0 && localCount > 0 && !canDeleteProducts(completeness)) {
    console.warn(`[Product Sync GUARD] ${PRODUCT_DESTRUCTIVE_BLOCKED_LOG} booking ${bookingId}: external products empty (completeness=${completeness}) but ${localCount} exist locally — skipping all product mutations`);
    try {
      await supabase.from('sync_audit_log').insert({
        booking_id: bookingId,
        sync_action: 'product_sync_skipped',
        booking_status: 'unknown',
        booking_dates: {},
        expected_events: { external_count: 0, local_count: localCount, reason: 'transient_empty_source', completeness },
        actual_events: {},
        events_created: 0,
        events_updated: 0,
        events_deleted: 0,
        has_mismatch: true,
        mismatch_details: 'external products empty while local has rows — destructive sync skipped',
      });
    } catch (_) { /* audit best-effort */ }
    return {
      changed: false, added: [], removed: [], updated: [],
      existingProducts: existingProducts || [],
      completeness, deleteAllowed: false, blockedRemovals: (existingProducts || []).map((p: any) => p.name),
    };
  }

  const diff = diffProducts(existingProducts || [], externalProducts || [], completeness);

  if (diff.blockedRemovals.length > 0) {
    console.warn(`[Product Sync] ${PRODUCT_DESTRUCTIVE_BLOCKED_LOG} booking ${bookingId}: ${diff.blockedRemovals.length} local products kept (completeness=${completeness})`);
  }

  if (diff.changed) {
    console.log(`[Product Changes] Booking ${bookingId}: +${diff.added.length} added, -${diff.removed.length} removed, ~${diff.updated.length} updated (completeness=${completeness})`);
  }

  return {
    changed: diff.changed,
    added: diff.added,
    removed: diff.removed,
    updated: diff.updated,
    existingProducts: existingProducts || [],
    completeness,
    deleteAllowed: diff.deleteAllowed,
    blockedRemovals: diff.blockedRemovals,
  };
};


/**
 * Update packing_list_items to reconnect to new product IDs.
 *
 * STEG 3D:
 * - Parent packing_project verifieras alltid med organization_id + booking_id.
 * - Orphaned items raderas ENDAST när products_complete === true.
 * - Lease verifieras direkt före varje destruktiv mutation.
 * - Alla DB-fel returneras (ingen tyst success).
 */
const reconnectPackingListItems = async (
  supabase: any,
  packingId: string,
  oldProducts: any[],
  newProducts: any[],
  opts: {
    completeness: ProductSourceCompleteness;
    organizationId: string;
    bookingId: string;
    assertLease?: (phase: string) => void;
  },
): Promise<{ reconnected: number; orphaned: number; blockedDeletes: number; error?: string | null }> => {
  const { completeness, organizationId, bookingId, assertLease } = opts;
  console.log(`[Packing Reconnect] Reconnecting packing list items for packing ${packingId} (completeness=${completeness})`);

  // TENANT GUARD: verifiera parent packing_project via organization_id + booking_id.
  const { data: parentPacking, error: parentError } = await supabase
    .from('packing_projects')
    .select('id')
    .eq('id', packingId)
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (parentError) {
    console.error(`[Packing Reconnect] Error verifying parent packing ${packingId}:`, parentError);
    return { reconnected: 0, orphaned: 0, blockedDeletes: 0, error: parentError.message || String(parentError) };
  }
  if (!parentPacking) {
    console.warn(`[Packing Reconnect] Parent packing ${packingId} not verified for org ${organizationId} / booking ${bookingId} — skipping`);
    return { reconnected: 0, orphaned: 0, blockedDeletes: 0 };
  }
  const verifiedPackingId = parentPacking.id;

  const { data: packingItems, error: fetchError } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id, quantity_packed, packed_by, packed_at, verified_by, verified_at')
    .eq('packing_id', verifiedPackingId);

  if (fetchError) {
    console.error(`[Packing Reconnect] Error fetching items for packing ${verifiedPackingId}:`, fetchError);
    return { reconnected: 0, orphaned: 0, blockedDeletes: 0, error: fetchError.message || String(fetchError) };
  }
  if (!packingItems || packingItems.length === 0) {
    console.log(`[Packing Reconnect] No packing items found for packing ${verifiedPackingId}`);
    return { reconnected: 0, orphaned: 0, blockedDeletes: 0 };
  }

  const plan = planPackingReconnect(packingItems, oldProducts, newProducts, completeness);

  let reconnected = 0;
  let orphaned = plan.untouched.length;
  let firstError: string | null = null;

  for (const { itemId, newProductId } of plan.updates) {
    const { error: updateError } = await supabase
      .from('packing_list_items')
      .update({ booking_product_id: newProductId })
      .eq('id', itemId)
      .eq('packing_id', verifiedPackingId);

    if (updateError) {
      console.error(`[Packing Reconnect] Error updating item ${itemId}:`, updateError);
      firstError = firstError ?? (updateError.message || String(updateError));
      orphaned++;
    } else {
      reconnected++;
    }
  }

  if (plan.deletes.length > 0) {
    // Destruktiv operation → lease måste ägas.
    assertLease?.('packing_item_delete');
    const reconnectDel = await guardedDeleteByIds(supabase, {
      table: 'packing_list_items',
      ids: plan.deletes,
      kind: 'product_deletes',
      counters: countersOf(supabase),
      filters: { packing_id: verifiedPackingId },
    });
    if (reconnectDel.error) {
      console.error(`[Packing Reconnect] Error deleting orphaned items:`, reconnectDel.error);
      firstError = firstError ?? reconnectDel.error;
    } else {
      orphaned += plan.deletes.length;
      console.log(`[Packing Reconnect] Removed ${plan.deletes.length} orphaned items (canonical complete source)`);
    }
  }

  if (plan.blockedDeletes.length > 0) {
    orphaned += plan.blockedDeletes.length;
    console.warn(`[Packing Reconnect] ${PRODUCT_DESTRUCTIVE_BLOCKED_LOG} packing ${verifiedPackingId}: kept ${plan.blockedDeletes.length} orphaned items (completeness=${completeness})`);
  }

  console.log(`[Packing Reconnect] Completed: ${reconnected} reconnected, ${orphaned} orphaned, ${plan.blockedDeletes.length} deletes blocked`);
  return { reconnected, orphaned, blockedDeletes: plan.blockedDeletes.length, error: firstError };
};


/**
 * Check if booking data has meaningfully changed
 */
const hasBookingChanged = (externalBooking: any, existingBooking: any): boolean => {
  const fields = [
    'client', 'rigdaydate', 'eventdate', 'rigdowndate', 'deliveryaddress',
    'delivery_city', 'delivery_postal_code', 'status', 'booking_number',
    'rig_start_time', 'rig_end_time', 'event_start_time', 'event_end_time',
    'rigdown_start_time', 'rigdown_end_time',
    'contact_name', 'contact_phone', 'contact_email'
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
): Promise<{ expanded: number; error?: string | null }> => {
  // Fetch all products for this booking (STEG 3N: tenant-isolerad read)
  let productQuery = supabase
    .from('booking_products')
    .select('id, name, package_components, sort_index, inventory_package_id, is_package_component')
    .eq('booking_id', bookingId);
  if (orgId) productQuery = productQuery.eq('organization_id', orgId);
  const { data: products, error } = await productQuery;

  if (error) {
    // Fail-closed: vi vet inte vilka komponenter som redan finns → expandera inte.
    // STEG 3P: read-fel returneras explicit (får inte tolkas som expanded=0).
    console.error(`[expandPackageComponents] FAIL-CLOSED read error for booking ${bookingId}:`, error);
    return { expanded: 0, error: `package_components_read_failed:${error.message || String(error)}` };
  }
  if (!products || products.length === 0) return { expanded: 0 };



  // Find parents that have package_components JSONB
  const parentsWithComponents = products.filter(
    (p: any) => p.package_components && Array.isArray(p.package_components) && p.package_components.length > 0 && p.is_package_component !== true
  );

  if (parentsWithComponents.length === 0) return { expanded: 0 };

  // Collect names of already-expanded components (strip leading "  -- " prefix)
  const existingComponentNames = new Set(
    products
      .filter((p: any) => p.is_package_component === true)
      .map((c: any) => (c.name || '').replace(/^\s*--\s*/, '').trim().toLowerCase())
  );

  let totalExpanded = 0;
  const componentErrors: string[] = [];


  for (const parent of parentsWithComponents) {
    const parentId = parent.id;
    const parentInventoryPackageId = parent.inventory_package_id || null;
    const parentSortIndex = parent.sort_index ?? 0;

    const componentsToExpand = parent.package_components.filter((comp: any) => {
      const compName = (comp.name || '').trim().toLowerCase();
      return !existingComponentNames.has(compName);
    });

    if (componentsToExpand.length === 0) {
      console.log(`[Package Expand] All components for "${parent.name}" already exist as rows`);
      continue;
    }

    console.log(`[Package Expand] Expanding ${componentsToExpand.length} components for parent "${parent.name}" (ID: ${parentId})`);

    for (let i = 0; i < componentsToExpand.length; i++) {
      const comp = componentsToExpand[i];
      const componentSortIndex = parentSortIndex + (i + 1) * 0.001;

      const componentData: ProductData = {
        booking_id: bookingId,
        organization_id: orgId || '',
        name: `  -- ${comp.name || 'Okänd komponent'}`,
        quantity: comp.quantity || 1,
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

      const { error: compError } = await supabase
        .from('booking_products')
        .insert(componentData);

      if (compError) {
        // STEG 3P: komponent-expansion är canonical projection — fel får aldrig sväljas.
        console.error(`[Package Expand] Error inserting component "${comp.name}":`, compError);
        componentErrors.push(`${comp.name || 'unknown'}:${compError.message || String(compError)}`);
      } else {
        totalExpanded++;
        existingComponentNames.add((comp.name || '').trim().toLowerCase());
        console.log(`[Package Expand] Inserted component "${comp.name}" (qty: ${comp.quantity}) for parent "${parent.name}"`);
      }
    }
  }

  return {
    expanded: totalExpanded,
    error: componentErrors.length > 0 ? `package_component_insert_failed:${componentErrors.join('|')}` : null,
  };
};


/**
 * Full sync packing list items to match booking_products.
 * - Add items for new products (alltid tillåtet)
 * - Remove items for deleted products (ENDAST vid products_complete === true)
 * - Update quantity_to_pack for changed products
 *
 * Tenant-säkert: packing_projects verifieras med organization_id + booking_id,
 * och alla item-mutationer scopeas till den verifierade parentens packing_id.
 */
const syncPackingListAfterExpansion = async (
  supabase: any,
  bookingId: string,
  orgId: string,
  opts: { completeness: ProductSourceCompleteness; assertLease?: (phase: string) => void } = { completeness: 'unknown' },
): Promise<{ changes: number; error?: string | null }> => {
  const completeness = opts.completeness ?? 'unknown';
  const deleteAllowed = canDeleteProducts(completeness);

  const { data: packingProject, error: packingError } = await supabase
    .from('packing_projects')
    .select('id, status')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (packingError) {
    console.error(`[Packing Sync] Error loading packing project for booking ${bookingId}:`, packingError);
    return { changes: 0, error: packingError.message || String(packingError) };
  }
  if (!packingProject) {
    console.log(`[Packing Sync] No packing project found for booking ${bookingId} in org ${orgId}`);
    return { changes: 0 };
  }

  const packingId = packingProject.id;
  const packingStatus = (packingProject as any)?.status || null;

  const { data: allProducts, error: productsError } = await supabase
    .from('booking_products')
    .select('id, name, quantity')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId);

  if (productsError) {
    console.error(`[Packing Sync] Error loading products for booking ${bookingId}:`, productsError);
    return { changes: 0, error: productsError.message || String(productsError) };
  }

  if (!allProducts || allProducts.length === 0) {
    if (!deleteAllowed) {
      console.warn(`[Packing Sync] ${PRODUCT_DESTRUCTIVE_BLOCKED_LOG} booking ${bookingId}: 0 products but completeness=${completeness} — keeping packing items`);
      return { changes: 0 };
    }
    const { data: remaining, error: remainingError } = await supabase
      .from('packing_list_items')
      .select('id')
      .eq('packing_id', packingId);
    if (remainingError) {
      return { changes: 0, error: remainingError.message || String(remainingError) };
    }
    if (remaining && remaining.length > 0) {
      opts.assertLease?.('packing_item_clear');
      const clearDel = await guardedDeleteByIds(supabase, {
        table: 'packing_list_items',
        ids: (remaining || []).map((r: any) => r.id),
        kind: 'product_deletes',
        counters: countersOf(supabase),
        filters: { packing_id: packingId },
      });
      if (clearDel.error) {
        console.error(`[Packing Sync] Error clearing packing list items:`, clearDel.error);
        return { changes: 0, error: clearDel.error };
      }
      console.log(`[Packing Sync] Removed all ${remaining.length} packing list items (canonical empty product list)`);
      return { changes: remaining.length };
    }
    return { changes: 0 };
  }

  const { data: existingItems, error: itemsError } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id, quantity_to_pack')
    .eq('packing_id', packingId);

  if (itemsError) {
    console.error(`[Packing Sync] Error loading packing items for packing ${packingId}:`, itemsError);
    return { changes: 0, error: itemsError.message || String(itemsError) };
  }

  const productMap = new Map(allProducts.map((p: any) => [p.id, p]));
  const existingByProductId = new Map((existingItems || []).map((i: any) => [i.booking_product_id, i]));

  let changes = 0;
  let firstError: string | null = null;

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
      firstError = firstError ?? (insertError.message || String(insertError));
    } else {
      changes += missingProducts.length;
    }
  }

  // 2. Remove items for deleted products — endast vid verifierat komplett källa
  const orphanedItems = (existingItems || []).filter((i: any) => !productMap.has(i.booking_product_id));
  if (orphanedItems.length > 0) {
    if (!deleteAllowed) {
      console.warn(`[Packing Sync] ${PRODUCT_DESTRUCTIVE_BLOCKED_LOG} packing ${packingId}: kept ${orphanedItems.length} orphaned items (completeness=${completeness})`);
    } else {
      const orphanedIds = orphanedItems.map((i: any) => i.id);
      opts.assertLease?.('packing_item_delete');
      const orphanDel = await guardedDeleteByIds(supabase, {
        table: 'packing_list_items',
        ids: orphanedIds,
        kind: 'product_deletes',
        counters: countersOf(supabase),
        filters: { packing_id: packingId },
      });
      if (orphanDel.error) {
        console.error(`[Packing Sync] Error deleting orphaned packing items:`, orphanDel.error);
        firstError = firstError ?? orphanDel.error;
      } else {
        changes += orphanedItems.length;
      }
    }
  }

  // 3. Update quantity_to_pack where product quantity changed.
  // Freeze targets once packing has started or completed so a previously
  // finished packning inte plötsligt ser ofullständig ut efter import.
  for (const [productId, item] of existingByProductId as any) {
    const product = productMap.get(productId);
    if (product && (product as any).quantity !== item.quantity_to_pack) {
      if (packingStatus === 'planning') {
        const { error: qtyError } = await supabase
          .from('packing_list_items')
          .update({ quantity_to_pack: (product as any).quantity })
          .eq('id', item.id)
          .eq('packing_id', packingId);
        if (qtyError) {
          console.error(`[Packing Sync] Error updating quantity for item ${item.id}:`, qtyError);
          firstError = firstError ?? (qtyError.message || String(qtyError));
        } else {
          changes++;
        }
      } else {
        console.warn(`[Packing Sync] Frozen quantity_to_pack for packing ${packingId} item ${item.id}: ${item.quantity_to_pack} stays despite booking quantity ${(product as any).quantity}`);
      }
    }
  }

  if (changes > 0) {
    console.log(`[Packing Sync] Completed: ${changes} total changes for booking ${bookingId}`);
  }
  return { changes, error: firstError };
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Kontraktskontext — behövs även i catch-blocket för single-booking-svar.
  let ctxIsSingle = false
  let ctxBookingId: string | null = null
  let ctxOrgId: string | null = null
  // STEG 2G/2H: reserverad canonical revision (pending) + ägarlåsets token.
  let guardedIncomingRevision: any = null
  let guardedReservationToken: string | null = null
  // STEG 2I: lease-kontrollobjekt — exponerar förlorat ägarskap till flödet.
  let leaseControl: LeaseControl | null = null
  const stopLeaseRenewal = () => { try { leaseControl?.stop() } catch { /* ignore */ } }
  /** Fail-closed ägarskapskontroll före varje mutationsfas. */
  const assertLeaseOwned = (phase: string) => { leaseControl?.assertOwned(phase) }
  // STEG 3G: safety counters + dry-run-plan, tillgängliga även i catch.
  const syncCounters = createSyncCounters()
  const plannedMutations: Record<string, number> = {}
  let isDryRun = false
  const syncStartedMs = Date.now()
  // Klienten deklareras utanför try så att catch-blocket (release av lease/
  // revision) kan använda den.
  let supabase: any = null

  try {
    // Header 'x-lovable-change-source' forwards to Postgres via PostgREST and
    // is read by the `track_booking_changes` trigger to classify this write as
    // an external Booking-source change (=> may set needs_review). Without it,
    // service_role writes are treated as internal (see migration
    // 20260720_needs_review_source_opt_in).
    const rawSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { 'x-lovable-change-source': 'booking-import' },
        },
      }
    )
    supabase = createSafetyGuardedClient(rawSupabase, syncCounters, {});

    const body = await req.json();

    // STEG 3G/3J: dry-run kräver explicit dry_run:true + exakt ett booking_id.
    // Gränserna i SAFETY_LIMITS läses aldrig från requesten.
    const dryRunResolution = resolveDryRun(body);
    isDryRun = dryRunResolution.dryRun;
    // STEG 3J FAIL-CLOSED: begärd men ogiltig dry-run får ALDRIG fortsätta live.
    // Ingen mutation, ingen cursorflytt, inget jobb completed — vi returnerar
    // ett klientfel innan någon som helst syncfas startar.
    if (dryRunResolution.requested && !dryRunResolution.dryRun) {
      console.error('[import-bookings] invalid dry_run request — aborting', JSON.stringify({
        reason: dryRunResolution.reason,
      }));
      return new Response(JSON.stringify({
        success: false,
        completed: false,
        outcome: 'invalid_dry_run_request',
        error: dryRunResolution.reason ?? 'dry_run_contract_invalid',
        dry_run: true,
        mutations: 0,
        planned_mutations: {},
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Alla skrivningar går genom en guardad klient (counters + circuit breaker).
    // I dry-run går de dessutom genom en no-op-klient: noll DB-mutationer.
    if (isDryRun) {
      supabase = createDryRunClient(supabase, plannedMutations, syncCounters);
    }




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
      skip_review = false,
    } = body;

    const importStartedAt = new Date().toISOString();

    const normalizedSingleBookingId = typeof singleBookingId === 'string'
      ? singleBookingId.trim()
      : (singleBookingId ? String(singleBookingId) : null);

    // Resolve organization_id for all INSERTs (service_role bypasses RLS, so auth.uid() is null)
    // Accept explicit organization_id from payload (sent by Hub/receive-booking)
    const explicitOrgId = body?.organization_id;
    const organizationId = await resolveOrganizationId(supabase, explicitOrgId);

    // STEG 3J: dry-run utan resolverbar organisation → fail-closed (aldrig live).
    if (isDryRun && (typeof organizationId !== 'string' || organizationId.trim().length === 0)) {
      console.error('[import-bookings] invalid dry_run request — unresolved organization');
      return new Response(JSON.stringify({
        success: false,
        completed: false,
        outcome: 'invalid_dry_run_request',
        error: 'dry_run_requires_valid_organization_id',
        dry_run: true,
        mutations: 0,
        planned_mutations: {},
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    const isHistoricalImport = historicalMode || forceHistoricalImport;
    const isSingleBookingRefresh = !!normalizedSingleBookingId;
    ctxIsSingle = isSingleBookingRefresh;
    ctxBookingId = normalizedSingleBookingId;
    ctxOrgId = organizationId;

    // ── STEG 4G: GLOBAL KILL SWITCH ──────────────────────────────────────
    // Server-side env-flagga (NORMAL_MUTATING_SYNC_PAUSED / ..._ORGS) kan pausa
    // all normal MUTERANDE Booking→Planning-sync. Default = igång (oförändrat
    // beteende). Requesten kan aldrig slå av/på flaggan. Dry-run (read-only
    // diagnostik) släpps alltid igenom. Vid paus: 0 mutationer, ingen cursor-
    // flytt, inget jobb completed, ingen revision commit.
    const pauseDecision = resolveMutatingSyncPause({
      organizationId,
      dryRun: isDryRun,
      body,
    });
    if (pauseDecision.paused) {
      logSyncBlock({
        organization_id: organizationId,
        booking_id: normalizedSingleBookingId,
        reason: pauseDecision.reason ?? MUTATING_SYNC_PAUSED,
        scope: pauseDecision.scope,
        job_id: (body?.job_id ?? null) as string | null,
        batch_id: (body?.batch_id ?? null) as string | null,
        caller: 'import-bookings',
      });
      if (isSingleBookingRefresh) {
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'mutating_sync_paused',
          error: pauseDecision.reason ?? MUTATING_SYNC_PAUSED,
        })), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        success: false,
        completed: false,
        outcome: 'mutating_sync_paused',
        error: pauseDecision.reason ?? MUTATING_SYNC_PAUSED,
        scope: pauseDecision.scope,
        mutations: 0,
        cursor_moved: false,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Per-org metrics för denna körning (loggas i slutet, muterar inget).
    const orgMetrics = new OrgMetricsRegistry();
    void orgMetrics.for(organizationId);

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
        .eq('organization_id', organizationId)
        .maybeSingle()
      
      lastSyncTimestamp = syncState?.last_sync_timestamp;
      console.log(`[import-bookings] cursor read`, JSON.stringify({
        organization_id: organizationId,
        sync_type: 'booking_import',
        last_sync_timestamp: lastSyncTimestamp,
      }));
    } else if (isHistoricalImport) {
      console.log('HISTORICAL MODE: Ignoring last sync timestamp, will import all bookings');
    }

    // Update sync state to "in_progress" using UPSERT with per-org conflict target.
    // Single-booking refreshes must NEVER touch the batch cursor/status — they are
    // per-booking side channels and would otherwise poison the incremental window.
    if (!isSingleBookingRefresh) {
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
        }, { onConflict: 'organization_id,sync_type' })

      if (syncStateError) {
        console.error('Error updating sync state:', syncStateError)
      }
    } else {
      console.log('[import-bookings] single-booking refresh — skipping sync_state in_progress upsert (cursor policy)')
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
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'failed',
          error: `Local booking fetch failed: ${localErr.message}`,
        })), {
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
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'local_fallback',
          results: {
            total: 1, imported: 0, failed: 0,
            calendar_events_created: fallbackResults.calendar_events_created,
            local_only: true,
          },
        })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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
      // Nytt explicit single-kontrakt: { success, mode:'single', found, booking?, reason?, tombstone? }
      if (payload && typeof payload === 'object' && typeof payload.found === 'boolean') {
        const rows = payload.found === true && payload.booking ? [payload.booking] : [];
        return { data: rows, raw: payload };
      }
      if (!payload?.data || !Array.isArray(payload.data)) {
        throw new Error('Invalid external API response format - expected data array')
      }
      return { ...payload, raw: payload };
    };

    // Paginated fetch for full-sync mode (not single-booking or incremental)
    const isFullSync = !isSingleBookingRefresh && syncMode !== 'incremental';
    let externalData: { data: any[]; raw?: any };

    
    if (isFullSync) {
      // Fetch ALL bookings with pagination
      let allBookings: any[] = [];
      let page = 1;
      const pageSize = 500;
      
      while (true) {
        const pageParams = new URLSearchParams(apiParams.toString());
        pageParams.set('page', String(page));
        pageParams.set('limit', String(pageSize));
        
        const pageUrl = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?${pageParams.toString()}`;
        const pageData = await fetchExternalData(pageUrl);
        allBookings = allBookings.concat(pageData.data);
        
        console.log(`[import] Page ${page}: fetched ${pageData.data.length} bookings (total so far: ${allBookings.length})`);
        
        if (pageData.data.length < pageSize) break;
        page++;
      }
      
      console.log(`[import] Total external bookings fetched: ${allBookings.length} across ${page} page(s)`);
      externalData = { data: allBookings };
    } else {
      externalData = await fetchExternalData(apiUrl);
    }

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

    // Queue ALL batch modes (incremental, full-sync, historical) to the worker
    // to avoid 150s edge function timeout. Only single-booking refresh runs inline.
    //
    // CURSOR POLICY: enqueue does NOT advance sync_state.last_sync_timestamp.
    // The cursor is only moved by process-sync-jobs when the entire batch has
    // finished successfully (via finalizeBatchIfDone). See _shared/syncBatch.ts.
    if (!isSingleBookingRefresh) {
      const queueEventType = isHistoricalImport
        ? 'booking.historical'
        : (isFullSync ? 'booking.full_sync' : (webhookEventType || 'booking.incremental'));

      // 1. Create the batch row with planned_cursor = importStartedAt.
      const batchId = await createBatch(supabase, {
        organizationId,
        syncType: 'booking_import',
        plannedCursor: importStartedAt,
        metadata: {
          event_type: queueEventType,
          sync_mode: syncMode,
          historical_mode: isHistoricalImport,
          filters: { startDate, endDate },
          fetched_from_external: externalData.data.length,
        },
      });

      // 2. Extrahera unika bokning-ids och koppla dem till batchen.
      //    attachJobsToBatch skapar ETT aktivt jobb per (org, booking) via
      //    partial unique index, adopterar befintliga pending/processing-jobb
      //    från tidigare batcher, och lägger relationer i sync_batch_jobs.
      const bookingIds = collectSyncBookingIds(externalData.data);
      const attachResult = await attachJobsToBatch(
        supabase,
        batchId,
        organizationId,
        bookingIds,
        queueEventType,
        batchId,
      );
      const totalJobs = attachResult.totalJobs;
      const queueSummary = {
        queued: attachResult.createdNew,
        alreadyQueued: attachResult.adoptedExisting,
        totalCandidates: bookingIds.length,
        bookingIds,
      };

      // 4. Mark sync_state as in_progress (no cursor movement).
      const importCompletedAt = new Date().toISOString();
      await supabase
        .from('sync_state')
        .upsert({
          sync_type: 'booking_import',
          organization_id: organizationId,
          last_sync_mode: syncMode,
          last_sync_status: 'in_progress',
          metadata: {
            queued_for_worker: true,
            batch_id: batchId,
            planned_cursor: importStartedAt,
            queue_summary: queueSummary,
            total_jobs_in_batch: totalJobs,
          },
          updated_at: importCompletedAt,
        }, { onConflict: 'organization_id,sync_type' });

      // 5. If nothing to process at all, finalize the (empty) batch inline so
      //    the cursor still advances (nothing to wait for).
      if (totalJobs === 0) {
        const { finalizeBatchIfDone } = await import('../_shared/syncBatch.ts');
        const finalRes = await finalizeBatchIfDone(supabase, batchId);
        console.log(`[import-bookings] empty batch finalized`, JSON.stringify(finalRes));
      }

      console.log(`[import-bookings] ${queueEventType} batch queued for worker`, JSON.stringify({
        organization_id: organizationId,
        batch_id: batchId,
        planned_cursor: importStartedAt,
        queue_summary: queueSummary,
        total_jobs_in_batch: totalJobs,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          queued: true,
          completed: totalJobs === 0,
          batch_id: batchId,
          results: {
            total: queueSummary.totalCandidates,
            imported: 0,
            failed: 0,
            calendar_events_created: 0,
            warehouse_events_created: 0,
            packing_projects_created: 0,
            products_imported: 0,
            attachments_imported: 0,
            new_bookings: [],
            updated_bookings: [],
            status_changed_bookings: [],
            cancelled_bookings_skipped: [],
            duplicates_skipped: [],
            unchanged_bookings_skipped: [],
            products_updated_bookings: [],
            product_changes: [],
            errors: [],
            sync_mode: queueEventType,
            queued_jobs: queueSummary.queued,
            already_queued_jobs: queueSummary.alreadyQueued,
            total_jobs_in_batch: totalJobs,
            team_distribution: {
              'team-1': 0,
              'team-2': 0,
              'team-3': 0,
              'team-4': 0,
              'team-5': 0,
              'team-11': 0,
            },
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    // ── SAKNAD BOOKING I SINGLE-MODE — SÄKER HANTERING ────────────────────
    // Ett tomt/negativt svar bevisar INGENTING. All tidigare status-demotion
    // (CONFIRMED → OFFER) och cleanup av calendar_events / warehouse_events /
    // projects / jobs / packing_projects vid "external returned 0" är BORTTAGEN.
    // Destruktiv cleanup sker endast på en verifierad canonical tombstone.
    if (isSingleBookingRefresh && normalizedSingleBookingId && externalData.data.length === 0) {
      const parsedSource = parseSingleBookingSourceResponse(
        externalData.raw ?? externalData,
        { bookingId: normalizedSingleBookingId, organizationId },
        { ok: true, status: 200 },
      );

      // Stale-skydd: läs redan applicerad canonical revision INNAN beslut.
      // Ett LÄSFEL får aldrig tolkas som "ingen revision" → retrybart fel.
      const revisionLoad = await loadAppliedSourceRevision(
        supabase,
        normalizedSingleBookingId,
        organizationId,
      );
      if (!revisionLoad.ok) {
        console.error('[single-booking] applied revision load failed — no destructive action', JSON.stringify({
          booking_id: normalizedSingleBookingId,
          organization_id: organizationId,
          error: revisionLoad.error,
        }));
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'failed',
          error: `applied_revision_load_failed:${revisionLoad.error}`,
        })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
      const appliedRevision = revisionLoad.found ? revisionLoad.revisions : null;

      const decision = evaluateDestructiveAction(parsedSource, {
        bookingId: normalizedSingleBookingId,
        organizationId,
      }, appliedRevision);


      if (decision.allowed && decision.action === 'cancellation') {
        // STEG 3L: normal sync (single/batch/incremental/historical) utför
        // ALDRIG destruktiv cancellation — inte ens när feature-flaggan är på.
        // Här loggas endast en kandidat. Enda destruktiva vägen är den
        // separata, explicit bekräftade reconcile/cancellation-vägen.
        const { data: existingBooking } = await supabase
          .from('bookings')
          .select('id, version, assigned_to_project, assigned_project_id, assigned_project_name, status, organization_id')
          .eq('id', normalizedSingleBookingId)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!existingBooking) {
          return new Response(JSON.stringify(buildSingleBookingEnvelope({
            bookingId: normalizedSingleBookingId,
            organizationId,
            outcome: 'already_current',
            results: { total: 1, imported: 0, failed: 0, errors: [], sync_mode: 'cancellation_noop' },
          })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // Redan avbokad lokalt → inget att göra, ingen kandidat.
        if (String(existingBooking.status ?? '').toUpperCase() === 'CANCELLED') {
          return new Response(JSON.stringify(buildSingleBookingEnvelope({
            bookingId: normalizedSingleBookingId,
            organizationId,
            outcome: 'already_current',
            results: { total: 1, imported: 0, failed: 0, errors: [], sync_mode: 'cancellation_idempotent' },
          })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        logBlockedCancellation({
          booking_id: normalizedSingleBookingId,
          organization_id: organizationId,
          source_revision: decision.tombstone.source_updated_at ?? decision.tombstone.source_version ?? null,
          caller: 'import-bookings:single_booking_cancellation_candidate',
        });
        console.log('[cancellation] candidate — requires explicit apply', JSON.stringify({
          booking_id: normalizedSingleBookingId,
          organization_id: organizationId,
          source_status: decision.tombstone.source_status,
          source_revision: decision.tombstone.source_updated_at ?? decision.tombstone.source_version,
          mutations: 0,
        }));

        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'cancellation_requires_explicit_apply',
          error: CANCELLATION_REQUIRES_EXPLICIT_APPLY,
          results: {
            total: 1,
            imported: 0,
            failed: 0,
            errors: [],
            cancellation_candidates: [normalizedSingleBookingId],
            sync_mode: 'cancellation_candidate',
          },
        })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }


      if (parsedSource.kind === 'error') {
        console.warn('[single-booking] technical/contract error — no local changes', JSON.stringify({
          booking_id: normalizedSingleBookingId,
          organization_id: organizationId,
          code: parsedSource.code,
          retriable: parsedSource.retriable,
        }));
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: parsedSource.retriable ? 'failed' : 'partial',
          error: `source_contract:${parsedSource.code}`,
        })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Icke-destruktivt frånvaro-svar (not_found / not_exportable / archived /
      // organization_mismatch / okänt reason / deletion utan giltig tombstone).
      console.log('[single-booking] absent but non-destructive — no local changes', JSON.stringify({
        booking_id: normalizedSingleBookingId,
        organization_id: organizationId,
        reason: parsedSource.kind === 'absent' ? parsedSource.rawReason : null,
        blocked: decision.allowed ? 'deletion_not_supported' : decision.reason,
      }));

      return new Response(JSON.stringify(buildSingleBookingEnvelope({
        bookingId: normalizedSingleBookingId,
        organizationId,
        outcome: 'not_found',
        results: { total: 0, imported: 0, failed: 0, errors: [], sync_mode: 'source_absent_no_change' },
      })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }


    // STEG 4E: ren mätning (inga beteendeändringar, ingen känslig data).
    const perf = new SyncPerfTracker(true);

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
      cancellation_candidates: [] as string[],
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

    // ── STEG 2G/2H: CANONICAL REVISION GUARD (före FÖRSTA canonical mutation) ──
    // En äldre canonical source-revision får aldrig appliceras, loggas, bli
    // applied/completed eller flytta batchcursorn. Kontrollen sker HÄR, innan
    // booking-upsert, statusändring, datum, produkter, kalenderreconcile och
    // projekt-/packingprojection. Reservationen tar dessutom ett exklusivt
    // ägarlås (lease + token) som hålls under HELA importen.
    if (isSingleBookingRefresh && normalizedSingleBookingId && externalData.data.length > 0) {
      const canonicalRow: any = externalData.data[0];
      const incoming = {
        sourceUpdatedAt: canonicalRow?.updated_at ?? canonicalRow?.source_updated_at ?? null,
        sourceVersion: canonicalRow?.version ?? canonicalRow?.source_version ?? null,
        sourceStatus: canonicalRow?.status ?? canonicalRow?.booking_status ?? (externalData as any)?.raw?.source_status ?? null,
      };
      // UPPGIFT E (2H): ogiltig inkommande revision är FAIL-CLOSED — guarden
      // får aldrig hoppas över för ett found:true-resultat.
      if (!normalizeIncomingRevision(incoming)) {
        console.error('[import-bookings] invalid incoming canonical revision — import blocked', JSON.stringify({
          booking_id: normalizedSingleBookingId, organization_id: organizationId,
        }));
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'failed',
          error: 'invalid_incoming_revision',
        })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const reserved = await reserveCanonicalRevision(supabase, {
        bookingId: normalizedSingleBookingId,
        organizationId: organizationId,
        incoming,
        ownerJobId: `import-bookings:${crypto.randomUUID()}`,
      });
      if (reserved.ok && reserved.decision === 'already_current') {
        console.log('[import-bookings] revision already current — no mutation', JSON.stringify({
          booking_id: normalizedSingleBookingId, organization_id: organizationId,
        }));
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'already_current',
          results: { total: 1, imported: 0, failed: 0, errors: [], sync_mode: 'revision_idempotent' },
        })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
      if (!reserved.ok) {
        console.error('[import-bookings] canonical revision guard blocked import', JSON.stringify({
          booking_id: normalizedSingleBookingId,
          organization_id: organizationId,
          decision: reserved.decision,
          error: reserved.error,
        }));
        return new Response(JSON.stringify(buildSingleBookingEnvelope({
          bookingId: normalizedSingleBookingId,
          organizationId,
          outcome: 'failed',
          error: reserved.decision === 'rpc_unavailable'
            ? `revision_guard_unavailable:${reserved.error ?? 'unknown'}`
            : String(reserved.decision),
        })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
      guardedIncomingRevision = incoming;
      guardedReservationToken = reserved.reservationToken ?? null;
      // UPPGIFT F: håll leasen vid liv under lång import.
      leaseControl = startLeaseRenewal(supabase, {
        bookingId: normalizedSingleBookingId,
        organizationId,
        incoming,
        reservationToken: guardedReservationToken,
      });
    }


    // Get existing bookings for comparison — ONLY within current tenant.
    // STEG 4E: pagineras (PostgREST kapar annars tyst vid 1000 rader, vilket
    // skulle få syncen att tro att befintliga bokningar saknas lokalt).
    const EXISTING_BOOKINGS_PAGE_SIZE = 1000;
    const EXISTING_BOOKINGS_SELECT = 'id, status, version, booking_number, client, rigdaydate, eventdate, rigdowndate, deliveryaddress, delivery_city, delivery_postal_code, organization_id, assigned_to_project, assigned_project_id, assigned_project_name, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time, rig_start_time_external, rig_end_time_external, event_start_time_external, event_end_time_external, rigdown_start_time_external, rigdown_end_time_external, rig_time_locked, event_time_locked, rigdown_time_locked';
    const existingBookings: any[] = [];
    let existingBookingsError: any = null;
    await perf.phase('existing_bookings_read', async () => {
      for (let page = 0; ; page++) {
        const from = page * EXISTING_BOOKINGS_PAGE_SIZE;
        const { data: pageRows, error: pageError } = await supabase
          .from('bookings')
          .select(EXISTING_BOOKINGS_SELECT)
          .eq('organization_id', organizationId)
          .order('id', { ascending: true })
          .range(from, from + EXISTING_BOOKINGS_PAGE_SIZE - 1);
        if (pageError) { existingBookingsError = pageError; return; }
        const rows = pageRows || [];
        existingBookings.push(...rows);
        if (rows.length < EXISTING_BOOKINGS_PAGE_SIZE) return;
      }
    });

    // STEG 3O: fail-closed — utan verifierad lokal bild får vi aldrig anta
    // "bokningen finns inte lokalt" (skulle ge felaktiga inserts/överskrivningar).
    if (existingBookingsError) {
      console.error('[Import] FAIL-CLOSED existing bookings read failed:', existingBookingsError);
      return new Response(JSON.stringify({
        success: false,
        completed: false,
        outcome: 'failed',
        error: `existing_bookings_read_failed:${existingBookingsError.message || existingBookingsError}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

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
      perf.beginBooking(String(externalBooking?.id ?? 'unknown'));
      perf.setCount('products_count', Array.isArray(externalBooking?.products) ? externalBooking.products.length : 0);
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
        const bookingStatus = normalizeBookingStatus(externalBooking.status);

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

        // STEG 3L: CANCELLED i normal sync (batch/incremental/full OCH
        // historical) blir ENDAST en kandidat — aldrig en mutation.
        // Ingen destruktiv cleanup, ingen lokal statussättning via upsert.
        if (bookingStatus === 'CANCELLED') {
          if (existingBooking) {
            logBlockedCancellation({
              booking_id: existingBooking.id,
              organization_id: organizationId,
              source_revision: (externalBooking as any).updated_at ?? (externalBooking as any).version ?? null,
              caller: isHistoricalImport
                ? 'import-bookings:historical_cancelled_candidate'
                : 'import-bookings:bulk_sync_cancelled_candidate',
            });
            results.cancellation_candidates.push(existingBooking.id);
            results.cancelled_bookings_skipped.push(existingBooking.id);
            continue;
          }

          // New CANCELLED booking - skip import
          console.log(`CANCELLED booking ${externalBooking.id} does not exist locally → skipping`)
          results.cancelled_bookings_skipped.push(externalBooking.id)
          continue
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

        // DEBUG: log raw date arrays from external API to diagnose missing rig days
        console.log(`[Date Arrays] Booking ${externalBooking.id} (${externalBooking.booking_number || ''}): raw rig_up_dates=${JSON.stringify(externalBooking.rig_up_dates)}, rig_dates=${JSON.stringify(externalBooking.rig_dates)}, rig_up_date=${JSON.stringify(externalBooking.rig_up_date)}, rigdaydate=${JSON.stringify(externalBooking.rigdaydate)}, rig_date=${JSON.stringify(externalBooking.rig_date)} → allRigDates=${JSON.stringify(allRigDates)} | event_dates=${JSON.stringify(externalBooking.event_dates)}, eventdate=${JSON.stringify(externalBooking.eventdate)} → allEventDates=${JSON.stringify(allEventDates)} | rig_down_dates=${JSON.stringify(externalBooking.rig_down_dates)}, rigdowndate=${JSON.stringify(externalBooking.rigdowndate)} → allRigdownDates=${JSON.stringify(allRigdownDates)}`);

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
          title: externalBooking.title ?? externalBooking.name ?? externalBooking.location ?? null,
          rigdaydate: rigdaydate,
          eventdate: eventdate,
          rigdowndate: rigdowndate,
          rig_start_time: normalizeDateTimeForBookingField(rigStartRaw, rigdaydate),
          rig_end_time: normalizeDateTimeForBookingField(rigEndRaw, rigdaydate),
          event_start_time: normalizeDateTimeForBookingField(eventStartRaw, eventdate),
          event_end_time: normalizeDateTimeForBookingField(eventEndRaw, eventdate),
          rigdown_start_time: normalizeDateTimeForBookingField(rigdownStartRaw, rigdowndate),
          rigdown_end_time: normalizeDateTimeForBookingField(rigdownEndRaw, rigdowndate),
          // External snapshot — mirrors live values written by Booking system
          rig_start_time_external: normalizeDateTimeForBookingField(rigStartRaw, rigdaydate) ?? null,
          rig_end_time_external: normalizeDateTimeForBookingField(rigEndRaw, rigdaydate) ?? null,
          event_start_time_external: normalizeDateTimeForBookingField(eventStartRaw, eventdate) ?? null,
          event_end_time_external: normalizeDateTimeForBookingField(eventEndRaw, eventdate) ?? null,
          rigdown_start_time_external: normalizeDateTimeForBookingField(rigdownStartRaw, rigdowndate) ?? null,
          rigdown_end_time_external: normalizeDateTimeForBookingField(rigdownEndRaw, rigdowndate) ?? null,
          allRigDates,
          allEventDates,
          allRigdownDates,
          deliveryaddress: externalBooking.delivery_address,
          delivery_city: externalBooking.delivery_city,
          delivery_postal_code: externalBooking.delivery_postal_code,
          delivery_latitude: externalBooking.delivery_geocode?.lat,
          delivery_longitude: externalBooking.delivery_geocode?.lng,
          // Leveranskontakt: externa bokningssystemet skickar primärt
          // `delivery_contact_name` / `delivery_contact_phone`. Behåll äldre
          // fallbacks för bakåtkompatibilitet.
          contact_name:
            externalBooking.delivery_contact_name
            ?? externalBooking.contact_name
            ?? externalBooking.contact_person
            ?? externalBooking.contact?.name
            ?? null,
          contact_phone:
            externalBooking.delivery_contact_phone
            ?? externalBooking.contact_phone
            ?? externalBooking.contact?.phone
            ?? externalBooking.phone
            ?? null,
          contact_email:
            externalBooking.delivery_contact_email
            ?? externalBooking.contact_email
            ?? externalBooking.contact?.email
            ?? externalBooking.email
            ?? null,
          carry_more_than_10m: externalBooking.carry_more_than_10m || false,
          ground_nails_allowed: externalBooking.ground_nails_allowed || false,
          exact_time_needed: externalBooking.exact_time_needed || false,
          rental_only: externalBooking.rental_only === true,
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

        // STEG 3D: explicit completeness från Booking-kontraktet (fail-closed).
        // 'complete' krävs för ALL destruktiv produkt-/packing-synk.
        // STEG 3E: kalender-sync-kontext (ownership + revision + lease + completeness).
        const calendarSyncCtx: CalendarSyncContext = {
          sourceFound: true,
          revisionValidated: true,
          leaseOwned: true,
          datesCompleteness: readDateSourceCompleteness(externalBooking),
          datePresence: buildDatePresence(externalBooking),
        };
        // STEG 3F: projection-kontext (projects/jobs/packing_projects).
        const projectionSyncCtx: ProjectionSyncContext = {
          sourceFound: true,
          revisionValidated: true,
          leaseOwned: true,
          projectionComplete: readDateSourceCompleteness(externalBooking) === 'complete',
          organizationId,
          bookingId: bookingData.id,
        };
        const runCalendarReconcile = async () => {
          try {
            assertLeaseOwned('calendar_reconcile');
          } catch (leaseErr) {
            console.warn(`[Calendar Reconcile] ${CALENDAR_MUTATION_BLOCKED_LOG} booking ${bookingData.id}: lease_not_owned`);
            throw leaseErr;
          }
          const res = await reconcileCalendarEvents(
            supabase, bookingData, organizationId, results, existingBooking, calendarSyncCtx,
          );
          if (!res.ok) {
            results.failed++;
            results.errors.push({ booking_id: bookingData.id, error: res.error || 'calendar_reconcile_failed' });
          }
          return res;
        };

        const productCompleteness: ProductSourceCompleteness = readProductSourceCompleteness(externalBooking);
        const productDeleteAllowed = canDeleteProducts(productCompleteness);
        if (!productDeleteAllowed) {
          console.log(`[Product Sync] booking ${externalBooking.id}: products_complete=${productCompleteness} → destructive product sync disabled (add/update only)`);
        }



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
            productChanges = await checkProductChanges(
              supabase,
              existingBooking.id,
              externalBooking.products,
              productCompleteness,
              bookingData.organization_id,
            );
            if ((productChanges as any).error) {
              results.errors.push({ booking_id: existingBooking.id, error: `product_changes_read_failed:${(productChanges as any).error}` });
            }
            needsProductUpdate = (productChanges as any).changed;
            
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
                .eq('id', existingBooking.id)
                .eq('organization_id', organizationId);
              if (econError) {
                // STEG 3P: canonical fältprojection — fel måste synas i outcome.
                console.error(`[Economics] Failed to backfill economics_data for ${bookingData.id}:`, econError.message);
                results.errors.push({ booking_id: bookingData.id, error: `economics_backfill_failed:${econError.message}` });
              } else {
                console.log(`[Economics] Successfully backfilled economics_data for ${bookingData.id}`);
              }

            }

            // Sync all attachments (products, files_metadata, tent_images) with shared dedup
            assertLeaseOwned('attachments');
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
            await runCalendarReconcile();
            continue; // SKIP UPDATE - NO CHANGES
          }
          
          // If only warehouse recovery is needed, sync now and continue
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && needsWarehouseRecovery && !needsProductRecovery) {
            console.log(`Only warehouse recovery needed for ${bookingData.id}`);
            assertLeaseOwned('warehouse_events');
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData, organizationId);
            results.warehouse_events_created += warehouseEventsCreated;
            // Sync all attachments with shared dedup
            assertLeaseOwned('attachments');
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
            await runCalendarReconcile();
            continue;
          }
          
          // If only product recovery is needed, clear products and reimport
          if (!hasChanged && !statusChanged && !needsCalendarRecovery && !needsWarehouseRecovery && needsProductRecovery) {
            // GUARD: never wipe local products when external payload is empty.
            const recoveryExternalCount = Array.isArray(externalBooking.products) ? externalBooking.products.length : 0;
            if (recoveryExternalCount === 0) {
              console.warn(`[Product Recovery GUARD] Skipping recovery for booking ${bookingData.id}: external products array is empty (transient_empty_source). Keeping local products intact.`);
            await runCalendarReconcile();
              continue;
            }

            // STEG 3D: recovery är destruktiv (clear + reimport) och kräver att
            // Booking explicit rapporterar products_complete === true.
            if (!productDeleteAllowed) {
              console.warn(`[Product Recovery] ${PRODUCT_DESTRUCTIVE_BLOCKED_LOG} booking ${bookingData.id}: completeness=${productCompleteness} → no clear, no delete. Only safe add/update paths may run.`);
            await runCalendarReconcile();
              continue;
            }

            console.log(`Only product recovery needed for ${bookingData.id} - clearing and reimporting ${recoveryExternalCount} products`);
            
            // Delete packing list items BEFORE products to avoid FK constraint violations
            const { data: packingForRecovery, error: packingForRecoveryError } = await supabase
              .from('packing_projects')
              .select('id')
              .eq('booking_id', existingBooking.id)
              .eq('organization_id', bookingData.organization_id)
              .maybeSingle();

            if (packingForRecoveryError) {
              console.error(`[Product Recovery] Error loading packing project:`, packingForRecoveryError);
              results.errors.push({ booking_id: existingBooking.id, error: `product_recovery_packing_lookup_failed:${packingForRecoveryError.message || packingForRecoveryError}` });
              results.failed++;
              continue;
            }

            if (packingForRecovery) {
              assertLeaseOwned('packing_item_clear');
              // STEG 3I: ingen blind multi-row delete — exakta rader löses ut först.
              const recoveryItemsDel = await guardedDeleteWhere(supabase, {
                table: 'packing_list_items',
                filters: { packing_id: packingForRecovery.id, organization_id: bookingData.organization_id },
                kind: 'product_deletes',
                counters: countersOf(supabase),
                ctx: { booking_id: bookingData.id, organization_id: bookingData.organization_id },
              });
              if (recoveryItemsDel.error) {
                console.error(`[Product Recovery] Error clearing packing list items:`, recoveryItemsDel.error);
                results.errors.push({ booking_id: existingBooking.id, error: `packing_items_clear_failed:${recoveryItemsDel.error}` });
                results.failed++;
                continue;
              }
              console.log(`[Product Recovery] Cleared packing list items for packing ${packingForRecovery.id}`);
            }

            assertLeaseOwned('product_clear');
            const clearProductsRes = await guardedDeleteWhere(supabase, {
              table: 'booking_products',
              filters: { booking_id: existingBooking.id, organization_id: bookingData.organization_id },
              kind: 'product_deletes',
              counters: countersOf(supabase),
              ctx: { booking_id: bookingData.id, organization_id: bookingData.organization_id },
            });
            if (clearProductsRes.error) {
              console.error(`[Product Recovery] Error clearing products:`, clearProductsRes.error);
              results.errors.push({ booking_id: existingBooking.id, error: `product_clear_failed:${clearProductsRes.error}` });
              results.failed++;
              continue;
            }
            
            
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
                const extId = getExternalProductId(rawProduct);
                // Om Booking skickar ett externt id → varje rad är distinkt (två
                // "Multiflex 6x6" med olika komponenter får INTE slås ihop).
                // Endast rader UTAN externt id (äkta API-dubbletter) mergas.
                const key = extId
                  ? `extid::${extId}`
                  : `${name}::${parentId}::${isPkg}`;

                if (productKeyMap.has(key)) {
                  const existingIdx = productKeyMap.get(key)!;
                  deduplicatedProducts[existingIdx].quantity = 
                    (deduplicatedProducts[existingIdx].quantity || 1) + (rawProduct.quantity || 1);
                  if (VERBOSE_PRODUCT_LOGS) console.log(`[Product Recovery][Dedup] Merged duplicate "${name}" - new quantity: ${deduplicatedProducts[existingIdx].quantity}`);
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
                    tags: Array.isArray(product.tags) ? product.tags : [],
                    tags_en: Array.isArray(product.tags_en) ? product.tags_en : [],
                  }

                  const { data: insertedProduct, error: productError } = await supabase
                    .from('booking_products')
                    .insert(productData)
                    .select('id')
                    .single()

                  if (productError) {
                    // STEG 3P: produktprojection är canonical — fel måste ge partial.
                    console.error(`[Product Recovery] Error inserting product:`, productError)
                    results.errors.push({ booking_id: existingBooking.id, error: `product_insert_failed:${productError.message || productError}` });

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
                          .in('id', pendingChildren)
                          .eq('organization_id', organizationId);

                        if (pendingUpdateError) {
                          console.error(`[Product Recovery] Error attaching pending children to ${insertedProduct.id}:`, pendingUpdateError);
                          results.errors.push({ booking_id: existingBooking.id, error: `product_parent_link_failed:${pendingUpdateError.message || pendingUpdateError}` });
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
                          .in('id', pendingSequentialAccessoryIds)
                          .eq('organization_id', organizationId);

                        if (seqUpdateError) {
                          console.error(`[Product Recovery] Error attaching early accessories to ${lastParentProductId}:`, seqUpdateError);
                          results.errors.push({ booking_id: existingBooking.id, error: `product_parent_link_failed:${seqUpdateError.message || seqUpdateError}` });
                        }
                        pendingSequentialAccessoryIds.length = 0;
                      }
                    }
                  }
                } catch (productErr) {
                  console.error(`[Product Recovery] Error processing product:`, productErr)
                  results.errors.push({ booking_id: existingBooking.id, error: `product_processing_failed:${productErr instanceof Error ? productErr.message : String(productErr)}` });
                }

              }
            }
            
            // EXPAND package_components JSONB into individual rows
            const recoveryExpanded = await expandPackageComponents(supabase, existingBooking.id, organizationId);
            if (recoveryExpanded.error) {
              results.errors.push({ booking_id: existingBooking.id, error: recoveryExpanded.error });
            }
            if (recoveryExpanded.expanded > 0) {
              results.products_imported += recoveryExpanded.expanded;
              console.log(`[Product Recovery] Expanded ${recoveryExpanded.expanded} package components for booking ${bookingData.id}`);
            }

            
            // SYNC packing list items for all products (including expanded components)
            const recoveryPackingResult = await (async () => { assertLeaseOwned('packing_project'); return syncPackingListAfterExpansion(supabase, existingBooking.id, organizationId, { completeness: productCompleteness, assertLease: assertLeaseOwned }); })();
            if (recoveryPackingResult.error) {
              results.errors.push({ booking_id: existingBooking.id, error: `packing_sync_failed:${recoveryPackingResult.error}` });
            }
            if (recoveryPackingResult.changes > 0) {
              console.log(`[Product Recovery] Synced ${recoveryPackingResult.changes} packing list items for booking ${bookingData.id}`);
            }
            
            // Sync all attachments with shared dedup
            assertLeaseOwned('attachments');
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
            await runCalendarReconcile();
            continue;
          }
          
          // Declare status variables at the broader scope so they're available for updateData
          const wasConfirmed = existingBooking.status === 'CONFIRMED';
          const isNowConfirmed = bookingData.status === 'CONFIRMED';
          
          if (statusChanged) {
            console.log(`Status changed for ${bookingData.id}: ${existingBooking.status} -> ${bookingData.status}`)
            results.status_changed_bookings.push(bookingData.id)
            
            // STEG 3H: normal sync gör ALDRIG destructive lifecycle-cleanup vid
            // statusändring. CONFIRMED → OFFER/annat uppdaterar endast det
            // Booking-ägda statusfältet på själva booking-projectionen.
            // Kalender, projects, jobs, packing och produkter rörs inte.
            // Canonical CANCELLED hanteras enbart av den separata, skyddade
            // cancellation-vägen (feature flag + revision + lease + atomisk RPC).
            if (wasConfirmed && !isNowConfirmed) {
              console.log('[steg3h] de-confirmation observed — no destructive cleanup in normal sync', JSON.stringify({
                booking_id: bookingData.id,
                organization_id: organizationId,
                from_status: existingBooking.status,
                to_status: bookingData.status,
                destructive_cleanup: false,
              }));
            }

            if (bookingStatus === 'CANCELLED') {
              console.log('[steg3h] cancelled source status in normal sync — routed to protected cancellation path only', JSON.stringify({
                booking_id: bookingData.id,
                organization_id: organizationId,
                automatic_destructive_sync_enabled: isAutomaticDestructiveSyncEnabled(),
                destructive_cleanup: false,
              }));
            }

            // STEG 3H: ingen automatisk reactivation. Planning-ägd project/job-status
            // ändras aldrig av Booking-status.
            if (!wasConfirmed && isNowConfirmed) {
              console.log(`Booking ${bookingData.id} is now CONFIRMED — Planning-owned project/job status left untouched`);
            }
          } else {
            console.log(`Data changed for ${bookingData.id}, updating`)
            results.updated_bookings.push(bookingData.id)
          }

          // Prepare update data - strip non-DB fields and reset viewed flag if booking is newly confirmed
          // CRITICAL: Never overwrite organization_id on existing bookings to prevent cross-tenant data theft
          const { allRigDates: _ard, allEventDates: _aed, allRigdownDates: _ardd, organization_id: _stripOrgId, ...dbBookingData } = bookingData as any;

          // FIXED-TIME LOCK: Auto-lock a phase the first time we observe an external time
          // for it. Once locked (or once we've seen the external value), we never re-lock —
          // user toggle wins. Strip locked fields out of update unless first observation.
          const lockPhases: Array<{ ext: string; lock: string }> = [
            { ext: 'rig_start_time_external', lock: 'rig_time_locked' },
            { ext: 'event_start_time_external', lock: 'event_time_locked' },
            { ext: 'rigdown_start_time_external', lock: 'rigdown_time_locked' },
          ];
          const lockingPatch: Record<string, boolean> = {};
          for (const { ext, lock } of lockPhases) {
            const previouslySeen = (existingBooking as any)[ext] != null;
            const incoming = (dbBookingData as any)[ext];
            if (!previouslySeen && incoming) {
              lockingPatch[lock] = true;
            }
          }
          // Always strip incoming lock fields from updateData — only the lockingPatch above
          // is allowed to flip them on; the user's manual toggle is the only other writer.
          delete (dbBookingData as any).rig_time_locked;
          delete (dbBookingData as any).event_time_locked;
          delete (dbBookingData as any).rigdown_time_locked;

          // LOCKED PHASE TIMES: när en fas är låst lokalt ("Fast tid") och Booking
          // inte skickar någon tid för fasen får importen ALDRIG nolla eller ändra
          // de lokala tiderna — varken i bookings-raden eller i kalender-reconcilern.
          const timePhases: Array<{ lock: string; start: string; end: string }> = [
            { lock: 'rig_time_locked', start: 'rig_start_time', end: 'rig_end_time' },
            { lock: 'event_time_locked', start: 'event_start_time', end: 'event_end_time' },
            { lock: 'rigdown_time_locked', start: 'rigdown_start_time', end: 'rigdown_end_time' },
          ];
          for (const { lock, start, end } of timePhases) {
            const isLocked = (existingBooking as any)[lock] === true;
            if (!isLocked) continue;
            const incomingStart = (dbBookingData as any)[start];
            if (incomingStart) continue; // Booking skickade en tid → den vinner
            const localStart = (existingBooking as any)[start];
            const localEnd = (existingBooking as any)[end];
            if (!localStart) continue;
            delete (dbBookingData as any)[start];
            delete (dbBookingData as any)[end];
            (bookingData as any)[start] = localStart;
            (bookingData as any)[end] = localEnd;
            console.log(`[Locked Time Preserve] ${bookingData.id}: kept local ${start}=${localStart}`);
          }

          const updateData: any = {
            ...dbBookingData,
            ...lockingPatch,
            id: existingBooking.id,
            version: (existingBooking.version || 1) + 1,
            updated_at: new Date().toISOString()
          };
          
          
          // CRITICAL: Preserve local project assignment flags
          // BUT skip preservation when booking is being re-confirmed (from cancelled/non-confirmed → confirmed)
          // so it appears in triage for manual assignment
          if (!(!wasConfirmed && isNowConfirmed)) {
            // STEG 3N: tenant-isolerade reads (booking_id + organization_id).
            const preserveOrgId = existingBooking.organization_id || bookingData.organization_id || organizationId;
            // Check for existing active project
            const { data: localProject, error: localProjectErr } = await supabase
              .from('projects')
              .select('id, name, status')
              .eq('booking_id', existingBooking.id)
              .eq('organization_id', preserveOrgId)
              .neq('status', 'cancelled')
              .limit(1);
            
            // Check for existing job (small project)
            const { data: localJob, error: localJobErr } = await supabase
              .from('jobs')
              .select('id, name, status')
              .eq('booking_id', existingBooking.id)
              .eq('organization_id', preserveOrgId)
              .neq('status', 'completed')
              .limit(1);
            
            const activeProject = localProject && localProject.length > 0 ? localProject[0] : null;
            const activeJob = localJob && localJob.length > 0 ? localJob[0] : null;

            // Keep hidden if booking is CANCELLED and either was manually hidden, or has any cancelled project/job link
            const { data: cancelledLinkProjects, error: cancelledProjectsErr } = await supabase
              .from('projects')
              .select('id')
              .eq('booking_id', existingBooking.id)
              .eq('organization_id', preserveOrgId)
              .eq('status', 'cancelled')
              .limit(1);
            const { data: cancelledLinkJobs, error: cancelledJobsErr } = await supabase
              .from('jobs')
              .select('id')
              .eq('booking_id', existingBooking.id)
              .eq('organization_id', preserveOrgId)
              .eq('status', 'cancelled')
              .limit(1);

            const preserveReadError = localProjectErr || localJobErr || cancelledProjectsErr || cancelledJobsErr;
            if (preserveReadError) {
              // STEG 3N: fail-closed — ett DB-fel får aldrig tolkas som
              // "ingen lokal koppling finns". Behåll befintliga flaggor exakt.
              console.error(`[Preserve Flags] FAIL-CLOSED booking ${bookingData.id}: local project/job read failed`, preserveReadError);
              updateData.assigned_to_project = existingBooking.assigned_to_project ?? null;
              updateData.assigned_project_id = existingBooking.assigned_project_id ?? null;
              updateData.assigned_project_name = existingBooking.assigned_project_name ?? null;
            } else {
            const hasCancelledLinkPreserve =
              (cancelledLinkProjects && cancelledLinkProjects.length > 0) ||
              (cancelledLinkJobs && cancelledLinkJobs.length > 0);

            const keepManuallyHiddenCancelled =
              bookingStatus === 'CANCELLED' &&
              !activeProject &&
              !activeJob &&
              (existingBooking.assigned_to_project === true || hasCancelledLinkPreserve);
            

            
            if (keepManuallyHiddenCancelled) {
              console.log(`[Preserve Flags] Booking ${bookingData.id} is manually hidden cancelled booking - preserving hidden state`);
              updateData.assigned_to_project = true;
              updateData.assigned_project_id = existingBooking.assigned_project_id ?? null;
              updateData.assigned_project_name = existingBooking.assigned_project_name ?? null;
            } else if (activeProject) {
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

          // Preserve and merge internal notes — both sources coexist
          const externalNotes = (bookingData.internalnotes || '').trim();
          const localNotes = (existingBooking.internalnotes || '').trim();

          if (externalNotes && localNotes && externalNotes !== localNotes) {
            if (!localNotes.includes(externalNotes)) {
              updateData.internalnotes = `${externalNotes}\n---\n${localNotes}`;
              console.log(`[Notes Merge] Booking ${bookingData.id}: merged external + local notes`);
            } else {
              updateData.internalnotes = localNotes; // already merged
            }
          } else if (!externalNotes && localNotes) {
            updateData.internalnotes = localNotes; // preserve local
            console.log(`[Notes Preserve] Booking ${bookingData.id}: kept local notes (external empty)`);
          }
          // else: external only or both identical — bookingData value is fine

          // Update existing booking
          assertLeaseOwned('booking_update');
          const { error: updateError } = await supabase
            .from('bookings')
            .update(updateData)
            .eq('id', existingBooking.id)
            .eq('organization_id', organizationId)

          if (updateError) {
            console.error(`Error updating booking ${existingBooking.id}:`, updateError)
            results.errors.push({ booking_id: existingBooking.id, error: updateError.message })
            results.failed++
            continue
          }

          // If skip_review is set (Planning UI caller), reset needs_review to prevent
          // self-made changes from appearing as needing review
          if (skip_review) {
            const { error: reviewResetError } = await supabase
              .from('bookings')
              .update({ needs_review: false, needs_review_reason: null })
              .eq('id', existingBooking.id)
              .eq('organization_id', organizationId);
            if (reviewResetError) {
              // STEG 3P: reset ingår i syncoperationen — fel får inte tystas.
              console.error(`[needs_review] reset failed for ${existingBooking.id}:`, reviewResetError);
              results.errors.push({ booking_id: existingBooking.id, error: `needs_review_reset_failed:${reviewResetError.message || reviewResetError}` });
            }
          }


          // Calendar reconciliation is now handled deterministically below (lines ~2644+)
          // No longer delete-and-recreate here — the reconciler handles create/update/delete

          // PRODUCT UPDATE WITH PACKING LIST RECONNECTION
          // 1. Fetch packing project for this booking (if exists)
          const { data: packingProject } = await supabase
            .from('packing_projects')
            .select('id')
            .eq('booking_id', existingBooking.id)
            .eq('organization_id', bookingData.organization_id)
            .maybeSingle();
          
          // 2. Fetch existing products BEFORE deletion (for packing list reconnection)
          const { data: oldProductsData } = await supabase
            .from('booking_products')
            .select('id, name, quantity')
            .eq('booking_id', existingBooking.id)
            .eq('organization_id', bookingData.organization_id);
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
          const { data: crossOrgBooking, error: crossOrgError } = await supabase
            .from('bookings')
            .select('id, organization_id')
            .eq('id', externalBooking.id)
            .maybeSingle();

          if (crossOrgError) {
            // STEG 3O: fail-closed — utan svar kan vi inte utesluta cross-tenant-krock.
            console.error(`[CROSS-ORG BLOCK] FAIL-CLOSED read failed for ${externalBooking.id}:`, crossOrgError);
            results.errors.push({ booking_id: externalBooking.id, error: `cross_org_check_failed:${crossOrgError.message || crossOrgError}` });
            results.failed++;
            continue;
          }

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
          // FIXED-TIME LOCK: For new bookings, lock any phase that arrived with an external time.
          dbInsertData.rig_time_locked = !!dbInsertData.rig_start_time_external;
          dbInsertData.event_time_locked = !!dbInsertData.event_start_time_external;
          dbInsertData.rigdown_time_locked = !!dbInsertData.rigdown_start_time_external;
          assertLeaseOwned('booking_insert');
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
          assertLeaseOwned('product_sync');
          console.log(`Processing ${externalBooking.products.length} raw products for booking ${bookingData.id}`)
          
          // DEDUPLICATE: External API sometimes sends duplicate rows - merge by name + parent
          const deduplicatedProducts: any[] = [];
          const productKeyMap = new Map<string, number>(); // key -> index in deduplicatedProducts
          
          for (const product of externalBooking.products) {
            const name = (product.name || product.product_name || '').trim();
            const parentId = product.parent_product_id || product.parent_package_id || product.inventory_package_id || 'root';
            const isPkg = product.is_package_component === true;
            const extId = getExternalProductId(product);
            // Se getExternalProductId: varje rad från Booking med eget id är
            // en distinkt orderrad. Två "Multiflex 6x6" med olika
            // package_components får INTE mergas till en qty=2-rad.
            const key = extId
              ? `extid::${extId}`
              : `${name}::${parentId}::${isPkg}`;

            if (productKeyMap.has(key)) {
              // Merge: add quantities
              const existingIdx = productKeyMap.get(key)!;
              deduplicatedProducts[existingIdx].quantity = 
                (deduplicatedProducts[existingIdx].quantity || 1) + (product.quantity || 1);
              if (VERBOSE_PRODUCT_LOGS) console.log(`[Dedup] Merged duplicate "${name}" - new quantity: ${deduplicatedProducts[existingIdx].quantity}`);
            } else {
              productKeyMap.set(key, deduplicatedProducts.length);
              deduplicatedProducts.push({ ...product, quantity: product.quantity || 1 });
            }
          }

          
          console.log(`Processing ${deduplicatedProducts.length} deduplicated products for booking ${bookingData.id}`);

          // ── MERGE STRATEGY ──────────────────────────────────────────────────────
          // Build a lookup of existing products by normalised name so we can
          // UPDATE in-place instead of DELETE + INSERT.  This eliminates the
          // race-condition window where the table is momentarily empty.
          const existingProductsByName = new Map<string, { id: string; name: string }>();
          if (oldProducts) {
            for (const ep of oldProducts) {
              existingProductsByName.set((ep.name || '').trim().toLowerCase(), ep);
            }
          }
          // ────────────────────────────────────────────────────────────────────────
          
          // Track the last parent product ID for linking accessories
          const externalIdToInternalId = new Map<string, string>();
          const pendingByExternalParentId = new Map<string, string[]>();
          const pendingSequentialAccessoryIds: string[] = [];
          let lastParentProductId: string | null = null;
          // STEG 4E: mät produktfasen (ren mätning, ingen semantikändring).
          const stopProductsPhase = perf.startPhase('products');
          perf.setCount('products_count', deduplicatedProducts.length);
          for (const product of deduplicatedProducts) {
            try {
              // Log raw product data to see all available fields from external API
              if (VERBOSE_PRODUCT_LOGS) console.log(`RAW PRODUCT DATA from external API for booking ${bookingData.id}:`, JSON.stringify(product, null, 2))
              
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
                if (VERBOSE_PRODUCT_LOGS) console.log(`[PACKAGE COMPONENT] "${productName}": parent_package_id=${product.parent_package_id}`)
              }
              
              if (VERBOSE_PRODUCT_LOGS) console.log(`Product "${productName}": unit_price=${unitPrice}, quantity=${quantity}, total_price=${totalPrice}, isAccessory=${isAccessory}, isPkgComponent=${isPkgComponent}, externalId=${externalId}, externalParentId=${externalParentId}, resolvedParentId=${resolvedParentId}`)
              
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
                tags: Array.isArray(product.tags) ? product.tags : [],
                tags_en: Array.isArray(product.tags_en) ? product.tags_en : [],
              }

              // ── MERGE: UPDATE existing or INSERT new ────────────────────────────
              const nameKey = productName.trim().toLowerCase();
              const nameMatch = existingProductsByName.get(nameKey);
              // Om vi redan har återanvänt den befintliga raden (t.ex. två
              // separata "Multiflex 6x6" med olika komponenter) måste den
              // andra externa raden bli en ny INSERT — annars skrivs den
              // första radens produkt/komponenter över.
              const existingMatch = nameMatch && !seenExistingIds.has(nameMatch.id) ? nameMatch : null;

              let upsertedProductId: string | null = null;
              let productError: any = null;

              if (existingMatch) {
                // UPDATE in-place — keeps existing ID stable (no race condition gap)
                seenExistingIds.add(existingMatch.id);
                const { error: updateErr } = await supabase
                  .from('booking_products')
                  .update({ ...productData, parent_product_id: resolvedParentId || undefined })
                  .eq('id', existingMatch.id)
                  .eq('organization_id', organizationId);
                productError = updateErr;
                upsertedProductId = existingMatch.id;
                if (!updateErr && VERBOSE_PRODUCT_LOGS) console.log(`[Merge] Updated existing product "${productName}" (id=${existingMatch.id})`);
              } else {
                // INSERT new product
                const { data: insertedProduct, error: insertErr } = await supabase
                  .from('booking_products')
                  .insert(productData)
                  .select('id')
                  .single();
                productError = insertErr;
                upsertedProductId = insertedProduct?.id ?? null;
                if (!insertErr && VERBOSE_PRODUCT_LOGS) console.log(`[Merge] Inserted new product "${productName}" (id=${upsertedProductId})`);
              }
              // ────────────────────────────────────────────────────────────────────


              if (productError) {
                console.error(`Error upserting product for booking ${bookingData.id}:`, productError)
                results.errors.push({ booking_id: bookingData.id, error: `product_upsert_failed:${productError.message || productError}` });

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
                      .in('id', pendingChildren)
                      .eq('organization_id', organizationId);
                    if (pendingUpdateError) {
                      console.error(`Error attaching pending children to ${upsertedProductId}:`, pendingUpdateError);
                      results.errors.push({ booking_id: bookingData.id, error: `product_parent_link_failed:${pendingUpdateError.message || pendingUpdateError}` });
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
                      .in('id', pendingSequentialAccessoryIds)
                      .eq('organization_id', organizationId);
                    if (seqUpdateError) {
                      console.error(`Error attaching early accessories to ${lastParentProductId}:`, seqUpdateError);
                      results.errors.push({ booking_id: bookingData.id, error: `product_parent_link_failed:${seqUpdateError.message || seqUpdateError}` });
                    }
                    pendingSequentialAccessoryIds.length = 0;
                  }
                }
              }
            } catch (productErr) {
              console.error(`Error processing product for booking ${bookingData.id}:`, productErr)
              results.errors.push({ booking_id: bookingData.id, error: `product_processing_failed:${productErr instanceof Error ? productErr.message : String(productErr)}` });
            }

            }
          }
          stopProductsPhase();



          // ── DELETE products no longer in the external API ─────────────────────
          // STEG 3D: destruktiv delete kräver EXPLICIT products_complete === true.
          // Fail-closed: unknown/false → 0 deletes, oavsett antal produkter.
          const externalProductCount = Array.isArray(externalBooking.products) ? externalBooking.products.length : 0;
          if (oldProducts && oldProducts.length > 0 && externalProductCount > 0 && productDeleteAllowed) {
            const toDelete = oldProducts.filter((p: any) => !seenExistingIds.has(p.id));
            if (toDelete.length > 0) {
              const idsToDelete = toDelete.map((p: any) => p.id);
              console.log(`[Merge] Deleting ${idsToDelete.length} products no longer in external API (external had ${externalProductCount})`);
              assertLeaseOwned('product_delete');
              const mergeDel = await guardedDeleteByIds(supabase, {
                table: 'booking_products',
                ids: idsToDelete,
                kind: 'product_deletes',
                counters: countersOf(supabase),
                filters: { booking_id: bookingData.id, organization_id: organizationId },
                ctx: { booking_id: bookingData.id, organization_id: organizationId },
              });
              if (mergeDel.error) {
                console.error(`[Merge] Error deleting products for booking ${bookingData.id}:`, mergeDel.error);
                results.errors.push({ booking_id: bookingData.id, error: `product_delete_failed:${mergeDel.error}` });
                results.failed++;
                continue;
              }
            }
          } else if (oldProducts && oldProducts.length > 0 && externalProductCount === 0) {
            console.warn(`[Merge GUARD] Skipping delete of ${oldProducts.length} local products for booking ${bookingData.id}: external products array is empty (transient_empty_source)`);
          } else if (oldProducts && oldProducts.length > 0 && !productDeleteAllowed) {
            console.warn(`[Merge] ${PRODUCT_DESTRUCTIVE_BLOCKED_LOG} booking ${bookingData.id}: keeping all ${oldProducts.length} local products (completeness=${productCompleteness}, source had ${externalProductCount})`);
          }
          // ─────────────────────────────────────────────────────────────────────
          
          // EXPAND package_components JSONB into individual rows (shared function)
          const mainExpanded = await expandPackageComponents(supabase, bookingData.id, organizationId);
          if (mainExpanded.error) {
            results.errors.push({ booking_id: bookingData.id, error: mainExpanded.error });
          }
          if (mainExpanded.expanded > 0) {
            results.products_imported += mainExpanded.expanded;
            console.log(`[Main Flow] Expanded ${mainExpanded.expanded} package components for booking ${bookingData.id}`);
          }

          
          // SYNC packing list items for expanded components
          const mainPackingResult = await (async () => { assertLeaseOwned('packing_project'); return syncPackingListAfterExpansion(supabase, bookingData.id, organizationId, { completeness: productCompleteness, assertLease: assertLeaseOwned }); })();
          if (mainPackingResult.error) {
            results.errors.push({ booking_id: bookingData.id, error: `packing_sync_failed:${mainPackingResult.error}` });
          }
          if (mainPackingResult.changes > 0) {
            console.log(`[Main Flow] Synced ${mainPackingResult.changes} packing list items for booking ${bookingData.id}`);
          }
        } // end if (needsProductUpdate || !existingBooking)
        // RECONNECT PACKING LIST ITEMS after products have been created
        if (needsPackingReconnection && packingIdForReconnection) {
          console.log(`[Packing Reconnect] Starting packing list reconnection for booking ${bookingData.id}`);
          
          // Fetch newly created products (tenant-scoped)
          const { data: newProducts, error: newProductsError } = await supabase
            .from('booking_products')
            .select('id, name, quantity')
            .eq('booking_id', bookingData.id)
            .eq('organization_id', organizationId);

          if (newProductsError) {
            console.error(`[Packing Reconnect] Error loading products:`, newProductsError);
            results.errors.push({ booking_id: bookingData.id, error: `packing_reconnect_products_read_failed:${newProductsError.message || newProductsError}` });
          }

          if (newProducts && newProducts.length > 0) {
            const reconnectResult = await reconnectPackingListItems(
              supabase,
              packingIdForReconnection,
              oldProductsForReconnection,
              newProducts,
              {
                completeness: productCompleteness,
                organizationId,
                bookingId: bookingData.id,
                assertLease: assertLeaseOwned,
              },
            );

            if (reconnectResult.error) {
              results.errors.push({ booking_id: bookingData.id, error: `packing_reconnect_failed:${reconnectResult.error}` });
            }

            console.log(`[Packing Reconnect] Booking ${bookingData.id}: ${reconnectResult.reconnected} items reconnected, ${reconnectResult.orphaned} orphaned, ${reconnectResult.blockedDeletes} deletes blocked`);
            
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
                results.errors.push({ booking_id: bookingData.id, error: `packing_item_insert_failed:${insertError.message || insertError}` });
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

              const attachmentData: any = {
                booking_id: bookingData.id,
                url: attUrl,
                file_name: attFileName,
                file_type: attachment.file_type || attachment.type || 'unknown',
                source: 'import',
                organization_id: organizationId
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
              .eq('id', bookingData.id)
              .eq('organization_id', organizationId);
            if (mdErr) {
              console.error(`[Map Drawing] Error updating map_drawing_url for booking ${bookingData.id}:`, mdErr);
              results.errors.push({ booking_id: bookingData.id, error: `map_drawing_update_failed:${mdErr.message || mdErr}` });
            } else {
              console.log(`[Map Drawing] Updated map_drawing_url for booking ${bookingData.id}`);
            }
          }
        } else if (externalBooking.map_drawing_url && externalBooking.map_drawing_url !== bookingData.map_drawing_url) {
          // Legacy: map_drawing_url directly on the booking object
          const { error: legacyMdErr } = await supabase
            .from('bookings')
            .update({ map_drawing_url: externalBooking.map_drawing_url })
            .eq('id', bookingData.id)
            .eq('organization_id', organizationId);
          if (legacyMdErr) {
            console.error(`[Map Drawing] Legacy map_drawing_url update failed for ${bookingData.id}:`, legacyMdErr);
            results.errors.push({ booking_id: bookingData.id, error: `map_drawing_update_failed:${legacyMdErr.message || legacyMdErr}` });
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

        results.imported++

        // ═══════════════════════════════════════════════════════════════════
        // DETERMINISTIC CALENDAR RECONCILIATION (extracted to helper)
        // ═══════════════════════════════════════════════════════════════════
            await runCalendarReconcile();

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
            assertLeaseOwned('warehouse_events');
            const warehouseEventsCreated = await syncWarehouseEventsForBooking(supabase, bookingData, organizationId);
            results.warehouse_events_created += warehouseEventsCreated;
          } else {
            console.log(`[Warehouse Sync] Skipping for ${bookingData.id} - dates unchanged and not new/justConfirmed`);
          }
          
          // Create packing project for confirmed bookings (STEG 3F: gated + partial-safe)
          assertLeaseOwned('packing_projection');
          const packingResult = await createPackingForBooking(supabase, bookingData, organizationId, projectionSyncCtx);
          if (packingResult.error) {
            console.error(`[Packing] projection failed for ${bookingData.id}: ${packingResult.error}`);
            results.errors.push({ booking_id: bookingData.id, error: `packing_projection_failed:${packingResult.error}` });
            results.failed++;
          } else if (packingResult.created) {
            results.packing_projects_created++;
          }
        }

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error(`Error processing booking ${externalBooking.id}:`, error)
        results.errors.push({ booking_id: externalBooking.id, error: errMsg })
        results.failed++
      }
    }

    // STEG 4E: mätning (endast räknare/durationer, ingen känslig data).
    perf.endBooking();
    perf.logSummary('[import-bookings][perf]');

    // Inline path is single-booking only now — batch modes returned early after
    // enqueue. The cursor is owned by process-sync-jobs via finalizeBatchIfDone;
    // this path must NEVER write sync_state.last_sync_timestamp.
    console.log(`Team distribution summary:`, results.team_distribution)
    console.log(`Unchanged bookings skipped: ${results.unchanged_bookings_skipped.length}`)
    if (isSingleBookingRefresh) {
      console.log('[import-bookings] single-booking inline complete — sync_state untouched (cursor policy)')
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

    // ── Kort-varsel-notiser för nya bokningar (fire-and-forget) ──────────
    // Inom-app-meddelande + mejl till admin/projekt/forsaljning om
    // riggdagen ligger inom 7 dagar.
    if (results.new_bookings.length > 0) {
      try {
        const supabaseUrlForNotify = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        // Fire-and-forget — notifieringen ska aldrig blockera importen
        // och dess fel ska aldrig faila importen.
        const dispatch = fetch(`${supabaseUrlForNotify}/functions/v1/notify-short-notice-bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ booking_ids: results.new_bookings }),
        }).catch((err) => console.warn('[import-bookings] notify-short-notice dispatch failed', err));
        // @ts-ignore — EdgeRuntime finns i Supabase Edge Runtime
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
          // @ts-ignore
          EdgeRuntime.waitUntil(dispatch);
        }
      } catch (err) {
        console.warn('[import-bookings] notify-short-notice setup failed', err);
      }
    }

    // STEG 3G: dry-run — inga DB-mutationer har skett, ingen revision commit:as,
    // ingen cursor flyttas och jobbet markeras aldrig completed.
    if (isDryRun) {
      stopLeaseRenewal();
      if (guardedIncomingRevision && normalizedSingleBookingId) {
        try {
          await releaseCanonicalRevision(supabase, {
            bookingId: normalizedSingleBookingId,
            organizationId,
            incoming: guardedIncomingRevision,
            reservationToken: guardedReservationToken,
          });
        } catch (relErr) {
          console.warn('[import-bookings] dry-run revision release failed', relErr);
        }
      }
      const dryAnomalies = detectSyncAnomalies({ counters: syncCounters });
      logAnomalies(dryAnomalies, { booking_id: normalizedSingleBookingId, organization_id: organizationId });
      const dryAudit = logSyncAudit({
        organization_id: organizationId,
        booking_id: normalizedSingleBookingId,
        outcome: 'dry_run',
        duration_ms: Date.now() - syncStartedMs,
        dry_run: true,
        counters: syncCounters,
        planned_mutations: plannedMutations,
        anomalies: dryAnomalies,
      });
      return new Response(JSON.stringify({
        dry_run: true,
        completed: false,
        cursor_moved: false,
        booking_id: normalizedSingleBookingId,
        organization_id: organizationId,
        planned_mutations: plannedMutations,
        safety_limits: SAFETY_LIMITS,
        audit: dryAudit,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (isSingleBookingRefresh) {
      const outcome = deriveSingleBookingOutcome(results as any);


      // UPPGIFT C/D (2H): applied revision skrivs ENBART av commit-RPC:n, som
      // atomiskt uppdaterar booking_source_state (authoritative current state),
      // speglingen bookings.last_applied_source_revision och auditraden i
      // booking_changes. Ingen revisionsskrivning sker före giltig commit.
      if ((outcome === 'applied' || outcome === 'already_current') && normalizedSingleBookingId) {
        const canonicalRow: any = Array.isArray(externalData?.data) ? externalData.data[0] : null;
        if (guardedIncomingRevision) {
          // STEG 2I: verifiera ägarskapet SYNKRONT direkt före commit — commit
          // får aldrig vara första ägarskapskontrollen efter lång mutation.
          const preCommitFailure = leaseControl ? await leaseControl.renewNow('pre_commit') : null;
          if (preCommitFailure) {
            stopLeaseRenewal();
            console.error('[import-bookings] lease lost before commit', JSON.stringify(preCommitFailure));
            return new Response(JSON.stringify(buildSingleBookingEnvelope({
              bookingId: normalizedSingleBookingId,
              organizationId,
              outcome: 'failed',
              error: preCommitFailure.code,
            })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
          const committed = await commitCanonicalRevision(supabase, {
            bookingId: normalizedSingleBookingId,
            organizationId,
            incoming: guardedIncomingRevision,
            reservationToken: guardedReservationToken,
          });
          stopLeaseRenewal();
          if (!committed.ok) {
            console.error('[import-bookings] revision commit failed', JSON.stringify(committed));
            return new Response(JSON.stringify(buildSingleBookingEnvelope({
              bookingId: normalizedSingleBookingId,
              organizationId,
              outcome: 'partial',
              error: `revision_commit_failed:${committed.decision}`,
            })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
          guardedIncomingRevision = null;
          guardedReservationToken = null;
        } else {
          // Ingen guardad revision (icke-single/legacy-väg) → audit-only-logg.
          const canonicalRevision =
            canonicalRow?.updated_at ?? canonicalRow?.source_updated_at ?? canonicalRow?.version ?? null;
          const logged = await recordAppliedSourceRevision(supabase, {
            bookingId: normalizedSingleBookingId,
            organizationId,
            revision: canonicalRevision,
            sourceStatus: canonicalRow?.status ?? canonicalRow?.booking_status ?? (externalData as any)?.raw?.source_status ?? null,
          });
          if (!logged.ok) {
            console.error('[import-bookings] source revision logging failed', logged.error);
            return new Response(JSON.stringify(buildSingleBookingEnvelope({
              bookingId: normalizedSingleBookingId,
              organizationId,
              outcome: 'partial',
              error: `source_revision_log_failed:${logged.error}`,
            })), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
        }
      } else if (guardedIncomingRevision && normalizedSingleBookingId) {
        // Importen blev inte fullt applicerad → släpp reservationen så att
        // SAMMA revision kan retryas (och aldrig rapporteras som applied).
        stopLeaseRenewal();
        await releaseCanonicalRevision(supabase, {
          bookingId: normalizedSingleBookingId,
          organizationId,
          incoming: guardedIncomingRevision,
          reservationToken: guardedReservationToken,
        });
      }

      const envelope = buildSingleBookingEnvelope({
        bookingId: normalizedSingleBookingId,
        organizationId,
        outcome,
        results,
      });

      // STEG 3G: strukturerad sync-audit + anomalidetektering (aldrig secrets).
      syncCounters.failures = results.failed ?? 0;
      if (outcome === 'partial') syncCounters.partial_failures += 1;
      const auditRow: any = Array.isArray(externalData?.data) ? externalData.data[0] : null;
      const anomalies = detectSyncAnomalies({
        counters: syncCounters,
        sourceRevision: typeof auditRow?.version === 'number' ? auditRow.version : null,
        recentPartialFailures: syncCounters.partial_failures,
      });
      logAnomalies(anomalies, { booking_id: normalizedSingleBookingId, organization_id: organizationId });
      logSyncAudit({
        organization_id: organizationId,
        booking_id: normalizedSingleBookingId,
        booking_number: auditRow?.booking_number ?? auditRow?.number ?? null,
        source_revision: auditRow?.updated_at ?? auditRow?.source_updated_at ?? auditRow?.version ?? null,
        previous_applied_revision: null,
        outcome,
        duration_ms: Date.now() - syncStartedMs,
        worker_id: typeof body?.worker_id === 'string' ? body.worker_id : null,
        batch_id: typeof body?.batch_id === 'string' ? body.batch_id : null,
        dry_run: false,
        counters: syncCounters,
        anomalies,
      });

      console.log('[import-bookings] single result contract', JSON.stringify({
        booking_id: envelope.booking_id,
        organization_id: envelope.organization_id,
        outcome: envelope.outcome,
        completed: envelope.completed,
      }));

      return new Response(JSON.stringify(envelope), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    // STEG 3I: fail-closed när radantal inte kan fastställas eller okänd RPC
    // körs i dry-run. Ingen mutation har skett; svar = failed.
    if (error instanceof UnknownDestructiveRowCountError || (error as any)?.code === UNKNOWN_RPC_IN_DRY_RUN) {
      stopLeaseRenewal()
      syncCounters.failures += 1
      const failCode = (error as any)?.code ?? UNKNOWN_DESTRUCTIVE_ROW_COUNT
      logSyncAudit({
        organization_id: ctxOrgId,
        booking_id: ctxBookingId,
        outcome: 'failed',
        duration_ms: Date.now() - syncStartedMs,
        dry_run: isDryRun,
        counters: syncCounters,
        planned_mutations: isDryRun ? plannedMutations : null,
        anomalies: [failCode],
      })
      return new Response(
        JSON.stringify(buildSingleBookingEnvelope({
          bookingId: ctxBookingId,
          organizationId: ctxOrgId,
          outcome: 'failed',
          error: failCode,
        })),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }
    // STEG 3G: circuit breaker — stoppade FÖRE mutationen. Aldrig completed,
    // ingen commit, ingen cursor; reservationen släpps som vid krasch nedan.
    if (error instanceof SafetyCircuitBreakerError) {
      stopLeaseRenewal()
      syncCounters.failures += 1
      logSyncAudit({
        organization_id: ctxOrgId,
        booking_id: ctxBookingId,
        outcome: 'failed',
        duration_ms: Date.now() - syncStartedMs,
        dry_run: isDryRun,
        counters: syncCounters,
        planned_mutations: isDryRun ? plannedMutations : null,
        anomalies: [SAFETY_CIRCUIT_BREAKER],
      })
      if (guardedIncomingRevision && ctxBookingId && ctxOrgId && supabase) {
        try {
          await releaseCanonicalRevision(supabase, {
            bookingId: ctxBookingId,
            organizationId: ctxOrgId,
            incoming: guardedIncomingRevision,
            reservationToken: guardedReservationToken,
          })
        } catch (relErr) {
          console.error('[import-bookings] revision release failed after circuit breaker', relErr)
        }
      }
      return new Response(
        JSON.stringify(buildSingleBookingEnvelope({
          bookingId: ctxBookingId,
          organizationId: ctxOrgId,
          outcome: 'failed',
          error: error.detail.reason ?? SAFETY_CIRCUIT_BREAKER,
        })),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }
    // STEG 2I: förlorat/overifierat lease-ägarskap → ingen commit, ingen
    // applied/completed, ingen cursorförflyttning. Release endast om vi
    // fortfarande äger token.
    if (error instanceof LeaseOwnershipLostError) {
      const failure = error.failure
      stopLeaseRenewal()
      syncCounters.lease_losses += 1
      logSyncAudit({
        organization_id: ctxOrgId,
        booking_id: ctxBookingId,
        outcome: 'failed',
        duration_ms: Date.now() - syncStartedMs,
        dry_run: isDryRun,
        counters: syncCounters,
        anomalies: ['lease_takeover'],
      })
      console.error('[import-bookings] import aborted — lease ownership lost', JSON.stringify(failure))

      if (failure.kind === 'unverified' && guardedIncomingRevision && ctxBookingId && ctxOrgId) {
        try {
          await releaseCanonicalRevision(supabase, {
            bookingId: ctxBookingId,
            organizationId: ctxOrgId,
            incoming: guardedIncomingRevision,
            reservationToken: guardedReservationToken,
          })
        } catch (relErr) {
          console.error('[import-bookings] revision release failed after lease loss', relErr)
        }
      }
      return new Response(
        JSON.stringify(buildSingleBookingEnvelope({
          bookingId: ctxBookingId,
          organizationId: ctxOrgId,
          outcome: 'failed',
          error: failure.code,
        })),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[import-bookings] Pipeline failed', JSON.stringify({
      error: errMsg,
      import_started: null,
      import_completed: new Date().toISOString(),
    }))
    // STEG 2G/2H: importen kraschade → stoppa lease-förnyaren och släpp
    // pending-reservationen (med ägartoken) så att SAMMA revision kan retryas.
    stopLeaseRenewal();
    if (guardedIncomingRevision && ctxBookingId && ctxOrgId) {
      try {
        await releaseCanonicalRevision(supabase, {
          bookingId: ctxBookingId,
          organizationId: ctxOrgId,
          incoming: guardedIncomingRevision,
          reservationToken: guardedReservationToken,
        });
      } catch (relErr) {
        console.error('[import-bookings] revision release failed after crash', relErr);
      }
    }

    if (ctxIsSingle) {
      return new Response(
        JSON.stringify(buildSingleBookingEnvelope({
          bookingId: ctxBookingId,
          organizationId: ctxOrgId,
          outcome: 'failed',
          error: errMsg,
        })),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      )
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errMsg,
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
          errors: [errMsg],
          sync_mode: 'failed',
          team_distribution: {}
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  } finally {
    // STEG 2I: ingen renewal-timer får leva kvar efter att funktionen avslutas
    // (success, partial, error, early return, already_current, låsfel, exception).
    stopLeaseRenewal()
  }
})

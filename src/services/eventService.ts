/**
 * ============================================================
 * eventService.ts — Calendar Event Data Access Layer
 * ============================================================
 * 
 * ARCHITECTURE RULES (strict):
 * 
 * 1. SINGLE WRITER for booking→calendar sync:
 *    supabase/functions/import-bookings/index.ts
 *    The backend reconciler is the ONLY code that creates, updates,
 *    or deletes calendar_events based on booking state.
 * 
 * 2. PLANNER UI OPERATIONS (this file):
 *    The frontend may perform manual planner operations:
 *    - Drag-and-drop (move event between dates/teams)
 *    - Time editing (change start/end time)
 *    - Manual event creation (add extra rigg/event/rigDown day)
 *    - Copy/duplicate events
 *    - Delete events
 *    These operations MUST also update the bookings table so the
 *    next import-bookings reconciliation sees matching data.
 * 
 * 3. FORBIDDEN patterns:
 *    - useEffect that syncs bookings → calendar
 *    - Health check / restore / recovery logic
 *    - Batch sync from bookings table
 *    - Any "ensure events exist" logic
 * 
 * 4. CALENDAR EVENT IDENTITY:
 *    Stable key = (booking_id, event_type, source_date, organization_id)
 *    start_time is NOT part of identity.
 * ============================================================
 */

import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { convertToISO8601 } from '@/utils/dateUtils';
import { addDays, subDays, format } from 'date-fns';
import { buildPlannerCalendarEvents } from './plannerCalendarDerivation';

export interface CalendarEventUpdate {
  start?: string;
  end?: string;
  resourceId?: string;
  title?: string;
  delivery_address?: string;
}

// ─── READ OPERATIONS ───────────────────────────────────────

/**
 * Wrappar en PostgREST-request med timeout så att en hängande nätverksrequest
 * aldrig kan låsa hela kalender-laddningen. Returnerar samma form som
 * Supabase ({ data, error, ... }) så kallande kod inte behöver särfall.
 */
const withTimeout = async <T,>(
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[fetchCalendarEvents] Timeout efter ${ms}ms: ${label}`));
    }, ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const PRIMARY_QUERY_TIMEOUT_MS = 15_000;
const SECONDARY_QUERY_TIMEOUT_MS = 10_000;


export const fetchCalendarEvents = async (): Promise<CalendarEvent[]> => {
  const t0 = performance.now();
  console.log('📅 [fetchCalendarEvents] Starting fetch...');
  
  // Check auth state first
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('❌ [fetchCalendarEvents] Auth session error:', sessionError.message);
  } else if (!sessionData?.session) {
    console.warn('⚠️ [fetchCalendarEvents] No active session — user may not be logged in');
  } else {
    console.log('🔑 [fetchCalendarEvents] Session OK, user:', sessionData.session.user.id.slice(0, 8) + '...');
  }

  // Paginated fetch — PostgREST hard caps single requests at 1000 rows.
  // Loop with .range() until a partial page is returned.
  const PAGE_SIZE = 1000;
  const CALENDAR_WINDOW_DAYS_BACK = 60;
  const CALENDAR_WINDOW_DAYS_FORWARD = 365;
  const windowFrom = format(subDays(new Date(), CALENDAR_WINDOW_DAYS_BACK), 'yyyy-MM-dd');
  const windowTo = format(addDays(new Date(), CALENDAR_WINDOW_DAYS_FORWARD), 'yyyy-MM-dd');

  const realRows: any[] = [];
  let pageIndex = 0;
  // Hard safety cap to avoid runaway loops (10 pages = 10 000 rader).
  const MAX_PAGES = 20;
  while (pageIndex < MAX_PAGES) {
    const fromIdx = pageIndex * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1;
    const { data, error, status, statusText } = await withTimeout(
      supabase
        .from('calendar_events')
        .select(`
          id,
          title,
          start_time,
          end_time,
          resource_id,
          booking_id,
          event_type,
          delivery_address,
          booking_number,
          source_date,
          times_locked,
          todo_id,
          customer_pickup
        `)
        .neq('event_type', 'event')
        .gte('start_time', windowFrom)
        .lte('start_time', windowTo)
        .order('start_time', { ascending: true })
        .range(fromIdx, toIdx),
      PRIMARY_QUERY_TIMEOUT_MS,
      `calendar_events page ${pageIndex}`,
    );


    if (error) {
      const elapsed = Math.round(performance.now() - t0);
      console.error(`❌ [fetchCalendarEvents] Failed page ${pageIndex} in ${elapsed}ms — HTTP ${status} ${statusText}`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw error;
    }

    const rows = data || [];
    realRows.push(...rows);
    pageIndex += 1;
    if (rows.length < PAGE_SIZE) break;
    if (pageIndex === MAX_PAGES) {
      console.warn(`⚠️ [fetchCalendarEvents] Hit MAX_PAGES (${MAX_PAGES}) — there may be more rows beyond ${realRows.length}. Increase MAX_PAGES or shrink window.`);
    }
  }

  const elapsed = Math.round(performance.now() - t0);
  console.log(`✅ [fetchCalendarEvents] Fetched ${realRows.length} real calendar rows across ${pageIndex} page(s) in ${elapsed}ms (window ${windowFrom} → ${windowTo})`);
  const fromDate = realRows.length > 0
    ? extractMinDate(realRows.map(event => event.source_date || event.start_time))
    : format(subDays(new Date(), 14), 'yyyy-MM-dd');
  const toDate = realRows.length > 0
    ? extractMaxDate(realRows.map(event => event.source_date || event.start_time))
    : format(addDays(new Date(), 45), 'yyyy-MM-dd');

  const [bookingsRes, projectsRes] = await Promise.all([
    withTimeout(
      supabase
        .from('bookings')
        .select('id, client, title, booking_number, deliveryaddress, large_project_id, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time, status, rig_time_locked, event_time_locked, rigdown_time_locked, customer_pickup, calendar_color')
        .or(`and(rigdaydate.gte.${fromDate},rigdaydate.lte.${toDate}),and(eventdate.gte.${fromDate},eventdate.lte.${toDate}),and(rigdowndate.gte.${fromDate},rigdowndate.lte.${toDate})`),
      SECONDARY_QUERY_TIMEOUT_MS,
      'bookings fallback window',
    ).catch(err => ({ data: null, error: err as any })),
    withTimeout(
      supabase
        .from('large_projects')
        .select('id, name, project_number, address, start_date, event_date, end_date, deleted_at')
        .is('deleted_at', null),
      SECONDARY_QUERY_TIMEOUT_MS,
      'large_projects fallback',
    ).catch(err => ({ data: null, error: err as any })),
  ]);

  const bookingsData = bookingsRes.data;
  const bookingsError = bookingsRes.error;
  const projectsData = projectsRes.data;
  const projectsError = projectsRes.error;

  if (bookingsError) {
    console.warn('⚠️ [fetchCalendarEvents] Booking fallback fetch failed — fortsätter utan bookings-enrichment:', bookingsError);
  }

  if (projectsError) {
    console.warn('⚠️ [fetchCalendarEvents] Large project fallback fetch failed — fortsätter utan large-project-enrichment:', projectsError);
  }

  const bookingIds = Array.from(new Set(bookingRows.map(booking => booking.id).filter(Boolean))) as string[];
  const realBookingIds = Array.from(new Set(realRows.map((row: any) => row.booking_id).filter(Boolean))) as string[];
  // Union: master = any booking_id touched by either calendar_events or fallback bookings window
  const allRelevantBookingIds = Array.from(new Set([...realBookingIds, ...bookingIds]));
  const relevantProjectIdsFromBookings = Array.from(new Set(bookingRows.map(booking => booking.large_project_id).filter(Boolean))) as string[];

  // large_project_bookings is master — resolve by booking_id (not by large_project_id)
  // so events get classified as part of a large project even when bookings.large_project_id is null.
  const [{ data: largeProjectBookingsData, error: largeProjectBookingsError }, { data: bookingAssignmentsData, error: bookingAssignmentsError }] = await Promise.all([
    allRelevantBookingIds.length > 0
      ? supabase
          .from('large_project_bookings')
          .select('large_project_id, booking_id')
          .in('booking_id', allRelevantBookingIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase
          .from('booking_staff_assignments')
          .select('booking_id, team_id, assignment_date')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (largeProjectBookingsError) {
    console.error('❌ [fetchCalendarEvents] Failed to fetch large_project_bookings master rows:', largeProjectBookingsError);
    throw largeProjectBookingsError;
  }

  if (bookingAssignmentsError) {
    console.error('❌ [fetchCalendarEvents] Failed to fetch booking_staff_assignments fallback rows:', bookingAssignmentsError);
    throw bookingAssignmentsError;
  }

  const largeProjectIdsFromMembership = Array.from(
    new Set((largeProjectBookingsData || []).map(row => row.large_project_id).filter(Boolean))
  ) as string[];

  const allProjectIds = Array.from(new Set([
    ...relevantProjectIdsFromBookings,
    ...largeProjectIdsFromMembership,
    ...((projectsData || []).map(p => p.id)),
  ]));

  // Ensure we have large_projects rows for every membership-derived id (not just those already loaded by deleted_at filter window)
  const loadedProjectIds = new Set((projectsData || []).map(p => p.id));
  const missingProjectIds = allProjectIds.filter(id => !loadedProjectIds.has(id));
  let extraProjects: any[] = [];
  if (missingProjectIds.length > 0) {
    const { data: extra, error: extraErr } = await supabase
      .from('large_projects')
      .select('id, name, project_number, address, start_date, event_date, end_date, deleted_at')
      .in('id', missingProjectIds)
      .is('deleted_at', null);
    if (extraErr) {
      console.warn('⚠️ [fetchCalendarEvents] Failed to fetch additional large_projects by membership:', extraErr);
    } else {
      extraProjects = extra || [];
    }
  }

  const { data: lptaData, error: lptaError } = allProjectIds.length > 0
    ? await supabase
        .from('large_project_team_assignments')
        .select('large_project_id, phase, assignment_date, team_id')
        .in('large_project_id', allProjectIds)
    : { data: [], error: null };

  if (lptaError) {
    console.warn('⚠️ [fetchCalendarEvents] Failed to fetch large_project_team_assignments:', lptaError);
  }

  const combinedLargeProjects = [...(projectsData || []), ...extraProjects];

  if (import.meta.env?.DEV) {
    const lpRows = largeProjectBookingsData || [];
    const lpBookingIdSet = new Set(lpRows.map(r => r.booking_id));
    // booking_ids that exist in large_project_bookings BUT where bookings.large_project_id is null/missing
    const fallbackOnlyExamples = (bookingsData || [])
      .filter(b => lpBookingIdSet.has(b.id) && !b.large_project_id)
      .slice(0, 5)
      .map(b => ({ id: b.id, booking_number: b.booking_number, client: b.client }));

    console.info('[large-project-membership-fetch]', {
      realBookingIds: realBookingIds.length,
      bookingRows: (bookingsData || []).length,
      largeProjectBookings: lpRows.length,
      largeProjectIdsFound: largeProjectIdsFromMembership.length,
      relevantProjectIdsFromBookings: relevantProjectIdsFromBookings.length,
      combinedLargeProjects: combinedLargeProjects.length,
      lpMembershipWithoutBookingFlag: fallbackOnlyExamples,
    });
  }

  const events = buildPlannerCalendarEvents({
    realEvents: realRows,
    bookings: bookingRows,
    largeProjects: combinedLargeProjects.filter(project => {
      // Always keep projects discovered via membership (they're explicitly relevant)
      if (largeProjectIdsFromMembership.includes(project.id) || relevantProjectIdsFromBookings.includes(project.id)) {
        return true;
      }
      const allDates = [...(project.start_date || []), ...(project.event_date || []), ...(project.end_date || [])];
      return allDates.some(date => date >= fromDate && date <= toDate);
    }),
    largeProjectBookings: largeProjectBookingsData || [],
    bookingAssignments: bookingAssignmentsData || [],
    largeProjectTeamAssignments: lptaData || [],
    fromDate,
    toDate,
  }).map(event => ({
    ...event,
    start: convertToISO8601(event.start),
    end: convertToISO8601(event.end),
  }));

  console.log(`✅ [fetchCalendarEvents] Returning ${events.length} planner events (${realRows.length} real + fallback)`);
  return events;
};

const extractMinDate = (values: Array<string | null | undefined>) => values
  .map(value => String(value || '').slice(0, 10))
  .filter(Boolean)
  .sort()[0] || format(subDays(new Date(), 14), 'yyyy-MM-dd');

const extractMaxDate = (values: Array<string | null | undefined>) => values
  .map(value => String(value || '').slice(0, 10))
  .filter(Boolean)
  .sort()
  .at(-1) || format(addDays(new Date(), 45), 'yyyy-MM-dd');

export const fetchEventsByBookingId = async (bookingId: string): Promise<CalendarEvent[]> => {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      id,
      title,
      start_time,
      end_time,
      resource_id,
      booking_id,
      event_type,
      delivery_address,
      booking_number
    `)
    .eq('booking_id', bookingId)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('❌ Error fetching calendar events for booking:', error);
    throw error;
  }

  const events: CalendarEvent[] = (data || []).map(event => ({
    id: event.id,
    title: event.title,
    start: convertToISO8601(event.start_time),
    end: convertToISO8601(event.end_time),
    resourceId: event.resource_id,
    bookingId: event.booking_id,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: event.delivery_address,
    booking_number: event.booking_number,
    extendedProps: {
      bookingId: event.booking_id,
      booking_id: event.booking_id,
      resourceId: event.resource_id,
      deliveryAddress: event.delivery_address,
      deliveryCity: null,
      deliveryPostalCode: null,
      bookingNumber: event.booking_number,
      eventType: event.event_type,
      manuallyAssigned: false
    }
  }));

  return events;
};

// ─── PLANNER UI WRITE OPERATIONS ───────────────────────────
// These are for manual planner actions (drag-drop, time edit, manual add).
// They are NOT for booking→calendar sync (that's backend-only).

/**
 * Create a calendar event from a manual planner action.
 * Used by: AddRiggDayDialog, CopyEventDialog, useDuplicateEvent.
 * 
 * NOTE: Callers MUST also update the bookings table so the backend
 * reconciler doesn't delete this event on the next sync.
 */
export const createCalendarEvent = async (event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> => {
  return addCalendarEvent(event);
};

export const addCalendarEvent = async (event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> => {
  console.log('📝 [Planner UI] Adding new calendar event:', event.title);
  
  const sourceDate = event.start?.split('T')[0] || new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('calendar_events')
    .upsert(
      {
        title: event.title,
        start_time: event.start,
        end_time: event.end,
        resource_id: event.resourceId,
        booking_id: event.bookingId,
        event_type: event.eventType,
        delivery_address: event.delivery_address,
        booking_number: event.booking_number,
        source_date: sourceDate,
      },
      { onConflict: 'booking_id,event_type,source_date,organization_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('❌ Error adding calendar event:', error);
    throw error;
  }

  return {
    id: data.id,
    title: data.title,
    start: convertToISO8601(data.start_time),
    end: convertToISO8601(data.end_time),
    resourceId: data.resource_id,
    bookingId: data.booking_id,
    eventType: data.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: data.delivery_address,
    booking_number: data.booking_number,
    extendedProps: {
      bookingId: data.booking_id,
      booking_id: data.booking_id,
      resourceId: data.resource_id,
      deliveryAddress: data.delivery_address,
      deliveryCity: null,
      deliveryPostalCode: null,
      bookingNumber: data.booking_number,
      eventType: data.event_type,
      manuallyAssigned: false
    }
  };
};

/**
 * Update a calendar event from a planner UI action.
 * Used by: drag-drop, time editing, team reassignment.
 *
 * Time updates flow through `syncPhaseTime` so the booking row AND every
 * sibling booking in the same large project (matching phase + date) stay in
 * lockstep. Returns the updated CalendarEvent and the number of sibling
 * bookings that were synchronized.
 */
export const updateCalendarEvent = async (
  eventId: string, 
  updates: CalendarEventUpdate
): Promise<CalendarEvent & { syncedSiblings?: number }> => {
  console.log('📝 [Planner UI] Updating calendar event:', eventId);

  const isTimeChange = !!updates.start || !!updates.end;

  // ── Lock guard ──
  // If the caller wants to change start/end and the booking phase is locked
  // ("Fast tid"), refuse the write here BEFORE we touch calendar_events.
  // Otherwise the calendar row would already be moved before syncPhaseTime
  // got a chance to block, leaving UI and bookings out of sync.
  if (isTimeChange) {
    const { data: existingEvent } = await supabase
      .from('calendar_events')
      .select('booking_id, event_type, source_date, times_locked')
      .eq('id', eventId)
      .maybeSingle();

    // Per-day lock (calendar_events.times_locked) takes precedence
    if (existingEvent?.times_locked === true) {
      const err = new Error('Tiden är låst för denna dag – lås upp i popovern för att flytta');
      (err as any).code = 'TIME_LOCKED';
      console.warn('[updateCalendarEvent] blocked by per-day lock', { eventId });
      throw err;
    }

    if (existingEvent?.booking_id && existingEvent?.event_type) {
      const phase = existingEvent.event_type as 'rig' | 'event' | 'rigDown';
      const lockCol = phase === 'rig'
        ? 'rig_time_locked'
        : phase === 'event'
        ? 'event_time_locked'
        : phase === 'rigDown'
        ? 'rigdown_time_locked'
        : null;
      if (lockCol) {
        const { data: bRow } = await supabase
          .from('bookings')
          .select(`id, ${lockCol}`)
          .eq('id', existingEvent.booking_id)
          .maybeSingle();
        if (bRow && (bRow as any)[lockCol] === true) {
          const err = new Error('Tiden är låst – bocka ur "Fast tid" för att flytta');
          (err as any).code = 'TIME_LOCKED';
          console.warn('[updateCalendarEvent] blocked by lock', { eventId, phase });
          throw err;
        }
      }
    }
  }

  const updateData: any = {};
  if (updates.start) {
    updateData.start_time = updates.start;
    // Keep source_date in sync with the new start so the reconciler

    // doesn't see a date mismatch and recreate / move the event back.
    updateData.source_date = String(updates.start).slice(0, 10);
  }
  if (updates.end) updateData.end_time = updates.end;
  if (updates.resourceId) updateData.resource_id = updates.resourceId;
  if (updates.title) updateData.title = updates.title;
  if (updates.delivery_address) updateData.delivery_address = updates.delivery_address;

  let { data, error } = await supabase
    .from('calendar_events')
    .update(updateData)
    .eq('id', eventId)
    .select()
    .single();

  // Hantera unique-conflict (booking_id, event_type, source_date):
  // Om mål-datumet redan har en rad → MERGE: uppdatera mål-raden med våra
  // nya värden och radera källraden. Returnera mål-raden.
  if (error && (error as any).code === '23505') {
    console.warn('[updateCalendarEvent] 23505 unique conflict — merging into existing target row');

    // Läs källraden så vi vet booking_id + event_type + det datum vi siktade på
    const { data: src, error: srcErr } = await supabase
      .from('calendar_events')
      .select('id, booking_id, event_type')
      .eq('id', eventId)
      .single();

    if (srcErr || !src) throw error; // fall back to original error

    const targetDate = updateData.source_date as string | undefined;
    if (!targetDate || !src.booking_id || !src.event_type) throw error;

    // Hitta mål-raden (samma booking + phase + datum)
    const { data: targetRow, error: tErr } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('booking_id', src.booking_id)
      .eq('event_type', src.event_type)
      .eq('source_date', targetDate)
      .neq('id', eventId)
      .single();

    if (tErr || !targetRow) throw error;

    // Uppdatera mål-raden med samma payload
    const { data: merged, error: mErr } = await supabase
      .from('calendar_events')
      .update(updateData)
      .eq('id', targetRow.id)
      .select()
      .single();

    if (mErr) throw mErr;

    // Radera källraden (den vi inte längre behöver)
    const { error: dErr } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId);

    if (dErr) console.warn('[updateCalendarEvent] failed to delete source row after merge', dErr);

    data = merged;
    error = null;
    console.log('✅ [updateCalendarEvent] merged into existing row', { from: eventId, into: targetRow.id });
  }

  if (error) {
    console.error('❌ Error updating calendar event:', error);
    throw error;
  }

  // Mirror the new time onto bookings.<phase>_*_time and propagate to all
  // sibling bookings in the same large project (no-op for plain bookings).
  let syncedSiblings = 0;
  if (updates.start && updates.end && data.booking_id && data.event_type && data.source_date) {
    // Detect large-project booking — if so, this code path is the wrong one
    // (UI should use moveLargeProjectDay). We still attempt the sync but
    // surface failures hard so the user is not told "saved" while bookings
    // remain on the old time and reconcile snaps them back.
    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('large_project_id')
      .eq('id', data.booking_id)
      .maybeSingle();
    const isLargeProject = Boolean(bookingRow?.large_project_id);

    if (isLargeProject) {
      console.warn(
        '[updateCalendarEvent] called on a large-project booking — UI should use moveLargeProjectDay',
        { eventId, bookingId: data.booking_id, largeProjectId: bookingRow?.large_project_id }
      );
    }

    try {
      const { syncFromCalendarEvent } = await import('@/services/timeSync');
      const res = await syncFromCalendarEvent({
        booking_id: data.booking_id,
        event_type: data.event_type,
        source_date: data.source_date,
        start_time: data.start_time,
        end_time: data.end_time,
      });
      syncedSiblings = res?.syncedSiblings ?? 0;
    } catch (e) {
      if (isLargeProject) {
        console.error('[updateCalendarEvent] timeSync failed for large project — failing hard', e);
        throw new Error(
          'Tid kunde inte synkas till alla bokningar i det stora projektet. Försök igen eller använd projektvyn.'
        );
      }
      console.warn('[updateCalendarEvent] timeSync failed (non-fatal)', e);
    }
  }

  return {
    id: data.id,
    title: data.title,
    start: convertToISO8601(data.start_time),
    end: convertToISO8601(data.end_time),
    resourceId: data.resource_id,
    bookingId: data.booking_id,
    eventType: data.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: data.delivery_address,
    booking_number: data.booking_number,
    extendedProps: {
      bookingId: data.booking_id,
      booking_id: data.booking_id,
      resourceId: data.resource_id,
      deliveryAddress: data.delivery_address,
      deliveryCity: null,
      deliveryPostalCode: null,
      bookingNumber: data.booking_number,
      eventType: data.event_type,
      manuallyAssigned: false
    },
    syncedSiblings,
  };
};

/**
 * Delete a calendar event from a planner UI action.
 * Used by: manual delete via context menu.
 * 
 * NOTE: Callers SHOULD also clear the corresponding booking date field
 * so the backend reconciler doesn't recreate the event.
 */
export const deleteCalendarEvent = async (eventId: string): Promise<void> => {
  console.log('🗑️ [Planner UI] Deleting calendar event:', eventId);
  
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', eventId);

  if (error) {
    console.error('❌ Error deleting calendar event:', error);
    throw error;
  }
};

/**
 * Toggle "Fast tid" for a calendar event.
 *
 * Unified lock model: for phase events (rig/event/rigDown) tied to a booking,
 * we delegate to `setPhaseLock` which writes the canonical
 * `bookings.<phase>_time_locked` flag (and propagates to siblings in large
 * projects). This is the SAME flag that import-bookings sets when an external
 * booking arrives with fixed times — so toggling it here flips the same
 * source of truth as the booking-import lock and the QuickTimeEditPopover
 * "Fast tid" checkbox.
 *
 * For non-phase events (e.g. todo) without a phase mapping, we fall back to
 * the per-row `calendar_events.times_locked` column.
 */
export const setCalendarEventTimesLocked = async (
  eventId: string,
  locked: boolean
): Promise<void> => {
  const { setPhaseLock } = await import('./timeSync');

  const { data: row, error: selErr } = await supabase
    .from('calendar_events')
    .select('id, booking_id, event_type')
    .eq('id', eventId)
    .maybeSingle();
  if (selErr) {
    console.error('❌ [setCalendarEventTimesLocked] lookup', selErr);
    throw selErr;
  }

  const phase = row?.event_type as 'rig' | 'event' | 'rigDown' | undefined;
  const isPhaseEvent = phase === 'rig' || phase === 'event' || phase === 'rigDown';

  if (row?.booking_id && isPhaseEvent) {
    // Canonical path — single source of truth on bookings.<phase>_time_locked.
    await setPhaseLock(row.booking_id, phase, locked);
    // Mirror to calendar_events.times_locked too so any legacy reader stays
    // in sync (derivation already ORs both, but this keeps the row clean).
    await supabase
      .from('calendar_events')
      .update({ times_locked: locked })
      .eq('id', eventId);
    console.log(`🔒 [Planner UI] phase-lock ${phase}=${locked} via setPhaseLock`, {
      eventId,
      bookingId: row.booking_id,
    });
    return;
  }

  // Fallback for non-phase / non-booking events.
  const { error } = await supabase
    .from('calendar_events')
    .update({ times_locked: locked })
    .eq('id', eventId);
  if (error) {
    console.error('❌ [setCalendarEventTimesLocked]', error);
    throw error;
  }
  console.log(`🔒 [Planner UI] times_locked=${locked} for event ${eventId}`);
};

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

  const { data, error, status, statusText } = await supabase
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
      source_date
    `)
    .order('start_time', { ascending: true });

  const elapsed = Math.round(performance.now() - t0);

  if (error) {
    console.error(`❌ [fetchCalendarEvents] Failed in ${elapsed}ms — HTTP ${status} ${statusText}`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  console.log(`✅ [fetchCalendarEvents] Fetched ${data?.length || 0} real calendar rows in ${elapsed}ms (HTTP ${status})`);

  const realRows = data || [];
  const fromDate = realRows.length > 0
    ? extractMinDate(realRows.map(event => event.source_date || event.start_time))
    : format(subDays(new Date(), 14), 'yyyy-MM-dd');
  const toDate = realRows.length > 0
    ? extractMaxDate(realRows.map(event => event.source_date || event.start_time))
    : format(addDays(new Date(), 45), 'yyyy-MM-dd');

  const [{ data: bookingsData, error: bookingsError }, { data: projectsData, error: projectsError }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, client, booking_number, deliveryaddress, large_project_id, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time, status')
      .or(`and(rigdaydate.gte.${fromDate},rigdaydate.lte.${toDate}),and(eventdate.gte.${fromDate},eventdate.lte.${toDate}),and(rigdowndate.gte.${fromDate},rigdowndate.lte.${toDate})`),
    supabase
      .from('large_projects')
      .select('id, name, address, start_date, event_date, end_date, deleted_at')
      .is('deleted_at', null),
  ]);

  if (bookingsError) {
    console.error('❌ [fetchCalendarEvents] Failed to fetch booking fallback rows:', bookingsError);
    throw bookingsError;
  }

  if (projectsError) {
    console.error('❌ [fetchCalendarEvents] Failed to fetch large project fallback rows:', projectsError);
    throw projectsError;
  }

  const bookingRows = bookingsData || [];
  const bookingIds = Array.from(new Set(bookingRows.map(booking => booking.id).filter(Boolean))) as string[];
  const relevantProjectIds = Array.from(new Set(bookingRows.map(booking => booking.large_project_id).filter(Boolean))) as string[];

  const [{ data: largeProjectBookingsData, error: largeProjectBookingsError }, { data: bookingAssignmentsData, error: bookingAssignmentsError }] = await Promise.all([
    relevantProjectIds.length > 0
      ? supabase
          .from('large_project_bookings')
          .select('large_project_id, booking_id')
          .in('large_project_id', relevantProjectIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? supabase
          .from('booking_staff_assignments')
          .select('booking_id, team_id, assignment_date')
          .in('booking_id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (largeProjectBookingsError) {
    console.error('❌ [fetchCalendarEvents] Failed to fetch large_project_bookings fallback rows:', largeProjectBookingsError);
    throw largeProjectBookingsError;
  }

  if (bookingAssignmentsError) {
    console.error('❌ [fetchCalendarEvents] Failed to fetch booking_staff_assignments fallback rows:', bookingAssignmentsError);
    throw bookingAssignmentsError;
  }

  const allProjectIds = Array.from(new Set([
    ...relevantProjectIds,
    ...((projectsData || []).map(p => p.id)),
  ]));

  const { data: lptaData, error: lptaError } = allProjectIds.length > 0
    ? await supabase
        .from('large_project_team_assignments')
        .select('large_project_id, phase, assignment_date, team_id')
        .in('large_project_id', allProjectIds)
    : { data: [], error: null };

  if (lptaError) {
    console.warn('⚠️ [fetchCalendarEvents] Failed to fetch large_project_team_assignments:', lptaError);
  }

  const events = buildPlannerCalendarEvents({
    realEvents: realRows,
    bookings: bookingRows,
    largeProjects: (projectsData || []).filter(project => {
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
    .insert({
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      resource_id: event.resourceId,
      booking_id: event.bookingId,
      event_type: event.eventType,
      delivery_address: event.delivery_address,
      booking_number: event.booking_number,
      source_date: sourceDate
    })
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
 * NOTE: Callers updating time/date MUST also update the bookings table.
 */
export const updateCalendarEvent = async (
  eventId: string, 
  updates: CalendarEventUpdate
): Promise<CalendarEvent> => {
  console.log('📝 [Planner UI] Updating calendar event:', eventId);
  
  const updateData: any = {};
  if (updates.start) updateData.start_time = updates.start;
  if (updates.end) updateData.end_time = updates.end;
  if (updates.resourceId) updateData.resource_id = updates.resourceId;
  if (updates.title) updateData.title = updates.title;
  if (updates.delivery_address) updateData.delivery_address = updates.delivery_address;

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updateData)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating calendar event:', error);
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

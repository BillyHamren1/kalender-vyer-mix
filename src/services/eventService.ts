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

export interface CalendarEventUpdate {
  start?: string;
  end?: string;
  resourceId?: string;
  title?: string;
  delivery_address?: string;
}

// ─── READ OPERATIONS ───────────────────────────────────────

export const fetchCalendarEvents = async (): Promise<CalendarEvent[]> => {
  console.log('📅 Fetching calendar events from database...');
  
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
      booking_number,
      source_date
    `)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('❌ Error fetching calendar events:', error);
    throw error;
  }

  console.log(`✅ Fetched ${data?.length || 0} calendar events`);

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
      sourceDate: event.source_date,
      manuallyAssigned: false
    }
  }));

  return events;
};

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

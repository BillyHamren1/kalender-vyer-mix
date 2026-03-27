/**
 * bookingCalendarService.ts
 * 
 * READ-ONLY calendar service for the Planning frontend.
 * 
 * All booking → calendar_events transformation is handled by the backend
 * (import-bookings edge function). The frontend MUST NOT create, repair,
 * or sync calendar events from bookings.
 * 
 * This file retains only read helpers and the status change function
 * which updates the booking status (the backend handles calendar side-effects).
 */

import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';

/**
 * Update booking status in the database.
 * Calendar side-effects (event creation/removal) are handled by the backend
 * via the booking change trigger and import-bookings pipeline.
 */
export const smartUpdateBookingCalendar = async (
  bookingId: string, 
  oldBooking: any, 
  newBooking: any
): Promise<void> => {
  // No-op: calendar sync is now fully backend-driven.
  // This function is kept as a stub to avoid breaking callers during transition.
  console.log(`[bookingCalendarService] smartUpdateBookingCalendar called for ${bookingId} — no-op (backend handles calendar sync)`);
};

/**
 * @deprecated Frontend must not create calendar events. Backend handles this.
 */
export const syncSingleBookingToCalendar = async (_bookingId: string, _booking?: any): Promise<void> => {
  console.warn(`[bookingCalendarService] syncSingleBookingToCalendar called — no-op (backend handles calendar sync)`);
};

/**
 * @deprecated Frontend must not remove calendar events for sync purposes.
 * Direct user actions (drag-drop, manual delete) still go through eventService.
 */
export const removeAllBookingEvents = async (_bookingId: string): Promise<void> => {
  console.warn(`[bookingCalendarService] removeAllBookingEvents called — no-op (backend handles calendar sync)`);
};

/**
 * @deprecated Frontend must not force-sync bookings to calendar.
 */
export const forceFullBookingSync = async (): Promise<number> => {
  console.warn(`[bookingCalendarService] forceFullBookingSync called — no-op (backend handles calendar sync)`);
  return 0;
};

/**
 * @deprecated Frontend must not self-heal calendar events.
 */
export const ensureBookingCalendarEvents = async (_bookingId: string, _booking?: any): Promise<boolean> => {
  console.warn(`[bookingCalendarService] ensureBookingCalendarEvents called — no-op (backend handles calendar sync)`);
  return false;
};

/**
 * Read-only: Get booking dates by type from calendar events.
 * This is a pure read operation — no mutations.
 */
export const fetchBookingDatesByType = async (
  bookingId: string, 
  eventType: 'rig' | 'event' | 'rigDown'
): Promise<string[]> => {
  try {
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('start_time')
      .eq('booking_id', bookingId)
      .eq('event_type', eventType);

    if (error) {
      console.error(`Error fetching ${eventType} dates for booking ${bookingId}:`, error);
      throw error;
    }

    // Extract unique dates
    const dates = events?.map(event => format(new Date(event.start_time), 'yyyy-MM-dd')) || [];
    return [...new Set(dates)]; // Remove duplicates
  } catch (error) {
    console.error(`Error in fetchBookingDatesByType:`, error);
    return [];
  }
};

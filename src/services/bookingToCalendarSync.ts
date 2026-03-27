/**
 * bookingToCalendarSync.ts
 * 
 * DEPRECATED: All booking → calendar sync is now handled by the backend
 * (import-bookings edge function). These stubs exist only to prevent
 * import errors from legacy callers.
 */

/**
 * @deprecated Backend handles all booking → calendar sync via import-bookings.
 */
export const syncConfirmedBookingsToCalendar = async (): Promise<number> => {
  console.warn('[bookingToCalendarSync] syncConfirmedBookingsToCalendar — no-op (backend handles calendar sync)');
  return 0;
};

/**
 * @deprecated Backend handles all booking → calendar sync via import-bookings.
 */
export const syncSingleBookingToCalendar = async (_bookingId: string): Promise<void> => {
  console.warn('[bookingToCalendarSync] syncSingleBookingToCalendar — no-op (backend handles calendar sync)');
};

/**
 * @deprecated Backend handles all booking → calendar sync via import-bookings.
 */
export const removeBookingEventsFromCalendar = async (_bookingId: string): Promise<void> => {
  console.warn('[bookingToCalendarSync] removeBookingEventsFromCalendar — no-op (backend handles calendar sync)');
};

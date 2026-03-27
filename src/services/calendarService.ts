/**
 * ============================================================
 * calendarService.ts — Unified Calendar Service Re-exports
 * ============================================================
 * 
 * ARCHITECTURE: Single-writer model.
 * - Booking→Calendar SYNC: import-bookings edge function ONLY.
 * - Planner UI ops: eventService.ts (drag-drop, time edit, manual add).
 * - Frontend is READ-ONLY for sync purposes.
 * ============================================================
 */

// Read operations + Planner UI write operations
export {
  fetchCalendarEvents,
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  fetchEventsByBookingId,
  createCalendarEvent
} from './eventService';

// Team/resource operations (read + planner UI team reassignment)
export {
  fetchTeamResources,
  getTeamById,
  saveResources,
  findAvailableTeam
} from './teamService';

// Booking→Calendar sync stubs — ALL are no-ops.
// The backend (import-bookings) is the single source of truth.
export {
  smartUpdateBookingCalendar,
  syncSingleBookingToCalendar,
  removeAllBookingEvents,
  forceFullBookingSync
} from './bookingCalendarService';

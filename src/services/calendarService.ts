
// Re-export all functions from the specialized service files
export {
  fetchCalendarEvents,
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  fetchEventsByBookingId
} from './eventService';

export {
  fetchTeamResources,
  getTeamById,
  saveResources,
  findAvailableTeam
} from './teamService';

// Calendar sync stubs — all sync is now backend-driven
export {
  smartUpdateBookingCalendar,
  syncSingleBookingToCalendar,
  removeAllBookingEvents,
  forceFullBookingSync
} from './bookingCalendarService';

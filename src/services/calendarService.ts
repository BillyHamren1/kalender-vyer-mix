
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

export {
  syncBookingEvents
} from './bookingCalendarService';

// Export the cleanup function
export { cleanupDuplicateEvents } from '../utils/calendarCleanup';

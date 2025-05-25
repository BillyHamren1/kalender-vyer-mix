
// Re-export all booking service functions for backward compatibility
export {
  fetchBookings,
  fetchBookingById,
  fetchUpcomingBookings,
  fetchConfirmedBookings
} from './booking/bookingFetchService';

export {
  markBookingAsViewed,
  updateBookingStatus,
  updateBookingDates,
  updateBookingLogistics,
  updateDeliveryDetails
} from './booking/bookingMutationService';

export {
  updateBookingStatusWithCalendarSync,
  type BookingStatus
} from './booking/bookingStatusService';

export {
  extractClientName
} from './booking/bookingUtils';

export {
  createBooking,
  duplicateBooking
} from './booking/bookingCreationService';

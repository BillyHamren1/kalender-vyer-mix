
// Re-export all booking service functions for backward compatibility
export {
  fetchBookings,
  fetchBookingById,
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
  createBooking,
  duplicateBooking
} from './booking/bookingCreationService';

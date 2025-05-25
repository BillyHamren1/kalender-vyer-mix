
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
  extractClientName
} from './booking/bookingUtils';

export {
  createBooking,
  duplicateBooking
} from './booking/bookingCreationService';

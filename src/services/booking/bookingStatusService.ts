
import { supabase } from "@/integrations/supabase/client";
import { resyncBookingToCalendar, deleteAllBookingEvents } from "@/services/bookingCalendarService";

export type BookingStatus = 'OFFER' | 'CONFIRMED' | 'CANCELLED';

export const updateBookingStatusWithCalendarSync = async (
  id: string, 
  newStatus: BookingStatus,
  previousStatus?: string
): Promise<void> => {
  console.log(`Updating booking ${id} status from ${previousStatus} to ${newStatus}`);

  // Update the booking status in the database
  const { error } = await supabase
    .from('bookings')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }

  // Handle calendar synchronization based on status change
  await handleCalendarSync(id, newStatus, previousStatus);
};

const handleCalendarSync = async (
  bookingId: string, 
  newStatus: BookingStatus,
  previousStatus?: string
): Promise<void> => {
  try {
    switch (newStatus.toUpperCase()) {
      case 'CONFIRMED':
        // When status becomes confirmed, sync to calendar
        console.log(`Syncing booking ${bookingId} to calendar (status: CONFIRMED)`);
        const syncResult = await resyncBookingToCalendar(bookingId);
        if (!syncResult) {
          console.warn(`Could not sync booking ${bookingId} to calendar - may be missing dates`);
        }
        break;

      case 'CANCELLED':
        // When status becomes cancelled, remove from calendar
        console.log(`Removing booking ${bookingId} from calendar (status: CANCELLED)`);
        await deleteAllBookingEvents(bookingId);
        break;

      case 'OFFER':
        // When status becomes offer, remove from calendar if previously confirmed
        if (previousStatus?.toUpperCase() === 'CONFIRMED') {
          console.log(`Removing booking ${bookingId} from calendar (status changed from CONFIRMED to ${newStatus})`);
          await deleteAllBookingEvents(bookingId);
        }
        break;

      default:
        console.warn(`Unknown status: ${newStatus}`);
    }
  } catch (error) {
    console.error(`Error handling calendar sync for booking ${bookingId}:`, error);
    // Don't throw here - status update succeeded, calendar sync is secondary
  }
};

export const getStatusColor = (status: BookingStatus): string => {
  switch (status.toUpperCase()) {
    case 'CONFIRMED':
      return 'bg-[#7BAEBF] hover:bg-[#7BAEBF]';
    case 'CANCELLED':
      return 'bg-red-500 hover:bg-red-500';
    case 'OFFER':
      return 'bg-yellow-500 hover:bg-yellow-500';
    default:
      return 'bg-orange-400 hover:bg-orange-400';
  }
};

export const getStatusIcon = (status: BookingStatus): string => {
  switch (status.toUpperCase()) {
    case 'CONFIRMED':
      return 'CheckCircle';
    case 'CANCELLED':
      return 'XCircle';
    case 'OFFER':
      return 'Clock';
    default:
      return 'AlertTriangle';
  }
};


import { supabase } from "@/integrations/supabase/client";
import { smartUpdateBookingCalendar } from "@/services/bookingCalendarService";

export type BookingStatus = 'OFFER' | 'CONFIRMED' | 'CANCELLED';

export const updateBookingStatusWithCalendarSync = async (
  id: string, 
  newStatus: BookingStatus,
  previousStatus?: string
): Promise<void> => {
  console.log(`Updating booking ${id} status from ${previousStatus} to ${newStatus}`);

  // Get the current booking data before update
  const { data: oldBooking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error('Error fetching booking for status update:', fetchError);
    throw fetchError;
  }

  // Update the booking status in the database
  const { error } = await supabase
    .from('bookings')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }

  // Use smart calendar update to handle sync only when necessary
  const newBookingData = { ...oldBooking, status: newStatus };
  await smartUpdateBookingCalendar(id, oldBooking, newBookingData);
};

export const getStatusColor = (status: BookingStatus): string => {
  switch (status.toUpperCase()) {
    case 'CONFIRMED':
      return 'bg-gray-50 text-gray-500 hover:bg-gray-50 border border-gray-200';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700 hover:bg-red-100 border-red-200';
    case 'OFFER':
      return 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200';
    default:
      return 'bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200';
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

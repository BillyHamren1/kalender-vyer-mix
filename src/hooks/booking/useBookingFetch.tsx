
import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Booking } from '@/types/booking';
import { fetchBookingById, markBookingAsViewed } from '@/services/bookingService';
import { fetchBookingDatesByType } from '@/services/bookingCalendarService';

export const useBookingFetch = (id: string | undefined) => {
  const queryClient = useQueryClient();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for multiple dates
  const [rigDates, setRigDates] = useState<string[]>([]);
  const [eventDates, setEventDates] = useState<string[]>([]);
  const [rigDownDates, setRigDownDates] = useState<string[]>([]);

  // Load all dates for a booking
  const loadAllBookingDates = async (bookingId: string) => {
    try {
      console.log(`Loading booking dates for booking ID: ${bookingId}`);
      
      const [fetchedRigDates, fetchedEventDates, fetchedRigDownDates] = await Promise.all([
        fetchBookingDatesByType(bookingId, 'rig'),
        fetchBookingDatesByType(bookingId, 'event'),
        fetchBookingDatesByType(bookingId, 'rigDown')
      ]);
      
      // Set state with all dates (now arrays)
      setRigDates(fetchedRigDates);
      setEventDates(fetchedEventDates);
      setRigDownDates(fetchedRigDownDates);
      
      // Log the dates for debugging
      console.log('Loaded rig dates:', fetchedRigDates);
      console.log('Loaded event dates:', fetchedEventDates);
      console.log('Loaded rig down dates:', fetchedRigDownDates);
    } catch (err) {
      console.error('Error loading booking dates:', err);
    }
  };

  const loadBookingData = async () => {
    if (!id) {
      console.error('No booking ID provided to useBookingFetch');
      setError('No booking ID provided');
      setIsLoading(false);
      return null;
    }
    
    try {
      console.log(`Loading booking data for ID: ${id}`);
      setIsLoading(true);
      setError(null);
      
      const bookingData = await fetchBookingById(id);
      console.log('Loaded booking data:', bookingData);
      setBooking(bookingData);
      
      // Mark booking as viewed when opened
      if (bookingData && !bookingData.viewed) {
        try {
          await markBookingAsViewed(id);
          console.log(`Marked booking ${id} as viewed`);
          // Immediately invalidate the unopened bookings query so dashboard updates
          queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'unopened-bookings'] });
        } catch (viewErr) {
          console.error('Failed to mark booking as viewed:', viewErr);
        }
      }
      
      // Fetch all dates for this booking from calendar events
      await loadAllBookingDates(id);
      
      return bookingData;
    } catch (err) {
      console.error('Error fetching booking:', err);
      const errorMessage = 'Failed to load booking details';
      setError(errorMessage);
      toast.error('Could not load booking details');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    booking,
    isLoading,
    error,
    rigDates,
    eventDates,
    rigDownDates,
    loadBookingData,
    setBooking,
    setRigDates,
    setEventDates,
    setRigDownDates
  };
};

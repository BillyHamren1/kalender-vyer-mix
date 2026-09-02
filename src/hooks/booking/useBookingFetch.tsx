
import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Booking } from '@/types/booking';
import { markBookingAsViewed } from '@/services/bookingService';
import { fetchLiveBookingById } from '@/services/booking/liveBookingService';


export const useBookingFetch = (id: string | undefined) => {
  const queryClient = useQueryClient();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for multiple dates — ALLTID från Booking (single source of truth).
  const [rigDates, setRigDates] = useState<string[]>([]);
  const [eventDates, setEventDates] = useState<string[]>([]);
  const [rigDownDates, setRigDownDates] = useState<string[]>([]);

  const loadBookingData = async () => {
    if (!id) {
      console.error('No booking ID provided to useBookingFetch');
      setError('No booking ID provided');
      setIsLoading(false);
      return null;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Detaljvyn läser ALLTID live från Booking (single source of truth).
      const bookingData = await fetchLiveBookingById(id);
      setBooking(bookingData);

      // Datumarrayerna kommer direkt från Booking-svaret — ingen lokal kalenderfallback.
      setRigDates(bookingData?.rigDates ?? []);
      setEventDates(bookingData?.eventDates ?? []);
      setRigDownDates(bookingData?.rigDownDates ?? []);

      // Mark booking as viewed when opened
      if (bookingData && !bookingData.viewed) {
        try {
          await markBookingAsViewed(id);
          queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'unopened-bookings'] });
        } catch (viewErr) {
          console.error('Failed to mark booking as viewed:', viewErr);
        }
      }

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

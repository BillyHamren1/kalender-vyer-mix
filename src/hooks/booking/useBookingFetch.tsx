
import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { fetchBookingById } from '@/services/bookingService';
import { fetchBookingDatesByType } from '@/services/bookingCalendarService';

export const useBookingFetch = (id: string | undefined) => {
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
      const [fetchedRigDates, fetchedEventDates, fetchedRigDownDates] = await Promise.all([
        fetchBookingDatesByType(bookingId, 'rig'),
        fetchBookingDatesByType(bookingId, 'event'),
        fetchBookingDatesByType(bookingId, 'rigDown')
      ]);
      
      // Set state with all dates
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
    if (!id) return;
    
    try {
      setIsLoading(true);
      const bookingData = await fetchBookingById(id);
      setBooking(bookingData);
      
      // Fetch all dates for this booking from calendar events
      await loadAllBookingDates(id);
      
      return bookingData;
    } catch (err) {
      console.error('Error fetching booking:', err);
      setError('Failed to load booking details');
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

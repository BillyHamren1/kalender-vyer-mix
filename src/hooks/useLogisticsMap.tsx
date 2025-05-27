
import { useState, useEffect } from 'react';
import { Booking } from '@/types/booking';
import { fetchBookingsWithCoordinates } from '@/services/bookingService';
import { toast } from 'sonner';

export const useLogisticsMap = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [filterDate, setFilterDate] = useState<Date | null>(null);

  const loadBookings = async () => {
    try {
      setIsLoading(true);
      const data = await fetchBookingsWithCoordinates();
      
      console.log(`Loaded ${data.length} bookings with coordinates:`, data);
      
      setBookings(data);
      setFilteredBookings(data);
      
      if (data.length === 0) {
        toast.info('No non-cancelled bookings with coordinates found');
      } else {
        toast.success(`Loaded ${data.length} bookings with location data`);
      }
      
      return data;
    } catch (error) {
      console.error('Error loading bookings:', error);
      toast.error('Failed to load bookings');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Apply filters
  useEffect(() => {
    if (!bookings.length) return;

    let filtered = [...bookings];

    // Apply date filter if selected
    if (filterDate) {
      const dateString = filterDate.toISOString().split('T')[0];
      filtered = filtered.filter(booking => 
        booking.rigDayDate === dateString || 
        booking.eventDate === dateString || 
        booking.rigDownDate === dateString
      );
    }

    console.log(`Filtered to ${filtered.length} bookings after date filter`);
    setFilteredBookings(filtered);
  }, [bookings, filterDate]);

  return {
    bookings,
    filteredBookings,
    isLoading,
    selectedBooking,
    filterDate,
    setFilterDate,
    setSelectedBooking,
    loadBookings
  };
};

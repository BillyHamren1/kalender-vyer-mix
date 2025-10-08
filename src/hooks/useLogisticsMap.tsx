
import { useState, useEffect } from 'react';
import { Booking } from '@/types/booking';
import { fetchConfirmedBookings } from '@/services/bookingService';
import { toast } from 'sonner';

export const useLogisticsMap = (bookingId?: string | null) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [filterDate, setFilterDate] = useState<Date | null>(null);

  const loadBookings = async () => {
    try {
      setIsLoading(true);
      const data = await fetchConfirmedBookings();
      
      // Filter bookings with valid coordinates
      const bookingsWithCoordinates = data.filter(
        booking => 
          booking.deliveryLatitude !== undefined && 
          booking.deliveryLatitude !== null && 
          booking.deliveryLongitude !== undefined && 
          booking.deliveryLongitude !== null
      );
      
      setBookings(bookingsWithCoordinates);
      
      if (bookingsWithCoordinates.length === 0) {
        toast.warning('No bookings with coordinates found');
      } else {
        toast.success(`Loaded ${bookingsWithCoordinates.length} bookings with location data`);
      }
      
      return bookingsWithCoordinates;
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

    // Apply booking ID filter first if provided
    if (bookingId) {
      filtered = filtered.filter(booking => booking.id === bookingId);
      if (filtered.length === 0) {
        console.warn(`No booking found with ID: ${bookingId}`);
        toast.warning('Booking not found or has no coordinates');
      }
    }

    // Apply date filter if selected (only if not filtering by specific booking)
    if (filterDate && !bookingId) {
      const dateString = filterDate.toISOString().split('T')[0];
      filtered = filtered.filter(booking => 
        booking.rigDayDate === dateString || 
        booking.eventDate === dateString || 
        booking.rigDownDate === dateString
      );
    }

    setFilteredBookings(filtered);
  }, [bookings, filterDate, bookingId]);

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

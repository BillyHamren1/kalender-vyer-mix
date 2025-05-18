
import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { 
  updateBookingDates, 
  updateBookingNotes, 
  updateBookingLogistics,
  updateDeliveryDetails,
  fetchBookingById
} from '@/services/bookingService';
import { syncBookingEvents } from '@/services/bookingCalendarService';

export const useBookingDetail = (id: string | undefined) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToCalendar, setIsSyncingToCalendar] = useState(false);

  const loadBookingData = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const bookingData = await fetchBookingById(id);
      setBooking(bookingData);
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

  const syncWithCalendar = async () => {
    if (!booking || !id) return;
    
    setIsSyncingToCalendar(true);
    
    try {
      // Create or update calendar events for each date
      const syncPromises = [];
      
      if (booking.rigDayDate) {
        syncPromises.push(syncBookingEvents(id, 'rig', booking.rigDayDate, 'auto', booking.client));
      }
      
      if (booking.eventDate) {
        syncPromises.push(syncBookingEvents(id, 'event', booking.eventDate, 'auto', booking.client));
      }
      
      if (booking.rigDownDate) {
        syncPromises.push(syncBookingEvents(id, 'rigDown', booking.rigDownDate, 'auto', booking.client));
      }
      
      await Promise.all(syncPromises);
      
      toast.success('Booking synced to calendar successfully');
    } catch (err) {
      console.error('Error syncing with calendar:', err);
      toast.error('Failed to sync booking with calendar');
    } finally {
      setIsSyncingToCalendar(false);
    }
  };

  const handleDateChange = async (date: Date | undefined, dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate', autoSync: boolean) => {
    if (!booking || !id || !date) return;
    
    try {
      setIsSaving(true);
      
      // Format the date as ISO string (without time)
      const formattedDate = date.toISOString().split('T')[0];
      
      // Update the booking date in the database
      await updateBookingDates(id, dateType, formattedDate);
      
      // Update local state to reflect changes
      setBooking({
        ...booking,
        [dateType]: formattedDate
      });
      
      toast.success(`${dateType === 'rigDayDate' ? 'Rig day' : dateType === 'eventDate' ? 'Event day' : 'Rig down day'} updated successfully`);
      
      // If autoSync is enabled, automatically sync to calendar
      if (autoSync) {
        await syncWithCalendar();
      }
    } catch (err) {
      console.error(`Error updating ${dateType}:`, err);
      toast.error(`Failed to update ${dateType === 'rigDayDate' ? 'rig day' : dateType === 'eventDate' ? 'event day' : 'rig down day'}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleLogisticsChange = async (logisticsData: {
    carryMoreThan10m: boolean;
    groundNailsAllowed: boolean;
    exactTimeNeeded: boolean;
    exactTimeInfo: string;
  }) => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
      await updateBookingLogistics(id, logisticsData);
      
      // Update local state
      setBooking({
        ...booking,
        ...logisticsData
      });
      
      toast.success('Logistics information updated successfully');
    } catch (err) {
      console.error('Error updating logistics information:', err);
      toast.error('Failed to update logistics information');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeliveryDetailsChange = async (deliveryData: {
    deliveryAddress: string;
    deliveryCity: string;
    deliveryPostalCode: string;
  }) => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
      await updateDeliveryDetails(id, deliveryData);
      
      // Update local state
      setBooking({
        ...booking,
        ...deliveryData
      });
      
      toast.success('Delivery details updated successfully');
    } catch (err) {
      console.error('Error updating delivery details:', err);
      toast.error('Failed to update delivery details');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    booking,
    isLoading,
    error,
    isSaving,
    isSyncingToCalendar,
    loadBookingData,
    handleDateChange,
    handleLogisticsChange,
    handleDeliveryDetailsChange,
    syncWithCalendar,
    setBooking
  };
};


import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { 
  updateBookingDates, 
  updateBookingNotes, 
  updateBookingLogistics,
  updateDeliveryDetails,
  fetchBookingById
} from '@/services/bookingService';
import { 
  syncBookingEvents, 
  fetchBookingDatesByType,
  deleteBookingEvent 
} from '@/services/bookingCalendarService';

export const useBookingDetail = (id: string | undefined) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToCalendar, setIsSyncingToCalendar] = useState(false);
  
  // State for multiple dates
  const [rigDates, setRigDates] = useState<string[]>([]);
  const [eventDates, setEventDates] = useState<string[]>([]);
  const [rigDownDates, setRigDownDates] = useState<string[]>([]);

  // Helper function to format date as YYYY-MM-DD without timezone conversion
  const formatDateToLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  const syncWithCalendar = async () => {
    if (!booking || !id) return;
    
    setIsSyncingToCalendar(true);
    
    try {
      // Sync all dates
      const syncPromises = [];
      
      // Sync rig dates
      if (rigDates.length > 0) {
        syncPromises.push(syncBookingEvents(id, 'rig', rigDates, 'auto', booking.client));
      } else if (booking.rigDayDate) {
        // For backwards compatibility
        syncPromises.push(syncBookingEvents(id, 'rig', booking.rigDayDate, 'auto', booking.client));
      }
      
      // Sync event dates
      if (eventDates.length > 0) {
        syncPromises.push(syncBookingEvents(id, 'event', eventDates, 'auto', booking.client));
      } else if (booking.eventDate) {
        // For backwards compatibility
        syncPromises.push(syncBookingEvents(id, 'event', booking.eventDate, 'auto', booking.client));
      }
      
      // Sync rig down dates
      if (rigDownDates.length > 0) {
        syncPromises.push(syncBookingEvents(id, 'rigDown', rigDownDates, 'auto', booking.client));
      } else if (booking.rigDownDate) {
        // For backwards compatibility
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

  // Add a date to a specific type (rig, event, rigDown)
  const addDate = async (
    date: Date, 
    dateType: 'rig' | 'event' | 'rigDown', 
    autoSync: boolean
  ) => {
    if (!booking || !id || !date) return;
    
    try {
      setIsSaving(true);
      
      // Format the date as YYYY-MM-DD without timezone conversion
      const formattedDate = formatDateToLocalString(date);
      
      // Get the current state for this type of date
      let currentDates: string[];
      switch (dateType) {
        case 'rig':
          currentDates = [...rigDates];
          if (!currentDates.includes(formattedDate)) {
            currentDates.push(formattedDate);
            setRigDates(currentDates);
          }
          break;
        case 'event':
          currentDates = [...eventDates];
          if (!currentDates.includes(formattedDate)) {
            currentDates.push(formattedDate);
            setEventDates(currentDates);
          }
          break;
        case 'rigDown':
          currentDates = [...rigDownDates];
          if (!currentDates.includes(formattedDate)) {
            currentDates.push(formattedDate);
            setRigDownDates(currentDates);
          }
          break;
      }
      
      // Also update the single date field for backward compatibility
      // if this is the first date of its type
      const legacyFieldName = dateType === 'rig' ? 'rigDayDate' : 
                            dateType === 'event' ? 'eventDate' : 'rigDownDate';
      
      // If this is the first date or there's no existing date, update the legacy field
      if ((!booking[legacyFieldName] && currentDates.length === 1) || currentDates.length === 0) {
        await updateBookingDates(id, legacyFieldName, formattedDate);
        
        // Update local booking state
        setBooking({
          ...booking,
          [legacyFieldName]: formattedDate
        });
      }
      
      // Create calendar event for this new date
      await syncBookingEvents(id, dateType, formattedDate, 'auto', booking.client);
      
      toast.success(`${dateType === 'rig' ? 'Rig day' : dateType === 'event' ? 'Event day' : 'Rig down day'} added successfully`);
      
      // If autoSync is enabled, automatically sync all dates to calendar
      if (autoSync) {
        await syncWithCalendar();
      }
    } catch (err) {
      console.error(`Error adding ${dateType} date:`, err);
      toast.error(`Failed to add ${dateType === 'rig' ? 'rig day' : dateType === 'event' ? 'event day' : 'rig down day'}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Remove a date of a specific type
  const removeDate = async (
    date: string, 
    dateType: 'rig' | 'event' | 'rigDown', 
    autoSync: boolean
  ) => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
      // Remove from the state
      let updatedDates: string[];
      switch (dateType) {
        case 'rig':
          updatedDates = rigDates.filter(d => d !== date);
          setRigDates(updatedDates);
          break;
        case 'event':
          updatedDates = eventDates.filter(d => d !== date);
          setEventDates(updatedDates);
          break;
        case 'rigDown':
          updatedDates = rigDownDates.filter(d => d !== date);
          setRigDownDates(updatedDates);
          break;
      }
      
      // If this was the legacy date in the main booking table, update it
      const legacyFieldName = dateType === 'rig' ? 'rigDayDate' : 
                            dateType === 'event' ? 'eventDate' : 'rigDownDate';
      
      if (booking[legacyFieldName] === date) {
        // If there are still dates left, use the first one
        // Otherwise set to null
        const newLegacyDate = updatedDates.length > 0 ? updatedDates[0] : null;
        
        await updateBookingDates(id, legacyFieldName, newLegacyDate);
        
        // Update local booking state
        setBooking({
          ...booking,
          [legacyFieldName]: newLegacyDate
        });
      }
      
      // Delete the calendar event for this date
      await deleteBookingEvent(id, dateType, date);
      
      toast.success(`${dateType === 'rig' ? 'Rig day' : dateType === 'event' ? 'Event day' : 'Rig down day'} removed successfully`);
      
      // If autoSync is enabled, automatically sync all dates to calendar
      if (autoSync) {
        await syncWithCalendar();
      }
    } catch (err) {
      console.error(`Error removing ${dateType} date:`, err);
      toast.error(`Failed to remove ${dateType === 'rig' ? 'rig day' : dateType === 'event' ? 'event day' : 'rig down day'}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  // For backward compatibility with the existing code
  const handleDateChange = async (date: Date | undefined, dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate', autoSync: boolean) => {
    if (!booking || !id || !date) return;
    
    try {
      setIsSaving(true);
      
      // Format the date without timezone conversion
      const formattedDate = formatDateToLocalString(date);
      
      // Update the booking date in the database
      await updateBookingDates(id, dateType, formattedDate);
      
      // Update local state to reflect changes
      setBooking({
        ...booking,
        [dateType]: formattedDate
      });
      
      // Also update the corresponding dates array
      if (dateType === 'rigDayDate') {
        // If not already in the array, add it
        if (!rigDates.includes(formattedDate)) {
          setRigDates([...rigDates, formattedDate]);
        }
      } else if (dateType === 'eventDate') {
        if (!eventDates.includes(formattedDate)) {
          setEventDates([...eventDates, formattedDate]);
        }
      } else if (dateType === 'rigDownDate') {
        if (!rigDownDates.includes(formattedDate)) {
          setRigDownDates([...rigDownDates, formattedDate]);
        }
      }
      
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
    rigDates,
    eventDates,
    rigDownDates,
    loadBookingData,
    handleDateChange,
    handleLogisticsChange,
    handleDeliveryDetailsChange,
    syncWithCalendar,
    setBooking,
    // New methods for multiple dates
    addDate,
    removeDate
  };
};

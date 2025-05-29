
import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateBookingDates } from '@/services/bookingService';
import { 
  resyncBookingToCalendar, 
  deleteAllBookingEvents 
} from '@/services/bookingCalendarService';

export const useBookingDates = (
  id: string | undefined,
  booking: Booking | null,
  rigDates: string[],
  eventDates: string[],
  rigDownDates: string[],
  setBooking: (booking: Booking) => void,
  setRigDates: (dates: string[]) => void,
  setEventDates: (dates: string[]) => void,
  setRigDownDates: (dates: string[]) => void
) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToCalendar, setIsSyncingToCalendar] = useState(false);

  // Helper function to format date as YYYY-MM-DD without timezone conversion
  const formatDateToLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const syncWithCalendar = async () => {
    if (!booking || !id) return;
    
    setIsSyncingToCalendar(true);
    
    try {
      // Use the resync function without the force parameter
      await resyncBookingToCalendar(id);
      
      // Removed success toast - only show errors
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
      
      // Removed success toast - only show errors
      
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
      
      // Delete all calendar events for this booking and recreate them without this date
      await deleteAllBookingEvents(id);
      
      // Resync the remaining dates to calendar
      if (booking.status === 'CONFIRMED') {
        await resyncBookingToCalendar(id);
      }
      
      // Removed success toast - only show errors
      
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
      
      // Removed success toast - only show errors
      
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

  return {
    isSaving,
    isSyncingToCalendar,
    handleDateChange,
    syncWithCalendar,
    addDate,
    removeDate
  };
};

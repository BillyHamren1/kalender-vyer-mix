import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateBookingDates, updateBookingDateWithTimes } from '@/services/bookingService';

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

  // Helper function to format date as YYYY-MM-DD without timezone conversion
  const formatDateToLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Add a date to a specific type (rig, event, rigDown)
  const addDate = async (
    date: Date, 
    dateType: 'rig' | 'event' | 'rigDown', 
    _autoSync: boolean
  ) => {
    if (!booking || !id || !date) return;
    
    try {
      setIsSaving(true);
      
      const formattedDate = formatDateToLocalString(date);
      
      console.log(`Adding ${dateType} date:`, formattedDate, 'for booking:', id);
      
      const existingDates = dateType === 'rig' ? rigDates : 
                           dateType === 'event' ? eventDates : rigDownDates;
      
      if (existingDates.includes(formattedDate)) {
        console.log('Date already exists, skipping');
        return;
      }
      
      const legacyFieldName = dateType === 'rig' ? 'rigDayDate' : 
                            dateType === 'event' ? 'eventDate' : 'rigDownDate';
      
      await updateBookingDates(id, legacyFieldName, formattedDate);
      console.log(`Updated ${legacyFieldName} in database to:`, formattedDate);
      
      setBooking({ ...booking, [legacyFieldName]: formattedDate });
      
      switch (dateType) {
        case 'rig':
          setRigDates([...rigDates, formattedDate]);
          break;
        case 'event':
          setEventDates([...eventDates, formattedDate]);
          break;
        case 'rigDown':
          setRigDownDates([...rigDownDates, formattedDate]);
          break;
      }
      
      // Calendar sync is handled by the backend when booking dates change
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
    _autoSync: boolean
  ) => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
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
      
      const legacyFieldName = dateType === 'rig' ? 'rigDayDate' : 
                            dateType === 'event' ? 'eventDate' : 'rigDownDate';
      
      if (booking[legacyFieldName] === date) {
        const newLegacyDate = updatedDates.length > 0 ? updatedDates[0] : null;
        await updateBookingDates(id, legacyFieldName, newLegacyDate);
        setBooking({ ...booking, [legacyFieldName]: newLegacyDate });
      }
      
      // Calendar events are managed by the backend — no frontend deletion/recreation
    } catch (err) {
      console.error(`Error removing ${dateType} date:`, err);
      toast.error(`Failed to remove ${dateType === 'rig' ? 'rig day' : dateType === 'event' ? 'event day' : 'rig down day'}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  // For backward compatibility with the existing code
  const handleDateChange = async (date: Date | undefined, dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate', _autoSync: boolean) => {
    if (!booking || !id || !date) return;
    
    try {
      setIsSaving(true);
      
      const formattedDate = formatDateToLocalString(date);
      await updateBookingDates(id, dateType, formattedDate);
      
      setBooking({ ...booking, [dateType]: formattedDate });
      
      if (dateType === 'rigDayDate') {
        if (!rigDates.includes(formattedDate)) setRigDates([...rigDates, formattedDate]);
      } else if (dateType === 'eventDate') {
        if (!eventDates.includes(formattedDate)) setEventDates([...eventDates, formattedDate]);
      } else if (dateType === 'rigDownDate') {
        if (!rigDownDates.includes(formattedDate)) setRigDownDates([...rigDownDates, formattedDate]);
      }
      
      // Calendar sync is handled by the backend
    } catch (err) {
      console.error(`Error updating ${dateType}:`, err);
      toast.error(`Failed to update ${dateType === 'rigDayDate' ? 'rig day' : dateType === 'eventDate' ? 'event day' : 'rig down day'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    isSyncingToCalendar: false,
    handleDateChange,
    syncWithCalendar: async () => { /* no-op: backend handles calendar sync */ },
    addDate,
    removeDate
  };
};

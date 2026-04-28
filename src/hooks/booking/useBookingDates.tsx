import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateBookingDatesViaApi } from '@/services/planningApiService';

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

  // Map date type to Booking API field names
  const getApiFieldName = (dateType: 'rig' | 'event' | 'rigDown') => {
    const map = { rig: 'rigdaydate', event: 'eventdate', rigDown: 'rigdowndate' };
    return map[dateType];
  };

  const getLegacyFieldName = (dateType: 'rig' | 'event' | 'rigDown') => {
    const map = { rig: 'rigDayDate', event: 'eventDate', rigDown: 'rigDownDate' } as const;
    return map[dateType];
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
      
      // Write to Booking API (source of truth)
      await updateBookingDatesViaApi(id, { [getApiFieldName(dateType)]: formattedDate });
      console.log(`Updated ${dateType} date in Booking API to:`, formattedDate);
      
      // Update local state to reflect the change
      const legacyField = getLegacyFieldName(dateType);
      setBooking({ ...booking, [legacyField]: formattedDate });
      
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
      toast.error(`Kunde inte lägga till ${dateType === 'rig' ? 'riggdag' : dateType === 'event' ? 'eventdag' : 'nedrivningsdag'}`);
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
      
      const legacyField = getLegacyFieldName(dateType);
      
      if (booking[legacyField] === date) {
        const newLegacyDate = updatedDates.length > 0 ? updatedDates[0] : null;
        // Write to Booking API (source of truth)
        await updateBookingDatesViaApi(id, { [getApiFieldName(dateType)]: newLegacyDate });
        setBooking({ ...booking, [legacyField]: newLegacyDate });
      }
      
      // Calendar events are managed by the backend
    } catch (err) {
      console.error(`Error removing ${dateType} date:`, err);
      toast.error(`Kunde inte ta bort ${dateType === 'rig' ? 'riggdag' : dateType === 'event' ? 'eventdag' : 'nedrivningsdag'}`);
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
      const apiFieldMap = { rigDayDate: 'rigdaydate', eventDate: 'eventdate', rigDownDate: 'rigdowndate' } as const;
      
      // Write to Booking API (source of truth)
      await updateBookingDatesViaApi(id, { [apiFieldMap[dateType]]: formattedDate });
      
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
      toast.error(`Kunde inte uppdatera ${dateType === 'rigDayDate' ? 'riggdag' : dateType === 'eventDate' ? 'eventdag' : 'nedrivningsdag'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Edit a date (change date and/or times)
  const editDate = async (
    oldDate: string,
    newDate: string,
    startTime: string,
    endTime: string,
    dateType: 'rig' | 'event' | 'rigDown'
  ) => {
    if (!booking || !id) return;

    try {
      setIsSaving(true);

      // Update the date in the local array
      const existingDates = dateType === 'rig' ? rigDates :
                           dateType === 'event' ? eventDates : rigDownDates;
      const updatedDates = existingDates.map(d => d === oldDate ? newDate : d);

      switch (dateType) {
        case 'rig':
          setRigDates(updatedDates);
          break;
        case 'event':
          setEventDates(updatedDates);
          break;
        case 'rigDown':
          setRigDownDates(updatedDates);
          break;
      }

      // Build the update payload for the Booking API
      const timeFieldMap = {
        rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
        event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
        rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
      };
      const fields = timeFieldMap[dateType];

      const updateData: Record<string, string | null> = {
        [fields.date]: newDate,
      };
      if (startTime) {
        updateData[fields.start] = `${newDate}T${startTime}:00Z`;
      }
      if (endTime) {
        updateData[fields.end] = `${newDate}T${endTime}:00Z`;
      }

      // Write to Booking API (source of truth)
      await updateBookingDatesViaApi(id, updateData);

      // Mirror locally and propagate to sibling bookings in the same large
      // project so all rows agree on time immediately (single source rule).
      try {
        const startISO = startTime ? `${newDate}T${startTime}:00Z` : null;
        const endISO   = endTime   ? `${newDate}T${endTime}:00Z`   : null;
        const { syncPhaseTime } = await import('@/services/timeSync');
        const sync = await syncPhaseTime({
          bookingId: id,
          phase: dateType,
          date: newDate,
          startISO,
          endISO,
        });
        if (sync.syncedSiblings > 0) {
          toast.success(`Tid synkad till ${sync.syncedSiblings} bokning${sync.syncedSiblings === 1 ? '' : 'ar'} i projektet`);
        }
      } catch (e) {
        console.warn('[useBookingDates.editDate] timeSync failed (non-fatal)', e);
      }

      // Update local booking state
      const localFieldMap = {
        rig: { date: 'rigDayDate', start: 'rigStartTime', end: 'rigEndTime' },
        event: { date: 'eventDate', start: 'eventStartTime', end: 'eventEndTime' },
        rigDown: { date: 'rigDownDate', start: 'rigDownStartTime', end: 'rigDownEndTime' },
      };
      const localFields = localFieldMap[dateType];
      setBooking({
        ...booking,
        [localFields.date]: newDate,
        [localFields.start]: startTime ? `${newDate}T${startTime}:00Z` : null,
        [localFields.end]: endTime ? `${newDate}T${endTime}:00Z` : null,
      });

      console.log(`Edited ${dateType} date: ${oldDate} → ${newDate}, time: ${startTime}–${endTime}`);
    } catch (err) {
      console.error(`Error editing ${dateType} date:`, err);
      toast.error('Kunde inte uppdatera datumet');
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
    removeDate,
    editDate
  };
};

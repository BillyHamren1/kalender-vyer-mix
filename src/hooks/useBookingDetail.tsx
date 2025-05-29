
import { useState } from 'react';
import { Booking } from '@/types/booking';
import { useBookingFetch } from './booking/useBookingFetch';
import { useBookingDates } from './booking/useBookingDates';
import { useBookingLogistics } from './booking/useBookingLogistics';
import { useBookingDelivery } from './booking/useBookingDelivery';
import { useBookingInternalNotes } from './booking/useBookingInternalNotes';

export const useBookingDetail = (id: string | undefined) => {
  // Use our base hook for fetching booking data
  const {
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
  } = useBookingFetch(id);
  
  // Use our dates hook
  const {
    isSaving: isSavingDates,
    isSyncingToCalendar,
    handleDateChange,
    syncWithCalendar,
    addDate,
    removeDate
  } = useBookingDates(
    id,
    booking,
    rigDates,
    eventDates,
    rigDownDates,
    setBooking,
    setRigDates,
    setEventDates,
    setRigDownDates
  );
  
  // Use our logistics hook
  const {
    isSaving: isSavingLogistics,
    handleLogisticsChange
  } = useBookingLogistics(id, booking, setBooking);
  
  // Use our delivery hook
  const {
    isSaving: isSavingDelivery,
    handleDeliveryDetailsChange
  } = useBookingDelivery(id, booking, setBooking);
  
  // Use our internal notes hook
  const {
    isSaving: isSavingInternalNotes,
    handleInternalNotesChange
  } = useBookingInternalNotes(id, booking, setBooking);
  
  // Combine isSaving states from different hooks
  const isSaving = isSavingDates || isSavingLogistics || isSavingDelivery || isSavingInternalNotes;

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
    handleInternalNotesChange,
    syncWithCalendar,
    setBooking,
    addDate,
    removeDate,
    isSavingInternalNotes
  };
};

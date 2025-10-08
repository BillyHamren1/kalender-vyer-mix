
import { useState } from 'react';
import { Booking } from '@/types/booking';
import { updateInternalNotes } from '@/services/booking/bookingMutationService';

export const useBookingInternalNotes = (
  id: string | undefined,
  booking: Booking | null,
  setBooking: (booking: Booking) => void
) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleInternalNotesChange = async (notes: string): Promise<void> => {
    if (!id || !booking) return;

    setIsSaving(true);
    try {
      await updateInternalNotes(id, notes);
      
      // Update local booking state
      setBooking({
        ...booking,
        internalNotes: notes
      });
      
      console.log('Internal notes updated successfully');
    } catch (error) {
      console.error('Error updating internal notes:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    handleInternalNotesChange
  };
};


import { useState } from 'react';
import { Booking } from '@/types/booking';
import { updateInternalNotesViaApi } from '@/services/planningApiService';
import { toast } from 'sonner';

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
      // Write to Booking API (source of truth)
      await updateInternalNotesViaApi(id, notes);
      
      // Update local booking state
      setBooking({
        ...booking,
        internalNotes: notes
      });
      
      console.log('Internal notes updated via Booking API');
    } catch (error) {
      console.error('Error updating internal notes via Booking API:', error);
      toast.error('Kunde inte spara interna anteckningar. Försök igen.');
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

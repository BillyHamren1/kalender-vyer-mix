
import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateBookingLogistics } from '@/services/bookingService';

export const useBookingLogistics = (
  id: string | undefined,
  booking: Booking | null,
  setBooking: (booking: Booking) => void
) => {
  const [isSaving, setIsSaving] = useState(false);

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
      
      // Removed success toast - only show errors
    } catch (err) {
      console.error('Error updating logistics information:', err);
      toast.error('Failed to update logistics information');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    handleLogisticsChange
  };
};

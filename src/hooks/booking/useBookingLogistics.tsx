
import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateLogisticsViaApi } from '@/services/planningApiService';

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
      
      // Write to Booking API (source of truth) — map to Booking field names
      await updateLogisticsViaApi(id, {
        carry_more_than_10m: logisticsData.carryMoreThan10m,
        ground_nails_allowed: logisticsData.groundNailsAllowed,
        exact_time_needed: logisticsData.exactTimeNeeded,
        exact_time_info: logisticsData.exactTimeInfo,
      });
      
      // Update local state
      setBooking({
        ...booking,
        ...logisticsData
      });
    } catch (err) {
      console.error('Error updating logistics via Booking API:', err);
      toast.error('Kunde inte uppdatera logistikinformation. Försök igen.');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    handleLogisticsChange
  };
};

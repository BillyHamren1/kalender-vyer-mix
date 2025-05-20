
import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateDeliveryDetails } from '@/services/bookingService';

export const useBookingDelivery = (
  id: string | undefined,
  booking: Booking | null,
  setBooking: (booking: Booking) => void
) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleDeliveryDetailsChange = async (deliveryData: {
    deliveryAddress: string;
    deliveryCity: string;
    deliveryPostalCode: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
  }) => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
      console.log('Updating delivery details with data:', deliveryData);
      
      await updateDeliveryDetails(id, deliveryData);
      
      // Update local state
      setBooking({
        ...booking,
        deliveryAddress: deliveryData.deliveryAddress,
        deliveryCity: deliveryData.deliveryCity,
        deliveryPostalCode: deliveryData.deliveryPostalCode,
        deliveryLatitude: deliveryData.deliveryLatitude,
        deliveryLongitude: deliveryData.deliveryLongitude
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
    isSaving,
    handleDeliveryDetailsChange
  };
};

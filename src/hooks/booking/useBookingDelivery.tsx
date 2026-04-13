
import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateDeliveryViaApi } from '@/services/planningApiService';

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
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  }) => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
      console.log('Updating delivery details via Booking API:', deliveryData);
      
      // Write to Booking API (source of truth) — map to Booking field names
      await updateDeliveryViaApi(id, {
        deliveryaddress: deliveryData.deliveryAddress,
        delivery_city: deliveryData.deliveryCity,
        delivery_postal_code: deliveryData.deliveryPostalCode,
        delivery_latitude: deliveryData.deliveryLatitude,
        delivery_longitude: deliveryData.deliveryLongitude,
        contact_name: deliveryData.contactName,
        contact_phone: deliveryData.contactPhone,
        contact_email: deliveryData.contactEmail,
      });
      
      // Update local state to reflect the change
      setBooking({
        ...booking,
        deliveryAddress: deliveryData.deliveryAddress,
        deliveryCity: deliveryData.deliveryCity,
        deliveryPostalCode: deliveryData.deliveryPostalCode,
        deliveryLatitude: deliveryData.deliveryLatitude,
        deliveryLongitude: deliveryData.deliveryLongitude,
        contactName: deliveryData.contactName,
        contactPhone: deliveryData.contactPhone,
        contactEmail: deliveryData.contactEmail
      });
    } catch (err) {
      console.error('Error updating delivery details via Booking API:', err);
      toast.error('Kunde inte uppdatera leveransinformation. Försök igen.');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    handleDeliveryDetailsChange
  };
};

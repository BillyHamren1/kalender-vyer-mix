
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Truck } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { ContactDetailsSection } from './delivery/ContactDetailsSection';
import { AddressFormSection } from './delivery/AddressFormSection';

interface DeliveryInformationCardProps {
  // Contact props
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  // Address props
  initialAddress: string;
  initialCity: string;
  initialPostalCode: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  // Booking ID for map integration
  bookingId?: string;
  isSaving: boolean;
  onSave: (deliveryData: {
    deliveryAddress: string;
    deliveryCity: string;
    deliveryPostalCode: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
  }) => Promise<void>;
}

export const DeliveryInformationCard = ({
  contactName,
  contactPhone,
  contactEmail,
  initialAddress,
  initialCity,
  initialPostalCode,
  deliveryLatitude,
  deliveryLongitude,
  bookingId,
  isSaving,
  onSave
}: DeliveryInformationCardProps) => {
  const [deliveryAddress, setDeliveryAddress] = useState(initialAddress);
  const [deliveryCity, setDeliveryCity] = useState(initialCity);
  const [deliveryPostalCode, setDeliveryPostalCode] = useState(initialPostalCode);
  const [latitude, setLatitude] = useState<number | undefined>(deliveryLatitude);
  const [longitude, setLongitude] = useState<number | undefined>(deliveryLongitude);
  const [isMapOpen, setIsMapOpen] = useState(false);
  
  // Contact information state
  const [contactNameValue, setContactNameValue] = useState(contactName || '');
  const [contactPhoneValue, setContactPhoneValue] = useState(contactPhone || '');
  const [contactEmailValue, setContactEmailValue] = useState(contactEmail || '');

  // Debounced save for contact fields
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSave = useCallback((data: Parameters<typeof onSave>[0]) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSave(data);
    }, 500);
  }, [onSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleDeliveryDetailsChange = (field: string, value: any) => {
    switch (field) {
      case 'address':
        setDeliveryAddress(value);
        break;
      case 'city':
        setDeliveryCity(value);
        break;
      case 'postalCode':
        setDeliveryPostalCode(value);
        break;
      case 'latitude':
        setLatitude(value);
        break;
      case 'longitude':
        setLongitude(value);
        break;
    }

    // Auto-save on change (address fields save immediately)
    const updatedData = {
      deliveryAddress: field === 'address' ? value : deliveryAddress,
      deliveryCity: field === 'city' ? value : deliveryCity,
      deliveryPostalCode: field === 'postalCode' ? value : deliveryPostalCode,
      deliveryLatitude: field === 'latitude' ? value : latitude,
      deliveryLongitude: field === 'longitude' ? value : longitude,
      contactName: contactNameValue,
      contactPhone: contactPhoneValue,
      contactEmail: contactEmailValue
    };
    
    onSave(updatedData);
  };

  // Create deliveryDetails object for AddressFormSection
  const deliveryDetails = {
    address: deliveryAddress,
    city: deliveryCity,
    postalCode: deliveryPostalCode,
    latitude,
    longitude
  };

  // Create booking object for AddressFormSection
  const booking = {
    bookingNumber: `Booking ${bookingId?.slice(-8) || 'Unknown'}`
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between gap-1.5 text-base">
          <div className="flex items-center gap-1.5">
            <Truck className="h-4 w-4" />
            <span>Leveransinformation</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 space-y-4">
        {/* Contact Information Section */}
        <ContactDetailsSection
          contactName={contactNameValue}
          contactPhone={contactPhoneValue}
          contactEmail={contactEmailValue}
          onContactNameChange={(value) => {
            setContactNameValue(value);
            debouncedSave({
              deliveryAddress,
              deliveryCity,
              deliveryPostalCode,
              deliveryLatitude: latitude,
              deliveryLongitude: longitude,
              contactName: value,
              contactPhone: contactPhoneValue,
              contactEmail: contactEmailValue
            });
          }}
          onContactPhoneChange={(value) => {
            setContactPhoneValue(value);
            debouncedSave({
              deliveryAddress,
              deliveryCity,
              deliveryPostalCode,
              deliveryLatitude: latitude,
              deliveryLongitude: longitude,
              contactName: contactNameValue,
              contactPhone: value,
              contactEmail: contactEmailValue
            });
          }}
          onContactEmailChange={(value) => {
            setContactEmailValue(value);
            debouncedSave({
              deliveryAddress,
              deliveryCity,
              deliveryPostalCode,
              deliveryLatitude: latitude,
              deliveryLongitude: longitude,
              contactName: contactNameValue,
              contactPhone: contactPhoneValue,
              contactEmail: value
            });
          }}
        />

        {/* Delivery Address Section */}
        <AddressFormSection
          deliveryDetails={deliveryDetails}
          onDeliveryDetailsChange={handleDeliveryDetailsChange}
          booking={booking}
          bookingId={bookingId || ''}
          isMapOpen={isMapOpen}
          onMapOpenChange={setIsMapOpen}
        />
      </CardContent>
    </Card>
  );
};


import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    onSave({
      deliveryAddress,
      deliveryCity,
      deliveryPostalCode,
      deliveryLatitude: latitude,
      deliveryLongitude: longitude,
      contactName: contactNameValue,
      contactPhone: contactPhoneValue,
      contactEmail: contactEmailValue
    });
  };

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
            <span>Delivery Information</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 space-y-4">
        {/* Contact Information Section */}
        <ContactDetailsSection
          contactName={contactNameValue}
          contactPhone={contactPhoneValue}
          contactEmail={contactEmailValue}
          onContactNameChange={setContactNameValue}
          onContactPhoneChange={setContactPhoneValue}
          onContactEmailChange={setContactEmailValue}
        />

        {/* Delivery Address Section */}
        <div className="space-y-2">
          <AddressFormSection
            deliveryDetails={deliveryDetails}
            onDeliveryDetailsChange={handleDeliveryDetailsChange}
            booking={booking}
            bookingId={bookingId || ''}
            isMapOpen={isMapOpen}
            onMapOpenChange={setIsMapOpen}
          />
          
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="mt-2 h-8 text-sm w-full"
            size="sm"
          >
            {isSaving ? 'Saving...' : 'Save Delivery Information'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

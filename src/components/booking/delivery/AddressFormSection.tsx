import React from 'react';
import { MapPin } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MapViewButton } from './MapViewButton';
import { CoordinateControls } from './CoordinateControls';

interface AddressFormSectionProps {
  deliveryDetails: any;
  onDeliveryDetailsChange: (field: string, value: any) => void;
  booking?: any;
  bookingId: string;
  isMapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
}

export const AddressFormSection: React.FC<AddressFormSectionProps> = ({
  deliveryDetails,
  onDeliveryDetailsChange,
  booking,
  bookingId,
  isMapOpen,
  onMapOpenChange
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Delivery Address</span>
      </div>
      
      <div className="space-y-2">
        <div>
          <Label htmlFor="delivery-address" className="text-xs">Address</Label>
          <Textarea 
            id="delivery-address"
            value={deliveryDetails?.address}
            onChange={(e) => onDeliveryDetailsChange('address', e.target.value)}
            placeholder="Street address"
            className="mt-1 min-h-[60px] text-sm"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <Label htmlFor="delivery-city" className="text-xs">City</Label>
            <Input 
              id="delivery-city"
              value={deliveryDetails?.city}
              onChange={(e) => onDeliveryDetailsChange('city', e.target.value)}
              placeholder="City"
              className="mt-1 h-8 text-sm"
            />
          </div>
          
          <div>
            <Label htmlFor="delivery-postal-code" className="text-xs">Postal Code</Label>
            <Input 
              id="delivery-postal-code"
              value={deliveryDetails?.postalCode}
              onChange={(e) => onDeliveryDetailsChange('postalCode', e.target.value)}
              placeholder="Postal code"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
      </div>
      
      {/* Map View Button */}
      <div className="flex justify-between items-center">
        <CoordinateControls
          latitude={deliveryDetails?.latitude}
          longitude={deliveryDetails?.longitude}
          onCoordinateChange={(lat, lng) => {
            onDeliveryDetailsChange('latitude', lat);
            onDeliveryDetailsChange('longitude', lng);
          }}
        />
        
        <MapViewButton
          latitude={deliveryDetails?.latitude}
          longitude={deliveryDetails?.longitude}
          bookingId={bookingId}
          bookingNumber={booking?.bookingNumber}
          isMapOpen={isMapOpen}
          onMapOpenChange={onMapOpenChange}
        />
      </div>
    </div>
  );
};

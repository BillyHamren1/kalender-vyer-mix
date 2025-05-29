
import React from 'react';
import { MapPin } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface AddressFormSectionProps {
  deliveryAddress: string;
  deliveryCity: string;
  deliveryPostalCode: string;
  onAddressChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onPostalCodeChange: (value: string) => void;
}

export const AddressFormSection: React.FC<AddressFormSectionProps> = ({
  deliveryAddress,
  deliveryCity,
  deliveryPostalCode,
  onAddressChange,
  onCityChange,
  onPostalCodeChange
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Delivery Address</span>
      </div>
      
      <div className="space-y-2">
        <div>
          <Label htmlFor="delivery-address" className="text-xs">Address</Label>
          <Textarea 
            id="delivery-address"
            value={deliveryAddress}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="Street address"
            className="mt-1 min-h-[60px] text-sm"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <Label htmlFor="delivery-city" className="text-xs">City</Label>
            <Input 
              id="delivery-city"
              value={deliveryCity}
              onChange={(e) => onCityChange(e.target.value)}
              placeholder="City"
              className="mt-1 h-8 text-sm"
            />
          </div>
          
          <div>
            <Label htmlFor="delivery-postal-code" className="text-xs">Postal Code</Label>
            <Input 
              id="delivery-postal-code"
              value={deliveryPostalCode}
              onChange={(e) => onPostalCodeChange(e.target.value)}
              placeholder="Postal code"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

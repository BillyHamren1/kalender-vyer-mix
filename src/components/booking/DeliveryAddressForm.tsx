
import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DeliveryAddressFormProps {
  initialAddress: string;
  initialCity: string;
  initialPostalCode: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  isSaving: boolean;
  onSave: (deliveryData: {
    deliveryAddress: string;
    deliveryCity: string;
    deliveryPostalCode: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
  }) => Promise<void>;
}

export const DeliveryAddressForm = ({
  initialAddress,
  initialCity,
  initialPostalCode,
  deliveryLatitude,
  deliveryLongitude,
  isSaving,
  onSave
}: DeliveryAddressFormProps) => {
  const [deliveryAddress, setDeliveryAddress] = useState(initialAddress);
  const [deliveryCity, setDeliveryCity] = useState(initialCity);
  const [deliveryPostalCode, setDeliveryPostalCode] = useState(initialPostalCode);
  const [latitude, setLatitude] = useState<number | undefined>(deliveryLatitude);
  const [longitude, setLongitude] = useState<number | undefined>(deliveryLongitude);
  const [showCoordinates, setShowCoordinates] = useState(false);

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    onSave({
      deliveryAddress,
      deliveryCity,
      deliveryPostalCode,
      deliveryLatitude: latitude,
      deliveryLongitude: longitude
    });
  };

  const handleToggleCoordinates = () => {
    setShowCoordinates(!showCoordinates);
  };

  const validateCoordinate = (value: string, min: number, max: number, type: string): number | undefined => {
    const num = parseFloat(value);
    if (isNaN(num)) {
      toast.error(`Invalid ${type}: must be a number`);
      return undefined;
    }
    if (num < min || num > max) {
      toast.error(`Invalid ${type}: must be between ${min} and ${max}`);
      return undefined;
    }
    return num;
  };

  const handleLatitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = validateCoordinate(e.target.value, -90, 90, 'latitude');
    setLatitude(val);
  };

  const handleLongitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = validateCoordinate(e.target.value, -180, 180, 'longitude');
    setLongitude(val);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <MapPin className="h-4 w-4" />
          <span>Delivery Address</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <div className="space-y-2">
          <div className="grid gap-2">
            <div>
              <Label htmlFor="delivery-address" className="text-xs">Address</Label>
              <Textarea 
                id="delivery-address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
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
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  placeholder="City"
                  className="mt-1 h-8 text-sm"
                />
              </div>
              
              <div>
                <Label htmlFor="delivery-postal-code" className="text-xs">Postal Code</Label>
                <Input 
                  id="delivery-postal-code"
                  value={deliveryPostalCode}
                  onChange={(e) => setDeliveryPostalCode(e.target.value)}
                  placeholder="Postal code"
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-1">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleToggleCoordinates}
              size="sm"
              className="h-7 text-xs"
            >
              {showCoordinates ? "Hide Coordinates" : "Set Coordinates"}
            </Button>
          
            {(latitude && longitude) && !showCoordinates && (
              <p className="text-xs text-gray-500">
                Location: {latitude}, {longitude}
              </p>
            )}
          </div>
          
          {showCoordinates && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1 border p-2 rounded-md">
              <div>
                <Label htmlFor="latitude" className="text-xs">Latitude (-90 to 90)</Label>
                <Input 
                  id="latitude"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  value={latitude || ''}
                  onChange={handleLatitudeChange}
                  placeholder="Latitude"
                  className="mt-1 h-7 text-xs"
                />
              </div>
                
              <div>
                <Label htmlFor="longitude" className="text-xs">Longitude (-180 to 180)</Label>
                <Input 
                  id="longitude"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  value={longitude || ''}
                  onChange={handleLongitudeChange}
                  placeholder="Longitude"
                  className="mt-1 h-7 text-xs"
                />
              </div>
            </div>
          )}
          
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="mt-2 h-8 text-sm w-full"
            size="sm"
          >
            {isSaving ? 'Saving...' : 'Save Address'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

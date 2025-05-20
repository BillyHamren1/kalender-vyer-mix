
import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          <span>Delivery Address</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="delivery-address">Address</Label>
              <Textarea 
                id="delivery-address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Street address"
                className="mt-1"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="delivery-city">City</Label>
                <Input 
                  id="delivery-city"
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  placeholder="City"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="delivery-postal-code">Postal Code</Label>
                <Input 
                  id="delivery-postal-code"
                  value={deliveryPostalCode}
                  onChange={(e) => setDeliveryPostalCode(e.target.value)}
                  placeholder="Postal code"
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleToggleCoordinates}
              size="sm"
            >
              {showCoordinates ? "Hide Coordinates" : "Set Coordinates Manually"}
            </Button>
          
            {(latitude && longitude) && !showCoordinates && (
              <p className="text-sm text-gray-500">
                Location coordinates: {latitude}, {longitude}
              </p>
            )}
          </div>
          
          {showCoordinates && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 border p-3 rounded-md">
              <div>
                <Label htmlFor="latitude">Latitude (-90 to 90)</Label>
                <Input 
                  id="latitude"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  value={latitude || ''}
                  onChange={handleLatitudeChange}
                  placeholder="Latitude (e.g. 52.520008)"
                  className="mt-1"
                />
              </div>
                
              <div>
                <Label htmlFor="longitude">Longitude (-180 to 180)</Label>
                <Input 
                  id="longitude"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  value={longitude || ''}
                  onChange={handleLongitudeChange}
                  placeholder="Longitude (e.g. 13.404954)"
                  className="mt-1"
                />
              </div>
            </div>
          )}
          
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="mt-4 w-full"
          >
            {isSaving ? 'Saving...' : 'Save Delivery Details'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

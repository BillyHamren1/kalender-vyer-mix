
import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface CoordinateControlsProps {
  latitude?: number;
  longitude?: number;
  showCoordinates: boolean;
  onLatitudeChange: (value: number | undefined) => void;
  onLongitudeChange: (value: number | undefined) => void;
  onToggleCoordinates: () => void;
}

export const CoordinateControls: React.FC<CoordinateControlsProps> = ({
  latitude,
  longitude,
  showCoordinates,
  onLatitudeChange,
  onLongitudeChange,
  onToggleCoordinates
}) => {
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
    onLatitudeChange(val);
  };

  const handleLongitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = validateCoordinate(e.target.value, -180, 180, 'longitude');
    onLongitudeChange(val);
  };

  return (
    <>
      <div className="flex justify-between items-center mt-1">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onToggleCoordinates}
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
    </>
  );
};

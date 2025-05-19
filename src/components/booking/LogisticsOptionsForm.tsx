
import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface LogisticsOptionsFormProps {
  initialCarryMoreThan10m: boolean;
  initialGroundNailsAllowed: boolean;
  initialExactTimeNeeded: boolean;
  initialExactTimeInfo: string;
  isSaving: boolean;
  onSave: (logisticsData: {
    carryMoreThan10m: boolean;
    groundNailsAllowed: boolean;
    exactTimeNeeded: boolean;
    exactTimeInfo: string;
  }) => Promise<void>;
}

export const LogisticsOptionsForm = ({
  initialCarryMoreThan10m,
  initialGroundNailsAllowed,
  initialExactTimeNeeded,
  initialExactTimeInfo,
  isSaving,
  onSave
}: LogisticsOptionsFormProps) => {
  const [carryMoreThan10m, setCarryMoreThan10m] = useState(initialCarryMoreThan10m);
  const [groundNailsAllowed, setGroundNailsAllowed] = useState(initialGroundNailsAllowed);
  const [exactTimeNeeded, setExactTimeNeeded] = useState(initialExactTimeNeeded);
  const [exactTimeInfo, setExactTimeInfo] = useState(initialExactTimeInfo);

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    onSave({
      carryMoreThan10m,
      groundNailsAllowed,
      exactTimeNeeded,
      exactTimeInfo
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <span>Logistics Options</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="carry-more-than-10m"
              checked={carryMoreThan10m}
              onCheckedChange={setCarryMoreThan10m}
            />
            <Label
              htmlFor="carry-more-than-10m"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Items need to be carried more than 10 meters
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="ground-nails-allowed"
              checked={groundNailsAllowed}
              onCheckedChange={setGroundNailsAllowed}
            />
            <Label
              htmlFor="ground-nails-allowed"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Ground nails are allowed at the venue
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="exact-time-needed"
              checked={exactTimeNeeded}
              onCheckedChange={setExactTimeNeeded}
            />
            <Label
              htmlFor="exact-time-needed"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Exact delivery time is required
            </Label>
          </div>
          
          {exactTimeNeeded && (
            <div>
              <Label htmlFor="exact-time-info">Time Details</Label>
              <Textarea 
                id="exact-time-info"
                value={exactTimeInfo}
                onChange={(e) => setExactTimeInfo(e.target.value)}
                placeholder="Specify the exact time requirements"
                className="mt-1"
              />
            </div>
          )}
          
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="mt-2"
          >
            Save Logistics Options
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

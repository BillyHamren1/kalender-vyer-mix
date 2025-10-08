
import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

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

  const autoSave = (updatedData: Partial<{
    carryMoreThan10m: boolean;
    groundNailsAllowed: boolean;
    exactTimeNeeded: boolean;
    exactTimeInfo: string;
  }>) => {
    onSave({
      carryMoreThan10m: updatedData.carryMoreThan10m ?? carryMoreThan10m,
      groundNailsAllowed: updatedData.groundNailsAllowed ?? groundNailsAllowed,
      exactTimeNeeded: updatedData.exactTimeNeeded ?? exactTimeNeeded,
      exactTimeInfo: updatedData.exactTimeInfo ?? exactTimeInfo
    });
  };

  const handleCarryMoreThan10mChange = (checked: boolean) => {
    setCarryMoreThan10m(checked);
    autoSave({ carryMoreThan10m: checked });
  };

  const handleGroundNailsAllowedChange = (checked: boolean) => {
    setGroundNailsAllowed(checked);
    autoSave({ groundNailsAllowed: checked });
  };

  const handleExactTimeNeededChange = (checked: boolean) => {
    setExactTimeNeeded(checked);
    autoSave({ exactTimeNeeded: checked });
  };

  const handleExactTimeInfoChange = (value: string) => {
    setExactTimeInfo(value);
    autoSave({ exactTimeInfo: value });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Truck className="h-4 w-4" />
          <span>Logistics Options</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 space-y-4">
        {/* Logistics Options Section - arranged side by side */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="carry-more-than-10m"
                checked={carryMoreThan10m}
                onCheckedChange={handleCarryMoreThan10mChange}
              />
              <Label
                htmlFor="carry-more-than-10m"
                className="text-sm font-medium"
              >
                Carry distance &gt;10m
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="ground-nails-allowed"
                checked={groundNailsAllowed}
                onCheckedChange={handleGroundNailsAllowedChange}
              />
              <Label
                htmlFor="ground-nails-allowed"
                className="text-sm font-medium"
              >
                Ground nails allowed
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="exact-time-needed"
                checked={exactTimeNeeded}
                onCheckedChange={handleExactTimeNeededChange}
              />
              <Label
                htmlFor="exact-time-needed"
                className="text-sm font-medium"
              >
                Exact time required
              </Label>
            </div>
          </div>
        </div>
        
        {/* Time Details Section */}
        {exactTimeNeeded && (
          <div className="space-y-2">
            <div>
              <Label htmlFor="exact-time-info" className="text-sm font-medium text-gray-500">
                Time Details
              </Label>
              <Textarea 
                id="exact-time-info"
                value={exactTimeInfo}
                onChange={(e) => handleExactTimeInfoChange(e.target.value)}
                placeholder="Specify the time requirements"
                className="mt-1"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

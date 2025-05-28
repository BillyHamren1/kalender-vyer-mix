
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
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Truck className="h-4 w-4" />
          <span>Logistics Options</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="carry-more-than-10m"
                checked={carryMoreThan10m}
                onCheckedChange={setCarryMoreThan10m}
                className="h-4 w-7"
              />
              <Label
                htmlFor="carry-more-than-10m"
                className="text-xs font-medium"
              >
                Carry distance >10m
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="ground-nails-allowed"
                checked={groundNailsAllowed}
                onCheckedChange={setGroundNailsAllowed}
                className="h-4 w-7"
              />
              <Label
                htmlFor="ground-nails-allowed"
                className="text-xs font-medium"
              >
                Ground nails allowed
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="exact-time-needed"
                checked={exactTimeNeeded}
                onCheckedChange={setExactTimeNeeded}
                className="h-4 w-7"
              />
              <Label
                htmlFor="exact-time-needed"
                className="text-xs font-medium"
              >
                Exact time required
              </Label>
            </div>
          </div>
          
          {exactTimeNeeded && (
            <div>
              <Label htmlFor="exact-time-info" className="text-xs">Time Details</Label>
              <Textarea 
                id="exact-time-info"
                value={exactTimeInfo}
                onChange={(e) => setExactTimeInfo(e.target.value)}
                placeholder="Specify the time requirements"
                className="mt-1 min-h-[60px] text-sm"
              />
            </div>
          )}
          
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="mt-1 h-8 text-sm"
            size="sm"
          >
            Save Options
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

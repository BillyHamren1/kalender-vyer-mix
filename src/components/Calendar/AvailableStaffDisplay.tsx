
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Calendar, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UnifiedDraggableStaffItem from './UnifiedDraggableStaffItem';
import { format } from 'date-fns';

interface StaffMember {
  id: string;
  name: string;
  color?: string;
}

interface AvailableStaffDisplayProps {
  currentDate: Date;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  availableStaff: StaffMember[];
  isLoading: boolean;
}

const AvailableStaffDisplay: React.FC<AvailableStaffDisplayProps> = ({
  currentDate,
  onStaffDrop,
  availableStaff,
  isLoading
}) => {
  const [isVisible, setIsVisible] = useState(true);

  console.log('AvailableStaffDisplay: Available staff with colors:', availableStaff);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  if (!isVisible) {
    return (
      <div className="fixed right-4 top-1/2 transform -translate-y-1/2 z-40">
        <Button
          onClick={toggleVisibility}
          variant="outline"
          size="sm"
          className="bg-white shadow-lg"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed right-4 top-1/2 transform -translate-y-1/2 w-64 z-40">
      <Card className="shadow-xl border-2 border-gray-200 bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-[#7BAEBF]" />
              Available Staff
            </CardTitle>
            <Button
              onClick={toggleVisibility}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
            >
              <EyeOff className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <Calendar className="h-3 w-3" />
            <span>{format(currentDate, 'MMM d, yyyy')}</span>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center text-sm text-gray-500 py-4">
              Loading available staff...
            </div>
          ) : availableStaff.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-4">
              No available staff for this date
            </div>
          ) : (
            <div className="space-y-1">
              {availableStaff.map((staff) => (
                <UnifiedDraggableStaffItem
                  key={staff.id}
                  staff={{
                    id: staff.id,
                    name: staff.name,
                    color: staff.color || '#E3F2FD',
                    assignedTeam: null
                  }}
                  currentDate={currentDate}
                  variant="available"
                  showRemoveDialog={false}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AvailableStaffDisplay;

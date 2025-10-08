
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';

interface AddDateButtonProps {
  eventType: 'rig' | 'event' | 'rigDown';
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  autoSync: boolean;
}

export const AddDateButton = ({ 
  eventType,
  onAddDate,
  autoSync
}: AddDateButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNewDate, setSelectedNewDate] = useState<Date | undefined>(undefined);
  
  const handleAddDate = () => {
    if (selectedNewDate) {
      onAddDate(selectedNewDate, eventType, autoSync);
      setSelectedNewDate(undefined);
      setIsOpen(false);
    }
  };
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="mt-2 flex items-center gap-1">
          <Plus className="h-3 w-3" />
          Add date
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <h4 className="font-medium">Add new date</h4>
          <Calendar
            mode="single"
            selected={selectedNewDate}
            onSelect={setSelectedNewDate}
            initialFocus
          />
          <div className="flex justify-end gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleAddDate} 
              disabled={!selectedNewDate}
            >
              Add Date
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

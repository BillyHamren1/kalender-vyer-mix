
import React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';

interface FilterControlsProps {
  filterDate: Date | null;
  onDateChange: (date: Date | null) => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  filterDate,
  onDateChange
}) => {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
              size="sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filterDate ? format(filterDate, 'PPP') : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={filterDate || undefined}
              onSelect={onDateChange}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {filterDate && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onDateChange(null)}
        >
          Clear
        </Button>
      )}
    </div>
  );
};

export default FilterControls;

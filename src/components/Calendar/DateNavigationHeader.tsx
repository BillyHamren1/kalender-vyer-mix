
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { Button } from '@/components/ui/button';

interface DateNavigationHeaderProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const DateNavigationHeader: React.FC<DateNavigationHeaderProps> = ({
  currentDate,
  onDateChange
}) => {
  const goToPreviousDay = () => {
    const prevDay = subDays(currentDate, 1);
    onDateChange(prevDay);
  };

  const goToNextDay = () => {
    const nextDay = addDays(currentDate, 1);
    onDateChange(nextDay);
  };

  // Get the current date in Swedish timezone
  const today = new Date();
  const swedishDate = new Date(today.toLocaleString("en-US", {timeZone: "Europe/Stockholm"}));
  
  // Set to May 24, 2025 for Sweden
  const displayDate = new Date(2025, 4, 24); // Month is 0-indexed, so 4 = May

  return (
    <div className="flex items-center justify-center mb-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPreviousDay}
          className="h-10 w-10 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div className="text-2xl font-bold text-slate-800 px-6 py-2 min-w-[200px] text-center">
          {format(displayDate, 'EEEE, MMMM d, yyyy')}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={goToNextDay}
          className="h-10 w-10 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default DateNavigationHeader;

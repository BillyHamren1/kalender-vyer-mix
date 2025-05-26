
import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addDays, addMonths, startOfWeek, endOfWeek } from 'date-fns';

interface StaffCalendarNavigationProps {
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next') => void;
  onToday: () => void;
  viewMode: 'week' | 'month';
}

const StaffCalendarNavigation: React.FC<StaffCalendarNavigationProps> = ({
  currentDate,
  onNavigate,
  onToday,
  viewMode
}) => {
  const getDisplayText = () => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    } else {
      return format(currentDate, 'MMMM yyyy');
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('prev')}
          className="flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        
        <h2 className="text-xl font-semibold text-gray-900 min-w-[250px] text-center">
          {getDisplayText()}
        </h2>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('next')}
          className="flex items-center"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={onToday}
        className="flex items-center"
      >
        <Calendar className="h-4 w-4 mr-2" />
        Today
      </Button>
    </div>
  );
};

export default StaffCalendarNavigation;

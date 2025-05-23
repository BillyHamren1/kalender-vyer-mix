
import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addMonths, startOfMonth } from 'date-fns';

interface MonthNavigationProps {
  currentMonthStart: Date;
  setCurrentMonthStart: (date: Date) => void;
}

const MonthNavigation: React.FC<MonthNavigationProps> = ({
  currentMonthStart,
  setCurrentMonthStart
}) => {
  // Navigation functions
  const goToPreviousMonth = useCallback(() => {
    const prevMonth = addMonths(currentMonthStart, -1);
    setCurrentMonthStart(prevMonth);
  }, [currentMonthStart, setCurrentMonthStart]);

  const goToNextMonth = useCallback(() => {
    const nextMonth = addMonths(currentMonthStart, 1);
    setCurrentMonthStart(nextMonth);
  }, [currentMonthStart, setCurrentMonthStart]);

  const goToCurrentMonth = useCallback(() => {
    const today = new Date();
    const startOfCurrentMonth = startOfMonth(today);
    setCurrentMonthStart(startOfCurrentMonth);
  }, [setCurrentMonthStart]);

  // Format the month for display
  const monthText = format(currentMonthStart, 'MMMM yyyy');

  return (
    <div className="flex flex-col space-y-2 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={goToPreviousMonth}
            className="flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous Month
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={goToCurrentMonth}
            className="flex items-center gap-1"
          >
            <Calendar className="h-4 w-4" />
            Current Month
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={goToNextMonth}
            className="flex items-center gap-1"
          >
            Next Month
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="text-lg font-medium text-center">
        {monthText}
      </div>
    </div>
  );
};

export default MonthNavigation;

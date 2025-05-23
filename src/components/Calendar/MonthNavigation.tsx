
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
    <div className="flex flex-col items-center space-y-4 mb-4 w-full">
      {/* Centered navigation with arrows on sides */}
      <div className="flex items-center justify-center gap-8 w-full max-w-md">
        <Button 
          variant="outline" 
          size="sm"
          onClick={goToPreviousMonth}
          className="flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div className="text-2xl font-bold text-center flex-1">
          {monthText}
        </div>
        
        <Button 
          variant="outline" 
          size="sm"
          onClick={goToNextMonth}
          className="flex items-center gap-1"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Current Month button centered below */}
      <div className="flex justify-center">
        <Button 
          variant="outline" 
          size="sm"
          onClick={goToCurrentMonth}
          className="flex items-center gap-1"
        >
          <Calendar className="h-4 w-4" />
          Current Month
        </Button>
      </div>
    </div>
  );
};

export default MonthNavigation;

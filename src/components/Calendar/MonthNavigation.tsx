
import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addMonths } from 'date-fns';

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

  // Format the month for display
  const monthText = format(currentMonthStart, 'MMMM yyyy');

  return (
    <div className="flex items-center justify-center space-x-6 mb-6 w-full">
      <Button 
        variant="outline" 
        size="lg"
        onClick={goToPreviousMonth}
        className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-gray-300 hover:border-primary hover:bg-primary/10 transition-all duration-200 shadow-sm hover:shadow-md"
      >
        <ChevronLeft className="h-6 w-6" />
      </Button>
      
      <div className="text-3xl font-bold text-center text-gray-800 tracking-wide px-8">
        {monthText}
      </div>
      
      <Button 
        variant="outline" 
        size="lg"
        onClick={goToNextMonth}
        className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-gray-300 hover:border-primary hover:bg-primary/10 transition-all duration-200 shadow-sm hover:shadow-md"
      >
        <ChevronRight className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default MonthNavigation;

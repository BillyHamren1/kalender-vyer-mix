
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
    <div className="flex items-center justify-center mb-8 w-full">
      <div className="flex items-center bg-white rounded-3xl shadow-xl border border-gray-100 px-6 py-4">
        <Button 
          variant="ghost"
          size="sm"
          onClick={goToPreviousMonth}
          className="flex items-center justify-center w-14 h-14 rounded-2xl hover:bg-gray-50 hover:scale-105 transition-all duration-200 text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-7 w-7" />
        </Button>
        
        <div className="text-3xl font-semibold text-gray-900 px-12 py-3 min-w-[300px] text-center tracking-tight">
          {monthText}
        </div>
        
        <Button 
          variant="ghost"
          size="sm"
          onClick={goToNextMonth}
          className="flex items-center justify-center w-14 h-14 rounded-2xl hover:bg-gray-50 hover:scale-105 transition-all duration-200 text-gray-600 hover:text-gray-900"
        >
          <ChevronRight className="h-7 w-7" />
        </Button>
      </div>
    </div>
  );
};

export default MonthNavigation;

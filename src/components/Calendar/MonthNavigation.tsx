
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
      <div className="flex items-center">
        <Button 
          variant="ghost"
          size="sm"
          onClick={goToPreviousMonth}
          className="flex items-center justify-center w-16 h-16 rounded-full hover:bg-gray-100 transition-all duration-300 text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-10 w-10" strokeWidth={2.5} />
        </Button>
        
        <div className="text-4xl font-bold text-slate-800 px-16 py-4 min-w-[360px] text-center tracking-wider">
          {monthText}
        </div>
        
        <Button 
          variant="ghost"
          size="sm"
          onClick={goToNextMonth}
          className="flex items-center justify-center w-16 h-16 rounded-full hover:bg-gray-100 transition-all duration-300 text-slate-600 hover:text-slate-900"
        >
          <ChevronRight className="h-10 w-10" strokeWidth={2.5} />
        </Button>
      </div>
    </div>
  );
};

export default MonthNavigation;

import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
    <div className="flex items-center justify-center mb-8 w-full mt-6">
      <div className="flex items-center">
        <ChevronLeft 
          onClick={goToPreviousMonth}
          className="h-48 w-48 cursor-pointer text-[#7BAEBF] hover:text-[#6E9DAC] transition-colors duration-300"
          strokeWidth={3}
        />
        
        <div className="text-4xl font-bold text-slate-800 px-8 py-4 min-w-[360px] text-center tracking-wider">
          {monthText}
        </div>
        
        <ChevronRight 
          onClick={goToNextMonth}
          className="h-48 w-48 cursor-pointer text-[#7BAEBF] hover:text-[#6E9DAC] transition-colors duration-300"
          strokeWidth={3}
        />
      </div>
    </div>
  );
};

export default MonthNavigation;

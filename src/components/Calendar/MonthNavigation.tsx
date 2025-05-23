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
    <div className="flex items-center justify-center mb-8 w-full">
      <div className="flex items-center">
        <button
          onClick={goToPreviousMonth}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-3 mr-8"
        >
          <ChevronLeft 
            className="h-8 w-8 text-white"
            strokeWidth={3}
          />
        </button>
        
        <div className="text-4xl font-bold text-slate-800 px-8 py-4 min-w-[360px] text-center tracking-wider">
          {monthText}
        </div>
        
        <button
          onClick={goToNextMonth}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-3 ml-8"
        >
          <ChevronRight 
            className="h-8 w-8 text-white"
            strokeWidth={3}
          />
        </button>
      </div>
    </div>
  );
};

export default MonthNavigation;

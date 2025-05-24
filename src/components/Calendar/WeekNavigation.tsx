
import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface WeekNavigationProps {
  currentWeekStart: Date;
  setCurrentWeekStart: (date: Date) => void;
}

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  currentWeekStart,
  setCurrentWeekStart
}) => {
  // Navigation functions
  const goToPreviousWeek = useCallback(() => {
    const prevWeek = new Date(currentWeekStart);
    prevWeek.setDate(prevWeek.getDate() - 7);
    setCurrentWeekStart(prevWeek);
  }, [currentWeekStart, setCurrentWeekStart]);

  const goToNextWeek = useCallback(() => {
    const nextWeek = new Date(currentWeekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    setCurrentWeekStart(nextWeek);
  }, [currentWeekStart, setCurrentWeekStart]);

  // Format the week range for display (Monday to Sunday)
  const weekRangeText = (() => {
    const endDate = addDays(currentWeekStart, 6); // 6 days after Monday = Sunday
    return `${format(currentWeekStart, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
  })();

  return (
    <div className="flex items-center justify-center mb-8 w-full">
      <div className="flex items-center">
        <button
          onClick={goToPreviousWeek}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-2.5 mr-7"
        >
          <ChevronLeft 
            className="h-7 w-7 text-white"
            strokeWidth={3}
          />
        </button>
        
        <div className="text-4xl font-bold text-slate-800 px-8 py-4 min-w-[360px] text-center tracking-wider">
          {weekRangeText}
        </div>
        
        <button
          onClick={goToNextWeek}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-2.5 ml-7"
        >
          <ChevronRight 
            className="h-7 w-7 text-white"
            strokeWidth={3}
          />
        </button>
      </div>
    </div>
  );
};

export default WeekNavigation;

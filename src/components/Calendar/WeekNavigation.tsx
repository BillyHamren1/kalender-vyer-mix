
import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, getWeek } from 'date-fns';

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

  // Format the week range for display
  const weekRangeText = (() => {
    const endDate = addDays(currentWeekStart, 6);
    return `${format(currentWeekStart, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
  })();

  // Generate week days for headers
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    return addDays(currentWeekStart, i);
  });

  return (
    <div className="flex flex-col items-center mb-8 w-full">
      {/* Main navigation with week range */}
      <div className="flex items-center justify-center mb-6">
        <button
          onClick={goToPreviousWeek}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-3 mr-8"
        >
          <ChevronLeft 
            className="h-8 w-8 text-white"
            strokeWidth={3}
          />
        </button>
        
        <div className="text-4xl font-bold text-slate-800 px-8 py-4 min-w-[360px] text-center tracking-wider">
          {weekRangeText}
        </div>
        
        <button
          onClick={goToNextWeek}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-3 ml-8"
        >
          <ChevronRight 
            className="h-8 w-8 text-white"
            strokeWidth={3}
          />
        </button>
      </div>

      {/* Day headers with week numbers (similar to monthly view) */}
      <div className="flex justify-center w-full max-w-7xl">
        <div className="flex gap-2">
          {weekDays.map((date, index) => {
            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            const weekNumber = getWeek(date);
            
            return (
              <div 
                key={index}
                className={`day-header-weekly ${isToday ? 'today' : ''}`}
              >
                <div className="day-name">
                  {format(date, 'EEE').toUpperCase()}
                </div>
                <div className="day-number">
                  {format(date, 'd')}
                </div>
                <div className="week-number">
                  Week {weekNumber}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WeekNavigation;

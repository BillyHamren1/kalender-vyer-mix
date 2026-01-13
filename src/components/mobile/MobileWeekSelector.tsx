
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, addWeeks, getWeek, isSameWeek, addMonths, subMonths } from 'date-fns';
import { sv } from 'date-fns/locale';

interface MobileWeekSelectorProps {
  currentMonth: Date;
  selectedWeekStart: Date;
  onMonthChange: (date: Date) => void;
  onWeekSelect: (weekStart: Date) => void;
}

// Get all weeks that overlap with the given month
const getWeeksInMonth = (monthDate: Date): { weekNumber: number; weekStart: Date; key: string }[] => {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const weeks: { weekNumber: number; weekStart: Date; key: string }[] = [];
  
  let current = startOfWeek(monthStart, { weekStartsOn: 1 });
  
  while (current <= monthEnd) {
    weeks.push({
      weekNumber: getWeek(current, { weekStartsOn: 1 }),
      weekStart: new Date(current),
      key: format(current, 'yyyy-MM-dd')
    });
    current = addWeeks(current, 1);
  }
  
  return weeks;
};

const MobileWeekSelector: React.FC<MobileWeekSelectorProps> = ({
  currentMonth,
  selectedWeekStart,
  onMonthChange,
  onWeekSelect
}) => {
  const weeks = getWeeksInMonth(currentMonth);
  const weekDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

  const handlePreviousMonth = () => {
    onMonthChange(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    onMonthChange(addMonths(currentMonth, 1));
  };

  return (
    <div className="bg-card rounded-2xl shadow-lg overflow-hidden">
      {/* Month Navigation */}
      <div className="bg-primary px-4 py-3 flex items-center justify-between">
        <button
          onClick={handlePreviousMonth}
          className="p-2 rounded-full hover:bg-primary-foreground/10 transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-primary-foreground" />
        </button>
        
        <h2 className="text-lg font-semibold text-primary-foreground capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: sv })}
        </h2>
        
        <button
          onClick={handleNextMonth}
          className="p-2 rounded-full hover:bg-primary-foreground/10 transition-colors"
        >
          <ChevronRight className="h-5 w-5 text-primary-foreground" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 px-3 py-2 bg-muted/50 border-b border-border">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Week Buttons */}
      <div className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground mb-2">Välj vecka:</p>
        <div className="flex flex-wrap gap-2">
          {weeks.map((week) => {
            const isActive = isSameWeek(week.weekStart, selectedWeekStart, { weekStartsOn: 1 });
            
            return (
              <button
                key={week.key}
                onClick={() => onWeekSelect(week.weekStart)}
                className={`
                  flex-1 min-w-[60px] px-3 py-3 rounded-xl text-sm font-medium
                  transition-all duration-200 
                  ${isActive 
                    ? 'bg-primary text-primary-foreground shadow-lg scale-105' 
                    : 'bg-muted text-foreground hover:bg-muted/80 hover:scale-102'
                  }
                `}
              >
                V{week.weekNumber}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MobileWeekSelector;

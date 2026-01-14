
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, getWeek, isSameWeek, startOfMonth, endOfMonth } from 'date-fns';
import { sv } from 'date-fns/locale';

interface MobileWarehouseWeekSelectorProps {
  currentMonth: Date;
  selectedWeekStart: Date;
  onMonthChange: (date: Date) => void;
  onWeekSelect: (weekStart: Date) => void;
}

// Helper to get all weeks that overlap with a given month
const getWeeksInMonth = (monthDate: Date): { weekNumber: number; weekStart: Date; key: string }[] => {
  const weeks: { weekNumber: number; weekStart: Date; key: string }[] = [];
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  
  // Start from the first week that contains any day of the month
  let currentWeekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  
  while (currentWeekStart <= monthEnd) {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    // Only include weeks that have at least one day in the month
    if (weekEnd >= monthStart && currentWeekStart <= monthEnd) {
      weeks.push({
        weekNumber: getWeek(currentWeekStart, { weekStartsOn: 1 }),
        weekStart: currentWeekStart,
        key: format(currentWeekStart, 'yyyy-MM-dd')
      });
    }
    currentWeekStart = addWeeks(currentWeekStart, 1);
  }
  
  return weeks;
};

const MobileWarehouseWeekSelector: React.FC<MobileWarehouseWeekSelectorProps> = ({
  currentMonth,
  selectedWeekStart,
  onMonthChange,
  onWeekSelect
}) => {
  const weeks = getWeeksInMonth(currentMonth);
  
  const handlePreviousMonth = () => {
    onMonthChange(subMonths(currentMonth, 1));
  };
  
  const handleNextMonth = () => {
    onMonthChange(addMonths(currentMonth, 1));
  };

  return (
    <div className="bg-card rounded-3xl shadow-elevated p-4 space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePreviousMonth}
          className="rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <h2 className="text-lg font-semibold capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: sv })}
        </h2>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNextMonth}
          className="rounded-full"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        <span>Mån</span>
        <span>Tis</span>
        <span>Ons</span>
        <span>Tor</span>
        <span>Fre</span>
        <span>Lör</span>
        <span>Sön</span>
      </div>

      {/* Week Buttons */}
      <div className="flex flex-wrap gap-2">
        {weeks.map((week) => {
          const isActive = isSameWeek(week.weekStart, selectedWeekStart, { weekStartsOn: 1 });
          
          return (
            <Button
              key={week.key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onWeekSelect(week.weekStart)}
              className={`
                flex-1 min-w-[60px] rounded-xl transition-all duration-200
                ${isActive 
                  ? 'bg-primary text-primary-foreground shadow-lg transform -translate-y-0.5' 
                  : 'hover:bg-muted/80'
                }
              `}
            >
              V{week.weekNumber}
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileWarehouseWeekSelector;

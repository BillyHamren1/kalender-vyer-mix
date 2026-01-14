
import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, addWeeks, getWeek, isSameWeek, format } from 'date-fns';
import { Button } from '@/components/ui/button';

interface WeekTabsNavigationProps {
  currentMonth: Date;
  currentWeekStart: Date;
  onWeekSelect: (weekStart: Date) => void;
  variant?: 'default' | 'warehouse';
}

// Get all weeks that overlap with the given month
const getWeeksInMonth = (monthDate: Date): { weekNumber: number; weekStart: Date; key: string }[] => {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const weeks: { weekNumber: number; weekStart: Date; key: string }[] = [];
  
  // Start from the Monday of the week containing the first day of month
  let current = startOfWeek(monthStart, { weekStartsOn: 1 });
  
  // Include weeks that have at least one day in the month
  while (current <= monthEnd) {
    weeks.push({
      weekNumber: getWeek(current, { weekStartsOn: 1 }),
      weekStart: new Date(current),
      key: format(current, 'yyyy-MM-dd') // Unique key based on actual date
    });
    current = addWeeks(current, 1);
  }
  
  return weeks;
};

const WeekTabsNavigation: React.FC<WeekTabsNavigationProps> = ({
  currentMonth,
  currentWeekStart,
  onWeekSelect,
  variant = 'default'
}) => {
  const weeks = getWeeksInMonth(currentMonth);
  const isWarehouse = variant === 'warehouse';

  const handleClick = (weekStart: Date) => {
    console.log('Week tab clicked:', weekStart);
    onWeekSelect(weekStart);
  };

  return (
    <div className="flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-b from-muted/50 to-muted border-t border-border">
      {weeks.map((week) => {
        const isActive = isSameWeek(week.weekStart, currentWeekStart, { weekStartsOn: 1 });
        
        return (
          <button
            key={week.key}
            onClick={() => handleClick(week.weekStart)}
            className={`
              flex-1 text-sm font-medium px-4 py-3 rounded-xl transition-all duration-200
              ${isActive 
                ? isWarehouse
                  ? 'bg-warehouse text-white shadow-lg shadow-warehouse/30 scale-105 ring-2 ring-warehouse/20'
                  : 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105 ring-2 ring-primary/20' 
                : 'bg-white text-foreground shadow-md hover:shadow-lg hover:scale-102 hover:bg-white/80 border border-border/50'
              }
            `}
          >
            Vecka {week.weekNumber}
          </button>
        );
      })}
    </div>
  );
};

export default WeekTabsNavigation;


import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, addWeeks, getWeek, isSameWeek } from 'date-fns';
import { Button } from '@/components/ui/button';

interface WeekTabsNavigationProps {
  currentMonth: Date;
  currentWeekStart: Date;
  onWeekSelect: (weekStart: Date) => void;
}

// Get all weeks that overlap with the given month
const getWeeksInMonth = (monthDate: Date): { weekNumber: number; weekStart: Date }[] => {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const weeks: { weekNumber: number; weekStart: Date }[] = [];
  
  // Start from the Monday of the week containing the first day of month
  let current = startOfWeek(monthStart, { weekStartsOn: 1 });
  
  // Include weeks that have at least one day in the month
  while (current <= monthEnd) {
    weeks.push({
      weekNumber: getWeek(current, { weekStartsOn: 1 }),
      weekStart: new Date(current)
    });
    current = addWeeks(current, 1);
  }
  
  return weeks;
};

const WeekTabsNavigation: React.FC<WeekTabsNavigationProps> = ({
  currentMonth,
  currentWeekStart,
  onWeekSelect
}) => {
  const weeks = getWeeksInMonth(currentMonth);

  return (
    <div className="flex items-center justify-center gap-2 py-3 bg-white border-t border-border">
      {weeks.map((week) => {
        const isActive = isSameWeek(week.weekStart, currentWeekStart, { weekStartsOn: 1 });
        
        return (
          <Button
            key={week.weekNumber}
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onWeekSelect(week.weekStart)}
            className="text-xs px-3 py-1 h-7 min-w-[50px]"
          >
            V.{week.weekNumber}
          </Button>
        );
      })}
    </div>
  );
};

export default WeekTabsNavigation;

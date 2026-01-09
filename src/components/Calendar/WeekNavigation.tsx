
import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface WeekNavigationProps {
  currentWeekStart: Date;
  setCurrentWeekStart: (date: Date) => void;
}

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  currentWeekStart,
  setCurrentWeekStart
}) => {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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

  // Handle date selection from calendar
  const handleDateSelect = useCallback((selectedDate: Date | undefined) => {
    if (selectedDate) {
      // Calculate the Monday of the week containing the selected date
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      setCurrentWeekStart(weekStart);
      setDatePickerOpen(false);
    }
  }, [setCurrentWeekStart]);

  // Format the week range for display (Monday to Sunday)
  const weekRangeText = (() => {
    const endDate = addDays(currentWeekStart, 6); // 6 days after Monday = Sunday
    return `${format(currentWeekStart, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
  })();

  return (
    <div className="flex items-center justify-center mb-4 w-full">
      <div className="flex items-center">
        <button
          onClick={goToPreviousWeek}
          className="bg-primary hover:bg-primary/90 transition-colors duration-300 rounded-lg p-1.5 mr-4"
        >
          <ChevronLeft 
            className="h-5 w-5 text-primary-foreground"
            strokeWidth={3}
          />
        </button>
        
        {/* Clickable date range that opens calendar picker */}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "text-2xl font-bold text-slate-800 px-4 py-2 min-w-[280px] text-center tracking-wider h-auto",
                "hover:bg-slate-100 transition-colors duration-200 cursor-pointer"
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <CalendarIcon className="h-6 w-6" />
                {weekRangeText}
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={currentWeekStart}
              onSelect={handleDateSelect}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        
        <button
          onClick={goToNextWeek}
          className="bg-primary hover:bg-primary/90 transition-colors duration-300 rounded-lg p-1.5 ml-4"
        >
          <ChevronRight 
            className="h-5 w-5 text-primary-foreground"
            strokeWidth={3}
          />
        </button>
      </div>
    </div>
  );
};

export default WeekNavigation;

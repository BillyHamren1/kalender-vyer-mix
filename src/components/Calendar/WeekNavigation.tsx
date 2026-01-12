
import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfWeek, getWeek, addMonths, subMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
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
  viewMode?: 'weekly' | 'monthly' | 'list';
  onViewModeChange?: (mode: 'weekly' | 'monthly' | 'list') => void;
  // Monthly mode props
  currentMonth?: Date;
  onMonthChange?: (date: Date) => void;
}

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  currentWeekStart,
  setCurrentWeekStart,
  viewMode,
  onViewModeChange,
  currentMonth,
  onMonthChange
}) => {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Determine if we're in monthly mode
  const isMonthlyMode = viewMode === 'monthly';

  // Navigation functions for weekly mode
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

  // Navigation functions for monthly mode
  const goToPreviousMonth = useCallback(() => {
    if (currentMonth && onMonthChange) {
      onMonthChange(subMonths(currentMonth, 1));
    }
  }, [currentMonth, onMonthChange]);

  const goToNextMonth = useCallback(() => {
    if (currentMonth && onMonthChange) {
      onMonthChange(addMonths(currentMonth, 1));
    }
  }, [currentMonth, onMonthChange]);

  // Handle date selection from calendar
  const handleDateSelect = useCallback((selectedDate: Date | undefined) => {
    if (selectedDate) {
      if (isMonthlyMode && onMonthChange) {
        // In monthly mode, just change the month
        onMonthChange(selectedDate);
      } else {
        // In weekly mode, calculate the Monday of the week
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        setCurrentWeekStart(weekStart);
      }
      setDatePickerOpen(false);
    }
  }, [setCurrentWeekStart, isMonthlyMode, onMonthChange]);

  // Format header text based on mode
  const headerText = (() => {
    if (isMonthlyMode && currentMonth) {
      const monthName = format(currentMonth, 'MMMM', { locale: sv });
      const year = format(currentMonth, 'yyyy');
      return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
    }
    // Weekly mode: show week number + month
    const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });
    const monthName = format(currentWeekStart, 'MMMM', { locale: sv });
    const year = format(currentWeekStart, 'yyyy');
    return `Vecka ${weekNumber}, ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
  })();

  // Use appropriate navigation handlers based on mode
  const handlePrevious = isMonthlyMode ? goToPreviousMonth : goToPreviousWeek;
  const handleNext = isMonthlyMode ? goToNextMonth : goToNextWeek;

  return (
    <div className="flex items-center justify-between bg-white border-b border-border px-6 py-3">
      {/* Left spacer for centering */}
      <div className="w-32" />

      {/* Centered Navigation */}
      <div className="flex items-center">
        <button
          onClick={handlePrevious}
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
                "text-xl font-semibold text-foreground px-3 py-1.5 text-center tracking-wide h-auto",
                "hover:bg-muted transition-colors duration-200 cursor-pointer"
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {headerText}
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={isMonthlyMode ? currentMonth : currentWeekStart}
              onSelect={handleDateSelect}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        
        <button
          onClick={handleNext}
          className="bg-primary hover:bg-primary/90 transition-colors duration-300 rounded-lg p-1.5 ml-4"
        >
          <ChevronRight 
            className="h-5 w-5 text-primary-foreground"
            strokeWidth={3}
          />
        </button>
      </div>

      {/* Right side - View Mode Buttons */}
      {viewMode && onViewModeChange ? (
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'weekly' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('weekly')}
            className="text-xs px-2 py-1 h-7"
          >
            Vecka
          </Button>
          <Button
            variant={viewMode === 'monthly' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('monthly')}
            className="text-xs px-2 py-1 h-7"
          >
            Månad
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            className="text-xs px-2 py-1 h-7"
          >
            Lista
          </Button>
        </div>
      ) : (
        <div className="w-32" />
      )}
    </div>
  );
};

export default WeekNavigation;

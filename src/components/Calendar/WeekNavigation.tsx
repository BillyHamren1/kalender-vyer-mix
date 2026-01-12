
import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfWeek, getWeek } from 'date-fns';
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
}

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  currentWeekStart,
  setCurrentWeekStart,
  viewMode,
  onViewModeChange
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

  // Format as week number + month (e.g., "Vecka 3, Januari 2026")
  const weekRangeText = (() => {
    const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });
    const monthName = format(currentWeekStart, 'MMMM', { locale: sv });
    const year = format(currentWeekStart, 'yyyy');
    return `Vecka ${weekNumber}, ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
  })();

  return (
    <div className="flex items-center justify-between bg-white border-b border-border px-6 py-3">
      {/* Left spacer for centering */}
      <div className="w-32" />

      {/* Centered Navigation */}
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
                "text-xl font-semibold text-foreground px-3 py-1.5 text-center tracking-wide h-auto",
                "hover:bg-muted transition-colors duration-200 cursor-pointer"
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <CalendarIcon className="h-5 w-5" />
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

      {/* Right side - View Mode Buttons */}
      {viewMode && onViewModeChange ? (
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'weekly' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('weekly')}
            className="text-xs px-2 py-1 h-7"
          >
            Vecka
          </Button>
          <Button
            variant={viewMode === 'monthly' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('monthly')}
            className="text-xs px-2 py-1 h-7"
          >
            Månad
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
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

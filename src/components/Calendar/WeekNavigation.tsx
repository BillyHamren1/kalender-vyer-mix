
import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin } from 'lucide-react';
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
  eventCount?: number;
  onGoToEvents?: () => void;
}

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  currentWeekStart,
  setCurrentWeekStart,
  eventCount = 0,
  onGoToEvents
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

  // Go to today
  const goToToday = useCallback(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    setCurrentWeekStart(weekStart);
  }, [setCurrentWeekStart]);

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
      <div className="flex items-center gap-4">
        <button
          onClick={goToPreviousWeek}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-2.5"
        >
          <ChevronLeft 
            className="h-6 w-6 text-white"
            strokeWidth={3}
          />
        </button>
        
        {/* Today Button */}
        <Button
          onClick={goToToday}
          variant="outline"
          size="sm"
          className="px-4 py-2 text-sm font-medium hover:bg-blue-50 transition-colors"
        >
          Today
        </Button>

        {/* Go to Events Button */}
        {onGoToEvents && (
          <Button
            onClick={onGoToEvents}
            variant="outline"
            size="sm"
            className="px-4 py-2 text-sm font-medium hover:bg-green-50 transition-colors flex items-center gap-2"
          >
            <MapPin className="h-4 w-4" />
            Go to Events
          </Button>
        )}
        
        {/* Clickable date range that opens calendar picker */}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "text-3xl font-bold text-slate-800 px-6 py-3 min-w-[320px] text-center tracking-wider h-auto",
                "hover:bg-slate-100 transition-colors duration-200 cursor-pointer"
              )}
            >
              <div className="flex items-center justify-center gap-3">
                <CalendarIcon className="h-7 w-7" />
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

        {/* Event Count Display */}
        <div className="text-sm text-gray-600 px-3 py-2 bg-gray-100 rounded-lg">
          {eventCount} events
        </div>
        
        <button
          onClick={goToNextWeek}
          className="bg-[#7BAEBF] hover:bg-[#6E9DAC] transition-colors duration-300 rounded-lg p-2.5"
        >
          <ChevronRight 
            className="h-6 w-6 text-white"
            strokeWidth={3}
          />
        </button>
      </div>
    </div>
  );
};

export default WeekNavigation;

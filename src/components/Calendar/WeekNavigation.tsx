
import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfWeek, getWeek, addMonths, subMonths, setMonth, setYear } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface WeekNavigationProps {
  currentWeekStart: Date;
  setCurrentWeekStart: (date: Date) => void;
  viewMode?: 'day' | 'weekly' | 'monthly' | 'list';
  onViewModeChange?: (mode: 'day' | 'weekly' | 'monthly' | 'list') => void;
  // Monthly mode props
  currentMonth?: Date;
  onMonthChange?: (date: Date) => void;
  // Theme variant
  variant?: 'default' | 'warehouse';
}

// Swedish month names
const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
];

// Generate years range (current year -5 to +5)
const getYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let i = currentYear - 5; i <= currentYear + 5; i++) {
    years.push(i);
  }
  return years;
};

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  currentWeekStart,
  setCurrentWeekStart,
  viewMode,
  onViewModeChange,
  currentMonth,
  onMonthChange,
  variant = 'default'
}) => {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Determine if we're in monthly mode
  const isMonthlyMode = viewMode === 'monthly';

  // Get active date for display/selection
  const activeDate = isMonthlyMode && currentMonth ? currentMonth : currentWeekStart;

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
        onMonthChange(selectedDate);
      } else {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        setCurrentWeekStart(weekStart);
      }
      setDatePickerOpen(false);
    }
  }, [setCurrentWeekStart, isMonthlyMode, onMonthChange]);

  // Handle month selection from dropdown
  const handleMonthSelect = useCallback((monthIndex: string) => {
    const newDate = setMonth(activeDate, parseInt(monthIndex));
    if (isMonthlyMode && onMonthChange) {
      onMonthChange(newDate);
    } else {
      const weekStart = startOfWeek(newDate, { weekStartsOn: 1 });
      setCurrentWeekStart(weekStart);
    }
  }, [activeDate, isMonthlyMode, onMonthChange, setCurrentWeekStart]);

  // Handle year selection from dropdown
  const handleYearSelect = useCallback((year: string) => {
    const newDate = setYear(activeDate, parseInt(year));
    if (isMonthlyMode && onMonthChange) {
      onMonthChange(newDate);
    } else {
      const weekStart = startOfWeek(newDate, { weekStartsOn: 1 });
      setCurrentWeekStart(weekStart);
    }
  }, [activeDate, isMonthlyMode, onMonthChange, setCurrentWeekStart]);

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

  const yearOptions = getYearOptions();
  const currentMonthIndex = activeDate.getMonth();
  const currentYearValue = activeDate.getFullYear();

  const chevronAccent = variant === 'warehouse'
    ? 'text-warehouse hover:bg-warehouse/10'
    : 'text-primary hover:bg-primary/10';

  const segmentActive = variant === 'warehouse'
    ? 'bg-warehouse text-white shadow-sm'
    : 'bg-primary text-primary-foreground shadow-sm';

  const viewOptions: Array<{ key: 'day' | 'weekly' | 'monthly' | 'list'; label: string }> = [
    { key: 'day', label: 'Dag' },
    { key: 'weekly', label: 'Vecka' },
    { key: 'monthly', label: 'Månad' },
    { key: 'list', label: 'Lista' },
  ];

  return (
    <div className="flex items-center justify-between gap-4 bg-white/95 backdrop-blur border-b border-border/60 px-5 py-2">
      <div className="w-24 shrink-0" />

      <div className="flex items-center gap-1">
        <button
          onClick={handlePrevious}
          className={cn(
            'h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors',
            chevronAccent
          )}
          aria-label="Föregående"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>

        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 px-3 text-[15px] font-semibold text-foreground tracking-tight hover:bg-muted/60 rounded-md"
            >
              <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
              {headerText}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-white z-50" align="center">
            <div className="flex flex-col">
              <div className="flex gap-2 p-3 border-b border-border bg-muted/30">
                <Select value={currentMonthIndex.toString()} onValueChange={handleMonthSelect}>
                  <SelectTrigger className="w-[130px] h-9 bg-white">
                    <SelectValue placeholder="Månad" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    {MONTHS.map((month, index) => (
                      <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={currentYearValue.toString()} onValueChange={handleYearSelect}>
                  <SelectTrigger className="w-[100px] h-9 bg-white">
                    <SelectValue placeholder="År" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Calendar
                mode="single"
                selected={activeDate}
                onSelect={handleDateSelect}
                month={activeDate}
                onMonthChange={(newMonth) => {
                  if (isMonthlyMode && onMonthChange) {
                    onMonthChange(newMonth);
                  } else {
                    const weekStart = startOfWeek(newMonth, { weekStartsOn: 1 });
                    setCurrentWeekStart(weekStart);
                  }
                }}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </div>
          </PopoverContent>
        </Popover>

        <button
          onClick={handleNext}
          className={cn(
            'h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors',
            chevronAccent
          )}
          aria-label="Nästa"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      {viewMode && onViewModeChange ? (
        <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/50">
          {([
            { key: 'day', label: 'Dag' },
            { key: 'weekly', label: 'Vecka' },
            { key: 'monthly', label: 'Månad' },
            { key: 'list', label: 'Lista' },
          ] as const).map(opt => {
            const active = viewMode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onViewModeChange(opt.key)}
                className={cn(
                  'h-7 px-3 text-[12px] font-medium rounded-md transition-all',
                  active ? segmentActive : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="w-24 shrink-0" />
      )}
    </div>
  );
};

export default WeekNavigation;

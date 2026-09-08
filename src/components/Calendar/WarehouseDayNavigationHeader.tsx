import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { addDays, format, subDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type WarehouseCalendarViewMode = 'day' | 'weekly' | 'monthly' | 'list';

interface WarehouseDayNavigationHeaderProps {
  date: Date;
  onDateChange: (nextDate: Date) => void;
  viewMode: WarehouseCalendarViewMode;
  onViewModeChange: (mode: WarehouseCalendarViewMode) => void;
  viewOptions?: ReadonlyArray<{ key: WarehouseCalendarViewMode; label: string }>;
}

const capitalize = (s: string) => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const WarehouseDayNavigationHeader: React.FC<WarehouseDayNavigationHeaderProps> = ({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  viewOptions,
}) => {
  const dayLabel = capitalize(format(date, 'EEEE d MMMM yyyy', { locale: sv }));
  const options = viewOptions ?? [
    { key: 'day' as const, label: 'Dag' },
    { key: 'weekly' as const, label: 'Vecka' },
    { key: 'monthly' as const, label: 'Månad' },
    { key: 'list' as const, label: 'Lista' },
  ];

  return (
    <div className="flex items-center justify-between bg-background border-b border-border px-6 py-3">
      <div className="w-32" />

      <div className="flex items-center">
        <button
          onClick={() => onDateChange(subDays(date, 1))}
          className="bg-warehouse hover:bg-warehouse-hover transition-colors duration-300 rounded-lg p-1.5 mr-4"
          aria-label="Föregående dag"
        >
          <ChevronLeft className="h-5 w-5 text-warehouse-foreground" strokeWidth={3} />
        </button>

        <div className="text-xl font-semibold text-foreground px-3 py-1.5 text-center tracking-wide h-auto">
          <div className="flex items-center justify-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {dayLabel}
          </div>
        </div>

        <button
          onClick={() => onDateChange(addDays(date, 1))}
          className="bg-warehouse hover:bg-warehouse-hover transition-colors duration-300 rounded-lg p-1.5 ml-4"
          aria-label="Nästa dag"
        >
          <ChevronRight className="h-5 w-5 text-warehouse-foreground" strokeWidth={3} />
        </button>
      </div>

      <div className="flex gap-1">
        {options.map((option) => (
          <Button
            key={option.key}
            variant={viewMode === option.key ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange(option.key)}
            className={cn(
              'h-7 px-2 py-1 text-xs',
              viewMode === option.key && 'bg-warehouse hover:bg-warehouse-hover',
            )}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default WarehouseDayNavigationHeader;

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
}

const capitalize = (s: string) => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const WarehouseDayNavigationHeader: React.FC<WarehouseDayNavigationHeaderProps> = ({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
}) => {
  const dayLabel = capitalize(format(date, 'EEEE d MMMM yyyy', { locale: sv }));

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
        <Button
          variant={viewMode === 'day' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('day')}
          className={cn("text-xs px-2 py-1 h-7", viewMode === 'day' && "bg-warehouse hover:bg-warehouse-hover")}
        >
          Dag
        </Button>
        <Button
          variant={viewMode === 'weekly' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('weekly')}
          className={cn("text-xs px-2 py-1 h-7", viewMode === 'weekly' && "bg-warehouse hover:bg-warehouse-hover")}
        >
          Vecka
        </Button>
        <Button
          variant={viewMode === 'monthly' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('monthly')}
          className={cn("text-xs px-2 py-1 h-7", viewMode === 'monthly' && "bg-warehouse hover:bg-warehouse-hover")}
        >
          Månad
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('list')}
          className={cn("text-xs px-2 py-1 h-7", viewMode === 'list' && "bg-warehouse hover:bg-warehouse-hover")}
        >
          Lista
        </Button>
      </div>
    </div>
  );
};

export default WarehouseDayNavigationHeader;

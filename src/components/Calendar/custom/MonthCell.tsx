import React from 'react';
import { format, isToday as isTodayFn, isSameMonth } from 'date-fns';

interface MonthEvent {
  id: string;
  title: string;
  backgroundColor?: string;
  borderColor?: string;
  extendedProps?: Record<string, any>;
}

interface MonthCellProps {
  date: Date;
  currentMonth: Date;
  events: MonthEvent[];
  maxVisible?: number;
  onEventClick?: (event: MonthEvent) => void;
}

const MonthCell: React.FC<MonthCellProps> = React.memo(({
  date,
  currentMonth,
  events,
  maxVisible = 3,
  onEventClick,
}) => {
  const isCurrentMonth = isSameMonth(date, currentMonth);
  const isToday = isTodayFn(date);
  const visible = events.slice(0, maxVisible);
  const overflow = events.length - maxVisible;

  return (
    <div
      className={`min-h-[80px] border border-border p-1 transition-colors ${
        !isCurrentMonth ? 'bg-muted/20 opacity-40' : 'bg-background hover:bg-muted/10'
      } ${isToday ? 'ring-1 ring-primary bg-primary/5' : ''}`}
    >
      {/* Day number */}
      <div className="flex justify-start p-0.5">
        <span
          className={`text-sm w-7 h-7 flex items-center justify-center rounded-md font-medium ${
            isToday
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-foreground'
          }`}
        >
          {format(date, 'd')}
        </span>
      </div>

      {/* Events */}
      <div className="mt-1 space-y-0.5">
        {visible.map(ev => (
          <div
            key={ev.id}
            className="text-[11px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer
                       shadow-sm hover:-translate-y-px hover:shadow transition-all"
            style={{
              backgroundColor: ev.backgroundColor || 'hsl(var(--accent))',
              color: '#374151',
            }}
            onClick={() => onEventClick?.(ev)}
          >
            {ev.title}
          </div>
        ))}
        {overflow > 0 && (
          <div className="text-[10px] font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5 cursor-pointer hover:bg-primary/20 transition-colors">
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
});

MonthCell.displayName = 'MonthCell';

export default MonthCell;

import React, { useMemo } from 'react';
import { addDays, format, isToday, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { MyCalendarItem } from '@/hooks/useMyCalendarItems';
import { MyCalendarEventCard } from './MyCalendarEventCard';
import { CalendarOff } from 'lucide-react';

interface Props {
  anchorDate: Date;
  items: MyCalendarItem[];
  onItemClick: (item: MyCalendarItem) => void;
}

export const MyCalendarWeekView: React.FC<Props> = ({ anchorDate, items, onItemClick }) => {
  const days = useMemo(() => {
    const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchorDate]);

  const itemsByDate = useMemo(() => {
    const m = new Map<string, MyCalendarItem[]>();
    for (const it of items) {
      const arr = m.get(it.date) || [];
      arr.push(it);
      m.set(it.date, arr);
    }
    return m;
  }, [items]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {days.map((d) => {
        const iso = format(d, 'yyyy-MM-dd');
        const dayItems = itemsByDate.get(iso) || [];
        const today = isToday(d);

        return (
          <div
            key={iso}
            className={cn(
              'rounded-xl border border-border/60 bg-card p-3 flex flex-col gap-2 min-h-[200px]',
              today && 'border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20',
            )}
          >
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {format(d, 'EEE', { locale: sv })}
                </span>
                <span
                  className={cn(
                    'text-base font-bold tabular-nums',
                    today && 'text-primary',
                  )}
                >
                  {format(d, 'd', { locale: sv })}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {format(d, 'MMM', { locale: sv })}
                </span>
              </div>
              {dayItems.length > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                  {dayItems.length}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              {dayItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/60 py-4">
                  <CalendarOff className="h-5 w-5 mb-1" />
                  <span className="text-[10px]">Inget planerat</span>
                </div>
              ) : (
                dayItems.map((it) => (
                  <MyCalendarEventCard key={it.id} item={it} onClick={() => onItemClick(it)} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MyCalendarWeekView;

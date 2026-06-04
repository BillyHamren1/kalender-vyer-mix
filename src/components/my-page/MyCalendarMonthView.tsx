import React, { useMemo } from 'react';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { MyCalendarItem } from '@/hooks/useMyCalendarItems';
import { MyCalendarEventCard } from './MyCalendarEventCard';

interface Props {
  anchorDate: Date;
  items: MyCalendarItem[];
  onItemClick: (item: MyCalendarItem) => void;
  onDayClick?: (isoDate: string) => void;
}

const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

export const MyCalendarMonthView: React.FC<Props> = ({ anchorDate, items, onItemClick, onDayClick }) => {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 1 });
    const out: Date[] = [];
    let cur = start;
    while (cur <= end) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
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
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/40">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr">
        {days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd');
          const dayItems = itemsByDate.get(iso) || [];
          const inMonth = isSameMonth(d, anchorDate);
          const today = isToday(d);

          return (
            <div
              key={iso}
              onClick={(e) => {
                if (!onDayClick) return;
                // Bara om man klickar på tom yta — inte på ett event-kort
                if ((e.target as HTMLElement).closest('[data-event-card]')) return;
                onDayClick(iso);
              }}
              className={cn(
                'min-h-[120px] border-r border-b border-border/40 p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-muted/40 transition-colors',
                !inMonth && 'bg-muted/30 text-muted-foreground',
                today && 'bg-primary/[0.04]',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-[11px] font-semibold tabular-nums',
                    today && 'h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center',
                  )}
                >
                  {format(d, 'd', { locale: sv })}
                </span>
                {dayItems.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{dayItems.length - 3}</span>
                )}
              </div>
              <div className="flex flex-col gap-1 min-h-0">
                {dayItems.slice(0, 3).map((it) => (
                  <MyCalendarEventCard
                    key={it.id}
                    item={it}
                    compact
                    onClick={() => onItemClick(it)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MyCalendarMonthView;

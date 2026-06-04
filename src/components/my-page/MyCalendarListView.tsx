import React, { useMemo } from 'react';
import { format, isToday, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { MyCalendarItem } from '@/hooks/useMyCalendarItems';
import { MyCalendarEventCard } from './MyCalendarEventCard';
import { CalendarOff } from 'lucide-react';

interface Props {
  items: MyCalendarItem[];
  onItemClick: (item: MyCalendarItem) => void;
}

export const MyCalendarListView: React.FC<Props> = ({ items, onItemClick }) => {
  const grouped = useMemo(() => {
    const m = new Map<string, MyCalendarItem[]>();
    for (const it of items) {
      const arr = m.get(it.date) || [];
      arr.push(it);
      m.set(it.date, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  if (grouped.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card py-12 flex flex-col items-center text-muted-foreground">
        <CalendarOff className="h-8 w-8 mb-2" />
        <p className="text-sm">Inget planerat ännu.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped.map(([date, dayItems]) => {
        const d = parseISO(date);
        const today = isToday(d);
        return (
          <div key={date} className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div
              className={cn(
                'px-4 py-2 flex items-baseline gap-3 border-b border-border/60',
                today ? 'bg-primary/[0.06]' : 'bg-muted/30',
              )}
            >
              <span
                className={cn(
                  'text-lg font-bold tabular-nums',
                  today && 'text-primary',
                )}
              >
                {format(d, 'd MMM', { locale: sv })}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {format(d, 'EEEE', { locale: sv })}
              </span>
              {today && (
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                  Idag
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">{dayItems.length} st</span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {dayItems.map((it) => (
                <MyCalendarEventCard key={it.id} item={it} onClick={() => onItemClick(it)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MyCalendarListView;

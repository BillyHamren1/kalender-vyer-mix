import { useMemo } from 'react';
import { format, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarEvent, getEventCardClass } from '@/components/Calendar/ResourceData';
import { cn } from '@/lib/utils';

interface Props {
  events: CalendarEvent[];
  currentDate: Date;
  viewMode: 'day' | 'weekly' | 'monthly' | 'list';
  onOpenEvent: (event: CalendarEvent) => void;
  onAssignStaff?: (event: CalendarEvent) => void;
}

const TYPE_LABELS: Record<string, string> = {
  packing: 'Packning',
  delivery: 'Utleverans',
  return: 'Retur',
  unpacking: 'Uppackning',
  inventory: 'Inventering',
  internal_task: 'Lageruppgift',
  transport: 'Transport',
};

const dateKey = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'yyyy-MM-dd');
};

const timeLabel = (event: CalendarEvent) => {
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime())) return '';
  const from = format(start, 'HH:mm');
  if (Number.isNaN(end.getTime()) || end.getTime() === start.getTime()) return from;
  return `${from}–${format(end, 'HH:mm')}`;
};

const EventRow = ({ event, onOpenEvent, onAssignStaff, compact = false }: {
  event: CalendarEvent;
  onOpenEvent: (event: CalendarEvent) => void;
  onAssignStaff?: (event: CalendarEvent) => void;
  compact?: boolean;
}) => {
  const label = TYPE_LABELS[event.eventType || ''] || 'Lager';
  const booking = event.bookingNumber || event.booking_number || event.extendedProps?.bookingNumber;
  const title = event.extendedProps?.bookingTitle || event.title;
  const phase = event.extendedProps?.phaseContext as string | undefined;
  const packed = event.extendedProps?.packedLabel as string | undefined;

  return (
    <div
      className={cn(
        'group rounded-lg border-l-4 border border-border/50 bg-background/80 transition-colors hover:bg-accent/30',
        getEventCardClass(event.eventType),
        compact ? 'px-2 py-1.5' : 'px-3 py-2.5',
      )}
    >
      <button type="button" onClick={() => onOpenEvent(event)} className="w-full text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{timeLabel(event)}</span>
          {booking && <span className="text-[10px] font-mono text-muted-foreground/80 shrink-0">#{booking}</span>}
        </div>
        <div className={cn('font-semibold text-foreground truncate', compact ? 'text-[11px]' : 'text-sm')}>{title}</div>
        {!compact && (phase || packed || event.deliveryAddress) && (
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {packed && <span>{packed}</span>}
            {phase && <span>{phase}</span>}
            {event.deliveryAddress && <span className="truncate max-w-[260px]">{event.deliveryAddress}</span>}
          </div>
        )}
      </button>
      {onAssignStaff && event.eventType !== 'transport' && (
        <button
          type="button"
          onClick={() => onAssignStaff(event)}
          className="mt-1 text-[10px] font-semibold text-primary hover:underline opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          Tilldela personal
        </button>
      )}
    </div>
  );
};

export default function WarehouseGeneralCalendar({ events, currentDate, viewMode, onOpenEvent, onAssignStaff }: Props) {
  const visibleDays = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    if (viewMode === 'monthly') {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate, viewMode]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      if (!event.start) return;
      const key = dateKey(event.start);
      if (!key) return;
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    });
    map.forEach((list) => list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    return map;
  }, [events]);

  if (viewMode === 'list') {
    const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return (
      <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card">
        {sorted.map((event) => (
          <div key={event.id} className="grid gap-3 px-4 py-3 md:grid-cols-[110px_1fr]">
            <div className="text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">{format(new Date(event.start), 'd MMM', { locale: sv })}</div>
              <div>{timeLabel(event)}</div>
            </div>
            <EventRow event={event} onOpenEvent={onOpenEvent} onAssignStaff={onAssignStaff} />
          </div>
        ))}
        {sorted.length === 0 && <div className="px-4 py-8 text-sm text-muted-foreground">Inget lagerarbete i perioden.</div>}
      </div>
    );
  }

  if (viewMode === 'monthly') {
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/30">
          {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map((day) => (
            <div key={day} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {visibleDays.map((day, index) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay.get(key) || [];
            return (
              <div
                key={key}
                className={cn(
                  'min-h-[120px] border-border/40 p-1.5',
                  index % 7 !== 6 && 'border-r',
                  index < visibleDays.length - 7 && 'border-b',
                  !isSameMonth(day, currentDate) && 'bg-muted/20 text-muted-foreground',
                )}
              >
                <div className={cn('mb-1 text-[11px] font-semibold', isToday(day) && 'text-primary')}>{format(day, 'd')}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 4).map((event) => (
                    <EventRow key={event.id} event={event} onOpenEvent={onOpenEvent} onAssignStaff={onAssignStaff} compact />
                  ))}
                  {dayEvents.length > 4 && <div className="px-1 text-[10px] text-muted-foreground">+ {dayEvents.length - 4} till</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-2', viewMode === 'day' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-7')}>
      {visibleDays.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDay.get(key) || [];
        return (
          <section key={key} className="min-w-0 rounded-xl border border-border/60 bg-card overflow-hidden">
            <header className={cn('border-b border-border/50 px-3 py-2', isToday(day) && 'bg-primary/5')}>
              <div className="text-xs font-semibold capitalize text-foreground">{format(day, 'EEE', { locale: sv })}</div>
              <div className={cn('text-lg font-bold tabular-nums', isToday(day) && 'text-primary')}>{format(day, 'd')}</div>
            </header>
            <div className="space-y-2 p-2 min-h-[220px]">
              {dayEvents.map((event) => (
                <EventRow key={event.id} event={event} onOpenEvent={onOpenEvent} onAssignStaff={onAssignStaff} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

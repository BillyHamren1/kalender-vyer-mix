/**
 * TimeCalendarTab — månadsgrid driven av `useStaffMonthStatus`.
 *
 * Backend (`get-staff-month-status`) äger sanningen. Tills endpointen finns
 * returnerar hooken en stabil tom struktur — vi visar då en neutral
 * placeholder. UI gör ingen lokal aggregering av rådata.
 */
import { useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  parseISO,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useStaffMonthStatus } from '@/hooks/useStaffMonthStatus';
import { formatHoursMinutes } from '@/utils/formatHours';

const WEEK_DAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

export const TimeCalendarTab = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date());
  const { status, isLoading } = useStaffMonthStatus(month);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startOffset = (getDay(monthStart) + 6) % 7;

  // Snapshot är sanningen — bygg en lookup utan att aggregera lokalt.
  const dayLookup = useMemo(() => {
    const map = new Map<string, (typeof status)['days'][number] | undefined>();
    if (!status) return map;
    for (const d of status.days) map.set(d.date, d);
    return map;
  }, [status]);

  const totalLabel = status
    ? `${formatHoursMinutes(status.totals.workdayMinutes / 60)}`
    : '–';

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="h-9 w-9 rounded-xl border border-border/60 bg-card flex items-center justify-center active:scale-95 transition-all"
          aria-label="Föregående månad"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-bold text-foreground capitalize">
            {format(month, 'MMMM yyyy', { locale: sv })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Totalt arbetsdagar: <span className="font-semibold text-foreground">{totalLabel}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="h-9 w-9 rounded-xl border border-border/60 bg-card flex items-center justify-center active:scale-95 transition-all"
          aria-label="Nästa månad"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 px-1">
        {WEEK_DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const info = dayLookup.get(key);
          const isToday = isSameDay(day, new Date());
          const hasFlag = info?.hasFlags;
          const minutes = info?.workdayMinutes ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`/m/time-history?date=${key}`)}
              className={cn(
                'aspect-square rounded-xl border bg-card flex flex-col items-center justify-center text-center px-1 active:scale-95 transition-all',
                isToday
                  ? 'border-primary/50 ring-1 ring-primary/30'
                  : 'border-border/50',
              )}
            >
              <span className="text-xs font-bold text-foreground leading-none">
                {format(day, 'd')}
              </span>
              {minutes > 0 && (
                <span className="text-[9px] text-muted-foreground tabular-nums mt-0.5">
                  {formatHoursMinutes(minutes / 60)}
                </span>
              )}
              {hasFlag && (
                <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full bg-warning" />
              )}
            </button>
          );
        })}
      </div>

      {/* Backend status hint */}
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-3 flex items-start gap-2">
        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {isLoading
            ? 'Hämtar månadsstatus…'
            : status && status.days.length === 0
              ? 'Månadsöversikten visas så snart backend-snapshot är aktiverad. Tryck på en dag för att öppna detaljerad historik.'
              : 'Alla värden kommer från serverns dagstatus — appen räknar inte själv.'}
        </p>
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
};

export default TimeCalendarTab;

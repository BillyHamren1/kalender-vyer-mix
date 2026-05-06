/**
 * TimeCalendarTab — månads-/vecko-historik från `useStaffMonthStatus`.
 *
 * Hybrid-layout: månadsväljare + summering + en lista där varje dag är
 * en stor mobilvänlig rad med datum, total tid, status och färgkodning.
 * Klick på en rad öppnar `StaffDayDetailSheet` som driver dagdetaljen
 * från `useStaffDayStatus(date)`. UI gör ingen lokal aggregering.
 */
import { useMemo, useState } from 'react';
import {
  format, addMonths, subMonths, startOfMonth, parseISO, isSameMonth,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle,
  Clock, CalendarDays, Lock, Sun, MoonStar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStaffMonthStatus,
  type StaffMonthDayStatus,
  type StaffMonthDayKind,
} from '@/hooks/useStaffMonthStatus';
import { formatHoursMinutes } from '@/utils/formatHours';
import StaffDayDetailSheet from './StaffDayDetailSheet';

const STATUS_LABEL: Record<StaffMonthDayKind, string> = {
  open: 'Pågår',
  approved: 'Godkänd',
  review_required: 'Behöver granskning',
  closed: 'Klar',
  missing: 'Saknar tid',
  off: 'Ledig',
  locked: 'Låst',
};

const STATUS_TONE: Record<StaffMonthDayKind, string> = {
  open: 'bg-primary/10 text-primary border-primary/20',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  closed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  review_required: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  missing: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  off: 'bg-muted text-muted-foreground border-border',
  locked: 'bg-muted text-muted-foreground border-border',
};

const STATUS_ICON: Record<StaffMonthDayKind, React.ComponentType<{ className?: string }>> = {
  open: Loader2,
  approved: Lock,
  closed: Check,
  review_required: AlertTriangle,
  missing: AlertTriangle,
  off: MoonStar,
  locked: Lock,
};

export const TimeCalendarTab = () => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { status, isLoading, error } = useStaffMonthStatus(month);

  const monthLabel = format(month, 'MMMM yyyy', { locale: sv });
  const isCurrentMonth = isSameMonth(month, new Date());

  const visibleDays = useMemo(() => {
    if (!status) return [];
    // Show most recent first; user scans from today downward.
    return [...status.days].sort((a, b) => b.date.localeCompare(a.date));
  }, [status]);

  return (
    <div className="space-y-3">
      {/* Month picker */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center active:scale-95"
          aria-label="Föregående månad"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-extrabold text-foreground capitalize">{monthLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setMonth(startOfMonth(new Date()))}
          disabled={isCurrentMonth}
          className={cn(
            'h-10 px-3 rounded-xl border border-border bg-card text-xs font-semibold active:scale-95',
            isCurrentMonth && 'opacity-50',
          )}
        >
          Idag
        </button>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center active:scale-95"
          aria-label="Nästa månad"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Month summary */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Månadssummering
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <SummaryCell
            icon={<Sun className="w-3 h-3" />}
            label="Totalt"
            value={formatHoursMinutes((status?.totals.workdayMinutes ?? 0) / 60)}
            strong
          />
          <SummaryCell
            icon={<Check className="w-3 h-3" />}
            label="Godkänt"
            value={formatHoursMinutes((status?.totals.approvedMinutes ?? 0) / 60)}
          />
          <SummaryCell
            icon={<Clock className="w-3 h-3" />}
            label="Väntar"
            value={formatHoursMinutes((status?.totals.pendingReviewMinutes ?? 0) / 60)}
          />
          <SummaryCell
            icon={<AlertTriangle className="w-3 h-3" />}
            label="Frågor"
            value={`${status?.totals.daysWithFlags ?? 0} dagar`}
            tone="warning"
          />
        </div>
      </section>

      {/* Day list */}
      {isLoading && !status ? (
        <div className="rounded-2xl border border-border bg-card p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          {visibleDays.map((day) => (
            <DayRow
              key={day.date}
              day={day}
              onClick={() => setSelectedDate(day.date)}
            />
          ))}
        </section>
      )}

      <StaffDayDetailSheet date={selectedDate} onClose={() => setSelectedDate(null)} />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────

const DayRow: React.FC<{ day: StaffMonthDayStatus; onClick: () => void }> = ({ day, onClick }) => {
  const d = parseISO(day.date);
  const dayName = format(d, 'EEE', { locale: sv });
  const dayDate = format(d, 'd MMM', { locale: sv });
  const Icon = STATUS_ICON[day.status];
  const tone = STATUS_TONE[day.status];
  const showHours = day.workdayMinutes > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 active:bg-muted/40 transition-colors text-left"
    >
      <div className="shrink-0 w-12">
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide leading-none">
          {dayName}
        </p>
        <p className="text-sm font-extrabold text-foreground capitalize mt-0.5">
          {dayDate}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        {showHours ? (
          <p className="text-sm font-bold text-foreground tabular-nums">
            {formatHoursMinutes(day.workdayMinutes / 60)}
          </p>
        ) : (
          <p className="text-sm font-semibold text-muted-foreground">
            {day.status === 'off' ? '—' : 'Ingen tid'}
          </p>
        )}
        {day.hasFlags && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3 h-3" /> Har frågor
          </p>
        )}
      </div>
      <span className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
        tone,
      )}>
        <Icon className={cn('w-3 h-3', day.status === 'open' && 'animate-spin')} />
        {STATUS_LABEL[day.status]}
      </span>
    </button>
  );
};

const SummaryCell: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'default' | 'warning';
}> = ({ icon, label, value, strong, tone = 'default' }) => (
  <div className={cn(
    'rounded-xl border border-border px-3 py-2',
    tone === 'warning' ? 'bg-amber-500/5' : 'bg-background/60',
  )}>
    <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {icon}{label}
    </div>
    <div className={cn(
      'font-extrabold tabular-nums mt-0.5',
      strong ? 'text-base text-foreground' : 'text-sm text-foreground/80',
    )}>
      {value}
    </div>
  </div>
);

export default TimeCalendarTab;

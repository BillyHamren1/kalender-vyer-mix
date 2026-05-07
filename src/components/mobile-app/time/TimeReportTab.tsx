/**
 * TimeReportTab — Tidrapport per period.
 *
 * SANNINGSREGEL: backend snapshot från `get-staff-time-report-period` är
 * ENDA källan. UI får inte aggregera, summera eller tolka råtabeller.
 */
import { useMemo, useState } from 'react';
import {
  format, addMonths, subMonths, startOfMonth, parseISO,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle,
  CalendarDays, FileCheck2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStaffTimeReportPeriod } from '@/hooks/useStaffTimeReportPeriod';
import { formatHoursMinutes } from '@/utils/formatHours';
import StaffDayDetailSheet from './StaffDayDetailSheet';

interface PeriodDay {
  date: string;
  status?: string;
  statusLabel?: string;
  workdayMinutes?: number;
  payableMinutes?: number;
  hasFlags?: boolean;
  blockerMessage?: string | null;
}

export const TimeReportTab = () => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { period, isLoading, error, refresh } = useStaffTimeReportPeriod({
    kind: 'month',
    anchor: month,
  });

  const monthLabel = useMemo(
    () => format(month, 'MMMM yyyy', { locale: sv }),
    [month],
  );

  const days = (period?.days ?? []) as unknown as PeriodDay[];
  const visibleDays = useMemo(
    () => [...days].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [days],
  );

  const totals = period?.totals;
  const blockers = period?.blockers ?? [];
  const status = period?.status ?? 'empty';
  const allClear = !isLoading && status === 'approved';

  return (
    <div className="space-y-4">
      {/* Period nav */}
      <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="h-9 px-3 rounded-xl border border-border/60 bg-background flex items-center gap-1 text-xs font-semibold active:scale-95"
            aria-label="Föregående månad"
          >
            <ChevronLeft className="w-4 h-4" /> Föreg.
          </button>
          <button
            type="button"
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="h-9 px-3 rounded-xl border border-border/60 bg-background text-xs font-semibold active:scale-95"
          >
            Denna månad
          </button>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="h-9 px-3 rounded-xl border border-border/60 bg-background flex items-center gap-1 text-xs font-semibold active:scale-95"
            aria-label="Nästa månad"
          >
            Nästa <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-sm font-bold text-foreground capitalize">
          {monthLabel}
        </p>
      </div>

      {/* Period summary */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Periodsummering
        </p>
        <div className="grid grid-cols-2 gap-3">
          <SummaryCell
            label="Brutto"
            value={formatHoursMinutes(((totals as any)?.workdayMinutes ?? totals?.workMinutes ?? 0) / 60)}
            primary
          />
          <SummaryCell
            label="Rast"
            value={formatHoursMinutes(((totals as any)?.breakMinutes ?? 0) / 60)}
          />
          <SummaryCell
            label="Lönegrundande"
            value={formatHoursMinutes(((totals as any)?.payableMinutes ?? totals?.workMinutes ?? 0) / 60)}
          />
          <SummaryCell
            label="Godkänt"
            value={formatHoursMinutes(((totals as any)?.approvedMinutes ?? 0) / 60)}
            tone="emerald"
          />
          <SummaryCell
            label="Väntar attest"
            value={formatHoursMinutes(((totals as any)?.pendingReviewMinutes ?? 0) / 60)}
            tone="amber"
          />
          <SummaryCell
            label="Transport"
            value={formatHoursMinutes((totals?.travelMinutes ?? 0) / 60)}
          />
        </div>
        {blockers.length > 0 && (
          <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {blockers.length} sak{blockers.length === 1 ? '' : 'er'} hindrar attest
          </p>
        )}
      </div>

      {/* Status block */}
      {isLoading && !period ? null : allClear ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              Tidrapporten är klar
            </p>
          </div>
        </div>
      ) : blockers.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
            Tidrapporten behöver kompletteras
          </p>
          <ul className="mt-2 space-y-1">
            {blockers.slice(0, 4).map((b, i) => (
              <li key={i} className="text-[12px] text-foreground/80">
                {b.date && <span className="font-semibold tabular-nums">{b.date}: </span>}
                {b.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Day list */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-1.5">
          <CalendarDays className="w-3 h-3" /> Dagar i perioden
        </h3>

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : isLoading && !period ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleDays.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-5 text-center">
            <p className="text-sm text-muted-foreground">Inga dagar att visa.</p>
          </div>
        ) : (
          visibleDays.map((d) => (
            <DayRow key={d.date} day={d} onOpen={setSelectedDate} />
          ))
        )}
      </div>

      <StaffDayDetailSheet date={selectedDate} onClose={() => setSelectedDate(null)} />
    </div>
  );
};

const DayRow = ({
  day,
  onOpen,
}: {
  day: PeriodDay;
  onOpen: (date: string) => void;
}) => {
  const date = parseISO(day.date);
  const minutes = day.workdayMinutes ?? 0;
  const statusLabel = day.statusLabel ?? day.status ?? '';
  return (
    <button
      type="button"
      onClick={() => onOpen(day.date)}
      className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card active:bg-muted/40"
    >
      <div className="w-10 shrink-0 text-center">
        <p className="text-[10px] uppercase font-bold text-muted-foreground">
          {format(date, 'EEE', { locale: sv })}
        </p>
        <p className="text-base font-extrabold tabular-nums text-foreground leading-none">
          {format(date, 'd')}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold tabular-nums text-foreground">
          {formatHoursMinutes(minutes / 60)}
        </p>
        {day.blockerMessage && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 truncate">
            {day.blockerMessage}
          </p>
        )}
      </div>
      <span className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border',
        'bg-muted text-muted-foreground border-border',
      )}>
        {statusLabel}
      </span>
    </button>
  );
};

const SummaryCell = ({
  label, value, primary, tone,
}: { label: string; value: string; primary?: boolean; tone?: 'emerald' | 'amber' }) => (
  <div className={cn(
    'rounded-xl px-3 py-2.5 border',
    primary && 'bg-primary/5 border-primary/20',
    tone === 'emerald' && 'bg-emerald-500/5 border-emerald-500/20',
    tone === 'amber' && 'bg-amber-500/5 border-amber-500/20',
    !primary && !tone && 'bg-muted/40 border-transparent',
  )}>
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {label}
    </p>
    <p className={cn(
      'text-base font-extrabold tabular-nums mt-0.5',
      primary && 'text-primary',
      tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
      tone === 'amber' && 'text-amber-700 dark:text-amber-400',
      !primary && !tone && 'text-foreground',
    )}>
      {value}
    </p>
  </div>
);

export default TimeReportTab;

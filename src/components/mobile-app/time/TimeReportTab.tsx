/**
 * TimeReportTab — Tidrapport / löneunderlag per period.
 *
 * Backend äger sanningen. `useStaffTimeReportPeriod` är ännu en stub, så
 * tills `get-staff-time-report-period` Edge Function levererar period-
 * snapshot använder vi `useStaffMonthStatus` som datakälla för totaler
 * och dagsrader. UI gör ingen lokal aggregering av råtabeller.
 */
import { useMemo, useState } from 'react';
import {
  format, addMonths, subMonths, startOfMonth, parseISO, isToday, isFuture,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle,
  CalendarDays, RefreshCw, MoonStar, Clock, FileCheck2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStaffMonthStatus,
  type StaffMonthDayStatus,
  type StaffMonthDayKind,
} from '@/hooks/useStaffMonthStatus';
import { useStaffTimeReportPeriod } from '@/hooks/useStaffTimeReportPeriod';
import { formatHoursMinutes } from '@/utils/formatHours';
import StaffDayDetailSheet from './StaffDayDetailSheet';

const STATUS_LABEL: Record<StaffMonthDayKind, string> = {
  open: 'Pågår',
  approved: 'Godkänd',
  closed: 'Klar',
  review_required: 'Behöver granskning',
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

function isReviewKind(k: StaffMonthDayKind) {
  return k === 'review_required' || k === 'missing';
}

function dayBlurb(d: StaffMonthDayStatus): string | null {
  if (d.status === 'review_required') return 'Behöver granskas innan godkännande';
  if (d.status === 'missing') return 'Tid saknas för denna dag';
  if (d.unallocatedMinutes > 0 && !d.approved)
    return `Ej fördelat: ${formatHoursMinutes(d.unallocatedMinutes / 60)}`;
  return null;
}

export const TimeReportTab = () => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { status, isLoading, refresh } = useStaffMonthStatus(month);
  // Forward-compat: when backend lands, totals/status will come from here.
  // Keep the call so the period channel is open and ready.
  useStaffTimeReportPeriod({ kind: 'month', anchor: month });

  const monthLabel = useMemo(
    () => format(month, 'MMMM yyyy', { locale: sv }),
    [month],
  );

  const days = status?.days ?? [];
  const visibleDays = useMemo(
    () =>
      days
        .filter((d) => !isFuture(parseISO(d.date)) || isToday(parseISO(d.date)))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [days],
  );

  const totals = status?.totals ?? {
    workdayMinutes: 0,
    allocatedProjectMinutes: 0,
    travelMinutes: 0,
    unallocatedMinutes: 0,
    approvedMinutes: 0,
    pendingReviewMinutes: 0,
    daysWithFlags: 0,
  };

  const reviewDays = useMemo(
    () => visibleDays.filter((d) => isReviewKind(d.status)),
    [visibleDays],
  );
  const allClear = !isLoading && visibleDays.length > 0 && reviewDays.length === 0;

  return (
    <div className="space-y-4">
      {/* Period nav */}
      <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="h-9 px-3 rounded-xl border border-border/60 bg-background flex items-center gap-1 text-xs font-semibold active:scale-95 transition-all"
            aria-label="Föregående månad"
          >
            <ChevronLeft className="w-4 h-4" /> Föreg.
          </button>
          <button
            type="button"
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="h-9 px-3 rounded-xl border border-border/60 bg-background text-xs font-semibold active:scale-95 transition-all"
          >
            Denna månad
          </button>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="h-9 px-3 rounded-xl border border-border/60 bg-background flex items-center gap-1 text-xs font-semibold active:scale-95 transition-all"
            aria-label="Nästa månad"
          >
            Nästa <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-sm font-bold text-foreground capitalize">
          {monthLabel}
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Sammanfattning
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground active:bg-muted"
            aria-label="Uppdatera"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SummaryCell
            label="Totalt"
            value={formatHoursMinutes(totals.workdayMinutes / 60)}
            primary
          />
          <SummaryCell
            label="Godkänt"
            value={formatHoursMinutes(totals.approvedMinutes / 60)}
            tone="emerald"
          />
          <SummaryCell
            label="Väntar granskning"
            value={formatHoursMinutes(totals.pendingReviewMinutes / 60)}
            tone="amber"
          />
          <SummaryCell
            label="Ej fördelat"
            value={formatHoursMinutes(totals.unallocatedMinutes / 60)}
          />
        </div>
        {totals.daysWithFlags > 0 && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="font-semibold">
              {totals.daysWithFlags}{' '}
              {totals.daysWithFlags === 1 ? 'dag' : 'dagar'} med frågor
            </span>
          </div>
        )}
      </div>

      {/* Status block */}
      {isLoading && !status ? null : allClear ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                Din tidrapport är klar
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Alla dagar är kontrollerade.
              </p>
            </div>
          </div>
        </div>
      ) : reviewDays.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                Din tidrapport behöver åtgärdas
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {reviewDays.length}{' '}
                {reviewDays.length === 1 ? 'dag har' : 'dagar har'} frågor innan
                perioden kan godkännas.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDate(reviewDays[0].date)}
                  className="h-8 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-[12px] font-semibold text-amber-800 dark:text-amber-300 transition-all"
                >
                  Öppna första dagen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('tr-day-list');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="h-8 px-3 rounded-lg border border-border/60 bg-background text-[12px] font-semibold text-foreground transition-all"
                >
                  Visa dagar med frågor
                </button>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="h-8 px-3 rounded-lg border border-border/60 bg-background text-[12px] font-semibold text-foreground transition-all"
                >
                  Uppdatera
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Day list */}
      <div id="tr-day-list" className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-1.5">
          <CalendarDays className="w-3 h-3" /> Dagar i perioden
        </h3>

        {isLoading && !status ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleDays.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-5 text-center">
            <p className="text-sm text-muted-foreground">Inga dagar att visa.</p>
          </div>
        ) : (
          visibleDays.map((d) => <DayRow key={d.date} day={d} onOpen={setSelectedDate} />)
        )}
      </div>

      <StaffDayDetailSheet
        date={selectedDate}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
};

const DayRow = ({
  day,
  onOpen,
}: {
  day: StaffMonthDayStatus;
  onOpen: (date: string) => void;
}) => {
  const date = parseISO(day.date);
  const blurb = dayBlurb(day);
  const isOff = day.status === 'off';
  return (
    <button
      type="button"
      onClick={() => onOpen(day.date)}
      className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card active:bg-muted/40 transition-all"
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
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border',
              STATUS_TONE[day.status],
            )}
          >
            {STATUS_LABEL[day.status]}
          </span>
          {day.hasFlags && (
            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        {blurb && (
          <p className="text-[11px] text-muted-foreground mt-1 truncate">
            {blurb}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        {isOff ? (
          <MoonStar className="w-4 h-4 text-muted-foreground/60 ml-auto" />
        ) : (
          <p className="text-sm font-bold tabular-nums text-foreground">
            {formatHoursMinutes(day.workdayMinutes / 60)}
          </p>
        )}
      </div>
    </button>
  );
};

const SummaryCell = ({
  label,
  value,
  primary,
  tone,
}: {
  label: string;
  value: string;
  primary?: boolean;
  tone?: 'emerald' | 'amber';
}) => (
  <div
    className={cn(
      'rounded-xl px-3 py-2.5 border',
      primary && 'bg-primary/5 border-primary/20',
      tone === 'emerald' && 'bg-emerald-500/5 border-emerald-500/20',
      tone === 'amber' && 'bg-amber-500/5 border-amber-500/20',
      !primary && !tone && 'bg-muted/40 border-transparent',
    )}
  >
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {label}
    </p>
    <p
      className={cn(
        'text-base font-extrabold tabular-nums mt-0.5',
        primary && 'text-primary',
        tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
        tone === 'amber' && 'text-amber-700 dark:text-amber-400',
        !primary && !tone && 'text-foreground',
      )}
    >
      {value}
    </p>
  </div>
);

export default TimeReportTab;

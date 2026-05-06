/**
 * TimeReportTab — periodvy (vecka/månad) driven av `useStaffTimeReportPeriod`.
 *
 * Backend (`get-staff-time-report-period`) äger sanningen. Hooken är en
 * forward-compatible stub tills endpointen levereras — UI gör ingen lokal
 * aggregering. När data finns visar vi totaler + rader; tills dess en
 * neutral placeholder.
 */
import { useMemo, useState } from 'react';
import {
  format,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStaffTimeReportPeriod,
  type StaffPeriodKind,
} from '@/hooks/useStaffTimeReportPeriod';
import { formatHoursMinutes } from '@/utils/formatHours';

export const TimeReportTab = () => {
  const [kind, setKind] = useState<StaffPeriodKind>('week');
  const [anchor, setAnchor] = useState(new Date());
  const { period, isLoading } = useStaffTimeReportPeriod({ kind, anchor });

  const periodLabel = useMemo(() => {
    if (kind === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      return `${format(s, 'd MMM', { locale: sv })} – ${format(e, 'd MMM yyyy', { locale: sv })}`;
    }
    return format(startOfMonth(anchor), 'MMMM yyyy', { locale: sv });
  }, [kind, anchor]);

  const navigatePeriod = (dir: 1 | -1) => {
    setAnchor((a) =>
      kind === 'week'
        ? dir === 1
          ? addWeeks(a, 1)
          : subWeeks(a, 1)
        : dir === 1
          ? addMonths(a, 1)
          : subMonths(a, 1),
    );
  };

  const totals = period?.totals ?? {
    workMinutes: 0,
    overtimeMinutes: 0,
    travelMinutes: 0,
    unallocatedMinutes: 0,
  };

  return (
    <div className="space-y-4">
      {/* Period kind switch */}
      <div
        role="tablist"
        aria-label="Period"
        className="flex items-stretch gap-1 rounded-xl bg-muted/50 p-1 border border-border/50"
      >
        {(['week', 'month'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'flex-1 h-9 rounded-lg text-xs font-semibold transition-all',
              kind === k
                ? 'bg-card text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground active:text-foreground',
            )}
          >
            {k === 'week' ? 'Vecka' : 'Månad'}
          </button>
        ))}
      </div>

      {/* Period nav */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigatePeriod(-1)}
          className="h-9 w-9 rounded-xl border border-border/60 bg-card flex items-center justify-center active:scale-95 transition-all"
          aria-label="Föregående period"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="flex-1 text-center text-sm font-bold text-foreground capitalize">
          {periodLabel}
        </p>
        <button
          type="button"
          onClick={() => navigatePeriod(1)}
          className="h-9 w-9 rounded-xl border border-border/60 bg-card flex items-center justify-center active:scale-95 transition-all"
          aria-label="Nästa period"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Totals card */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Summering
          </span>
          {period?.status === 'approved' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3" />
              Godkänd
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SummaryCell label="Arbetstid" minutes={totals.workMinutes} primary />
          <SummaryCell label="Övertid" minutes={totals.overtimeMinutes} />
          <SummaryCell label="Resa" minutes={totals.travelMinutes} />
          <SummaryCell label="Ej fördelat" minutes={totals.unallocatedMinutes} />
        </div>
      </div>

      {/* Rows list */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
          Rapporterade rader
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !period || period.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-5 text-center">
            <FileText className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Inga rader för perioden ännu.
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              Periodsanningen kommer från servern så snart backend-snapshot är aktiverad.
            </p>
          </div>
        ) : (
          period.rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {row.jobLabel}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {format(new Date(row.date), 'd MMM', { locale: sv })}
                  {row.startedAt && row.endedAt
                    ? ` · ${row.startedAt.slice(11, 16)}–${row.endedAt.slice(11, 16)}`
                    : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums text-foreground">
                  {formatHoursMinutes(row.hoursWorked)}
                </p>
                {row.approved && (
                  <Check className="w-3.5 h-3.5 text-primary inline-block" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const SummaryCell = ({
  label,
  minutes,
  primary,
}: {
  label: string;
  minutes: number;
  primary?: boolean;
}) => (
  <div
    className={cn(
      'rounded-xl px-3 py-2.5',
      primary ? 'bg-primary/5 border border-primary/20' : 'bg-muted/40',
    )}
  >
    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {label}
    </p>
    <p
      className={cn(
        'text-base font-extrabold tabular-nums mt-0.5',
        primary ? 'text-primary' : 'text-foreground',
      )}
    >
      {formatHoursMinutes(minutes / 60)}
    </p>
  </div>
);

export default TimeReportTab;

import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { StaffPeriodDaySummary } from '@/hooks/useStaffTimeReportPeriod';
import { formatHoursMinutes } from '@/utils/formatHours';

const STATUS_LABEL: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'Ingen tid',
  open: 'Arbetsdag pågår',
  needs_attest: 'Redo att godkänna',
  needs_action: 'Behöver åtgärdas',
  attested: 'Inskickad',
  approved: 'Godkänd',
};

const STATUS_TONE: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'bg-muted text-muted-foreground border-border',
  open: 'bg-primary/10 text-primary border-primary/20',
  needs_attest: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  needs_action: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  attested: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
};

interface Props {
  days: StaffPeriodDaySummary[];
  onOpen: (date: string) => void;
  /** Sort newest first by default; set false to keep period chronology. */
  newestFirst?: boolean;
}

/**
 * UserDayList — premium per-day list for the period (Vecka/Månad).
 * All data is canonical from `get-staff-time-report-period`. Never aggregates.
 */
export const UserDayList = ({ days, onOpen, newestFirst = true }: Props) => {
  const ordered = [...days].sort((a, b) =>
    newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
  );

  if (ordered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-5 text-center">
        <p className="text-sm text-muted-foreground">Inga dagar att visa.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/60">
      {ordered.map((d) => (
        <DayRow key={d.date} day={d} onOpen={onOpen} />
      ))}
    </div>
  );
};

const DayRow = ({
  day,
  onOpen,
}: {
  day: StaffPeriodDaySummary;
  onOpen: (date: string) => void;
}) => {
  const date = parseISO(day.date);
  const minutes = day.grossWorkdayMinutes ?? 0;
  const breakMinutes = day.breakMinutes ?? 0;
  const payable = day.payableMinutes ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(day.date)}
      className="w-full text-left flex items-center gap-3 px-3 py-3 active:bg-muted/40 transition-colors"
    >
      <div className="w-12 shrink-0 text-center">
        <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">
          {format(date, 'EEE', { locale: sv })}
        </p>
        <p className="text-lg font-extrabold tabular-nums text-foreground leading-none mt-1">
          {format(date, 'd')}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {format(date, 'MMM', { locale: sv })}
        </p>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-extrabold tabular-nums text-foreground">
            {formatHoursMinutes(minutes / 60)}
          </p>
          <p className="text-[11px] text-muted-foreground">brutto</p>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {formatHoursMinutes(payable / 60)}
            </span>{' '}
            lön
          </span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {formatHoursMinutes(breakMinutes / 60)}
            </span>{' '}
            rast
          </span>
        </div>
      </div>

      <span className={cn(
        'inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold border whitespace-nowrap',
        STATUS_TONE[day.status],
      )}>
        {STATUS_LABEL[day.status]}
      </span>
    </button>
  );
};

export default UserDayList;

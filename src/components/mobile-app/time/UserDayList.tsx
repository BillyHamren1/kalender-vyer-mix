import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StaffPeriodDaySummary } from '@/hooks/useStaffTimeReportPeriod';
import { formatHoursMinutes } from '@/utils/formatHours';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';

// TIME-vyn pratar bara om rapporteringsläge — aldrig admin-godkännande.
// Backend-status mappas till tre etiketter: Ej rapporterad / Utkast / Inskickad.
// (open = pågående arbetsdag visas som "Pågår" tills användaren avslutar.)
const STATUS_LABEL: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'Ej rapporterad',
  open: 'Pågår',
  needs_attest: 'Utkast',
  needs_action: 'Utkast',
  attested: 'Inskickad',
  approved: 'Inskickad',
};

const STATUS_CTA: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'Rapportera tid',
  open: 'Avsluta dagen',
  needs_attest: 'Skicka in',
  needs_action: 'Skicka in',
  attested: 'Inskickad',
  approved: 'Inskickad',
};

const STATUS_TONE: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'bg-muted text-muted-foreground border-border',
  open: 'bg-primary/10 text-primary border-primary/20',
  needs_attest: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  needs_action: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  attested: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
};

const NEEDS_ATTENTION = new Set<StaffPeriodDaySummary['status']>([
  'needs_action',
  'needs_attest',
]);

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
  const breakMinutes = day.breakMinutes ?? 0;
  const isEmpty = day.status === 'empty';

  // Wallclock start/slut kommer nu kanoniskt från backend (toDaySummary)
  // med samma prioritetskedja som "Justera dagen"-dialogen
  // (attestation.requestedStart/End → workday.started/ended → första/sista segment).
  // ÄLDRE backend kan sakna fälten — då faller vi tillbaka till grossWorkdayMinutes.
  const startedAt = day.workdayStartedAt ?? null;
  const endedAt = day.workdayEndedAt ?? null;
  const showRange = !!startedAt && !!endedAt;

  // "Total tid" = wallclock end − start när vi har båda. Annars
  // grossWorkdayMinutes. Detta säkerställer att listraden visar SAMMA tid
  // som dialogen — annars uppstår "ORIMLIG" inkonsekvens (rapporterat bug).
  const minutes = showRange
    ? Math.max(0, Math.round((new Date(endedAt!).getTime() - new Date(startedAt!).getTime()) / 60000))
    : (day.grossWorkdayMinutes ?? 0);

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
        {isEmpty ? (
          <>
            <p className="text-sm font-extrabold text-foreground">Rapportera tid</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tryck för att fylla i start, slut och rast.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-extrabold tabular-nums text-foreground">
                {formatHoursMinutes(minutes / 60)}
              </p>
              <p className="text-[11px] text-muted-foreground">total tid</p>
              {showRange && (
                <p className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                  {formatStockholmHm(startedAt!)}–{formatStockholmHm(endedAt!)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatHoursMinutes(breakMinutes / 60)}
                </span>{' '}
                rast
              </span>
              <span className="text-foreground/70 font-semibold ml-auto inline-flex items-center gap-0.5">
                {STATUS_CTA[day.status]}
                <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </>
        )}
      </div>

      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border whitespace-nowrap',
        STATUS_TONE[day.status],
      )}>
        {NEEDS_ATTENTION.has(day.status) && <AlertTriangle className="w-3 h-3" />}
        {STATUS_LABEL[day.status]}
      </span>
    </button>
  );
};

export default UserDayList;


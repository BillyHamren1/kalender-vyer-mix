import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, ChevronRight, Map as MapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StaffPeriodDaySummary } from '@/hooks/useStaffTimeReportPeriod';
import { formatHoursMinutes } from '@/utils/formatHours';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import DayMiniMapDialog from './DayMiniMapDialog';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

// TIME-vyn pratar bara om rapporteringsläge — aldrig admin-godkännande.
const STATUS_LABEL: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'Ej rapporterad',
  open: 'Pågår',
  draft: 'Utkast',
  submitted: 'Inskickad',
};

const STATUS_CTA: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'Rapportera tid',
  open: 'Avsluta dagen',
  draft: 'Skicka in',
  submitted: 'Inskickad',
};

const STATUS_TONE: Record<StaffPeriodDaySummary['status'], string> = {
  empty: 'bg-muted text-muted-foreground border-border',
  open: 'bg-primary/10 text-primary border-primary/20',
  draft: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  submitted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
};

const NEEDS_ATTENTION = new Set<StaffPeriodDaySummary['status']>(['draft']);

function fmtDur(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Props {
  days: StaffPeriodDaySummary[];
  onOpen: (date: string) => void;
  /** Sort newest first by default; set false to keep period chronology. */
  newestFirst?: boolean;
}

/**
 * UserDayList — premium per-day list for the period (Vecka/Månad).
 * Visar nu samma per-projekt breakdown + miniature kartknapp som
 * GPS-karta-veckopanelen i admin (StaffGpsDayRow). Data kommer
 * 100% från `get-mobile-staff-time-report-period` (snapshot-only).
 */
export const UserDayList = ({ days, onOpen, newestFirst = false }: Props) => {
  const [mapDate, setMapDate] = useState<string | null>(null);
  const { effectiveStaffId } = useMobileAuth();

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
    <>
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/60">
        {ordered.map((d) => (
          <DayRow
            key={d.date}
            day={d}
            onOpen={onOpen}
            onOpenMap={() => setMapDate(d.date)}
          />
        ))}
      </div>
      <DayMiniMapDialog
        date={mapDate}
        staffId={effectiveStaffId}
        onClose={() => setMapDate(null)}
      />
    </>
  );
};

const DayRow = ({
  day,
  onOpen,
  onOpenMap,
}: {
  day: StaffPeriodDaySummary;
  onOpen: (date: string) => void;
  onOpenMap: () => void;
}) => {
  const date = parseISO(day.date);
  const breakMinutes = day.breakMinutes ?? 0;
  const isEmpty = day.status === 'empty';

  const startedAt = day.workdayStartedAt ?? null;
  const endedAt = day.workdayEndedAt ?? null;
  const showRange = !!startedAt && !!endedAt;

  const minutes = showRange
    ? Math.max(
        0,
        Math.round((new Date(endedAt!).getTime() - new Date(startedAt!).getTime()) / 60000),
      )
    : (day.grossWorkdayMinutes ?? 0);

  const places = day.places ?? [];
  const hasData = !isEmpty;

  return (
    <div className="w-full">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onOpen(day.date)}
          className="flex-1 min-w-0 text-left flex items-start gap-3 px-3 py-3 active:bg-muted/40 transition-colors"
        >
          <div className="w-12 shrink-0 text-center pt-0.5">
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
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm font-extrabold tabular-nums text-foreground">
                    {formatHoursMinutes(minutes / 60)}
                  </p>
                  {showRange && (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {formatStockholmHm(startedAt!)}–{formatStockholmHm(endedAt!)}
                    </p>
                  )}
                </div>

                {places.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {places.map((p) => (
                      <li
                        key={`${p.kind}::${p.name}`}
                        className="flex items-baseline justify-between gap-3 text-[12px] leading-snug"
                      >
                        <span className="flex items-baseline gap-1.5 min-w-0">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0 translate-y-[-2px]" />
                          <span className="truncate text-foreground/85">{p.name}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground shrink-0">
                          {fmtDur(p.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
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

          <span
            className={cn(
              'self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border whitespace-nowrap mt-0.5',
              STATUS_TONE[day.status],
            )}
          >
            {NEEDS_ATTENTION.has(day.status) && <AlertTriangle className="w-3 h-3" />}
            {STATUS_LABEL[day.status]}
          </span>
        </button>

        {hasData && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenMap();
            }}
            aria-label="Visa karta"
            title="Visa karta"
            className="shrink-0 w-11 flex items-center justify-center border-l border-border/60 text-muted-foreground hover:text-primary active:bg-muted/40 transition-colors"
          >
            <MapIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default UserDayList;

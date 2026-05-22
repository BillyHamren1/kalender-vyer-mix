/**
 * TimeReportTab — Tidrapport per period (Dag / Vecka / Månad).
 *
 * Mobile day report source (PURE MIRROR of /staff-management/time-reports):
 *   get-mobile-staff-day-report
 *     → staff_day_report_cache
 *     → staff_day_submissions
 *
 * Vecka/månad: get-staff-time-report-period (kvarvarande legacy — ska
 * portas till samma cache-källa). UI får inte aggregera, summera eller
 * tolka råtabeller (workdays/time_reports/LTE/travel/day_attestations).
 */
import { useMemo, useState } from 'react';
import {
  format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Loader2, CalendarDays,
} from 'lucide-react';
import { useStaffTimeReportPeriod } from '@/hooks/useStaffTimeReportPeriod';
import { useStaffDayStatusViaMobileReport } from '@/hooks/useStaffDayStatusViaMobileReport';
import { useStaffGpsWeekSuggestion } from '@/hooks/useStaffGpsWeekSuggestion';
import StaffDayDetailSheet from './StaffDayDetailSheet';
import PeriodSwitcher, { type PeriodKind } from './PeriodSwitcher';
import UserTimeSummaryCards from './UserTimeSummaryCards';
import UserDayList from './UserDayList';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

export const TimeReportTab = () => {
  // Default: veckovy som speglar admin-GPS-veckopanelen.
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PeriodSwitcher value={kind} onChange={(v) => { setKind(v); setAnchor(new Date()); }} />

      <PeriodNav
        kind={kind}
        anchor={anchor}
        onPrev={() => setAnchor((a) =>
          kind === 'day' ? subDays(a, 1) : kind === 'week' ? subWeeks(a, 1) : subMonths(a, 1),
        )}
        onNext={() => setAnchor((a) =>
          kind === 'day' ? addDays(a, 1) : kind === 'week' ? addWeeks(a, 1) : addMonths(a, 1),
        )}
        onToday={() => setAnchor(new Date())}
      />

      {kind === 'day' ? (
        <DayView
          date={format(anchor, 'yyyy-MM-dd')}
          onOpen={setSelectedDate}
        />
      ) : (
        <PeriodView
          kind={kind}
          anchor={anchor}
          onOpen={setSelectedDate}
        />
      )}

      <StaffDayDetailSheet date={selectedDate} onClose={() => setSelectedDate(null)} />
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────

const PeriodNav = ({
  kind, anchor, onPrev, onNext, onToday,
}: {
  kind: PeriodKind;
  anchor: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) => {
  const label = useMemo(() => {
    if (kind === 'day') return format(anchor, 'EEEE d MMM yyyy', { locale: sv });
    if (kind === 'week') {
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      const end = endOfWeek(anchor, { weekStartsOn: 1 });
      const wk = format(start, 'I', { locale: sv });
      return `Vecka ${wk} · ${format(start, 'd', { locale: sv })}–${format(end, 'd MMM', { locale: sv })}`;
    }
    return format(anchor, 'MMMM yyyy', { locale: sv });
  }, [kind, anchor]);

  const todayLabel = kind === 'day' ? 'Idag' : kind === 'week' ? 'Denna vecka' : 'Denna månad';

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="h-9 px-3 rounded-xl border border-border/60 bg-background flex items-center gap-1 text-xs font-semibold active:scale-95"
          aria-label="Föregående"
        >
          <ChevronLeft className="w-4 h-4" /> Föreg.
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-9 px-3 rounded-xl border border-border/60 bg-background text-xs font-semibold active:scale-95"
        >
          {todayLabel}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="h-9 px-3 rounded-xl border border-border/60 bg-background flex items-center gap-1 text-xs font-semibold active:scale-95"
          aria-label="Nästa"
        >
          Nästa <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-sm font-bold text-foreground capitalize">
        {label}
      </p>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────

const DayView = ({ date, onOpen }: { date: string; onOpen: (d: string) => void }) => {
  const { snapshot, isLoading, error } = useStaffDayStatusViaMobileReport(date);
  const totals = snapshot?.totals;

  const figures = useMemo(() => {
    // TIME-vyn visar ENDAST registrerade summor — inget
    // payable/approved/awaiting. Lönegrundande hanteras i admin.
    const gross = totals?.grossWorkdayMinutes ?? totals?.workdayMinutes ?? 0;
    const breaks = totals?.breakMinutes ?? 0;
    const transport = totals?.transportMinutes ?? totals?.travelMinutes ?? 0;
    return {
      grossWorkdayMinutes: gross,
      breakMinutes: breaks,
      transportMinutes: transport,
    };
  }, [totals]);

  return (
    <div className="space-y-4">
      <UserTimeSummaryCards totals={figures} />

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : isLoading && !snapshot ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(date)}
          className="w-full rounded-2xl border border-border/60 bg-card p-4 text-left active:bg-muted/40 transition-colors"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
            Dagdetalj
          </p>
          <p className="text-sm font-bold text-foreground">
            {snapshot?.workday ? 'Dagen är registrerad' : 'Ingen registrerad tid'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Tryck för att granska tidslinjen och rapportera dagen.
          </p>
        </button>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────

const PeriodView = ({
  kind, anchor, onOpen,
}: { kind: 'week' | 'month'; anchor: Date; onOpen: (d: string) => void }) => {
  const { period, isLoading, error } = useStaffTimeReportPeriod({ kind, anchor });
  const totals = period?.totals;

  const figures = {
    grossWorkdayMinutes: totals?.grossWorkdayMinutes ?? 0,
    breakMinutes: totals?.breakMinutes ?? 0,
    transportMinutes: totals?.transportMinutes ?? 0,
  };

  return (
    <div className="space-y-4">
      <UserTimeSummaryCards
        totals={figures}
        remainingActions={totals?.daysWithActions}
      />

      {totals && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground px-1">
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {totals.daysWithWork}
            </span>{' '}
            dagar med arbete
          </span>
          {totals.daysWithActions > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              <span className="font-semibold tabular-nums">{totals.daysWithActions}</span>{' '}
              dagar med frågor
            </span>
          )}
        </div>
      )}

      {/* Tidigare "Tidrapporten är klar" / "behöver kompletteras"-block
          (approved/blockers) borttaget — TIME-vyn pratar inte om attest. */}

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
        ) : (
          <UserDayList days={period?.days ?? []} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
};

export default TimeReportTab;

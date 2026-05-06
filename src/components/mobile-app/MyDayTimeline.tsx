/**
 * MyDayTimeline — användarens egna "min dag" som huvudvy i tidrapporten.
 *
 * BESLUT (2026-05-06): Profilens tidrapport ska INTE visa time_report-rader
 * som huvudvy. Den ska visa samma tolkade dag som admin ser:
 *
 *   ARBETSDAG
 *   07:34 → pågår   Totalt 8h 42m
 *
 *   FÖRDELNING
 *   07:34–08:41  Lager
 *   08:41–09:00  Resa
 *   09:00–pågår  Tiomila 2026
 *
 *   SUMMERING
 *   Arbetsdag · Projekt · Resa · Ej fördelat
 *
 *   Status: Pågår / Redo / Behöver kollas / Godkänd
 *
 * Bygger på samma kanoniska StaffDayTimeline som admin via
 * buildStaffDayTimelineFromRaw — råa time_reports/travel_logs/workday
 * skickas in, men renderas aldrig som rådatarader här.
 */
import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Sun, Briefcase, Car, MapPin, AlertTriangle, Check, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractUTCTime } from '@/utils/dateUtils';
import { formatHoursMinutes } from '@/utils/formatHours';
import {
  buildStaffDayTimelineFromRaw,
  type BuilderTimeReportInput,
  type BuilderTravelLogInput,
  type BuilderWorkdayInput,
} from '@/lib/time/StaffDayTimelineBuilder';
import type {
  StaffDaySegment,
  StaffDaySegmentKind,
  StaffDayStatus,
} from '@/lib/staff/staffDayTimeline';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import {
  useMobileTimeReports,
  useMobileTravelLogs,
  useMobileWorkdays,
} from '@/hooks/useMobileData';

// ── Status presentation ──────────────────────────────────────────────

const STATUS_LABEL: Record<StaffDayStatus, string> = {
  no_workday: 'Ingen arbetsdag',
  open: 'Pågår',
  closed: 'Redo',
  review_required: 'Behöver kollas',
};

const STATUS_TONE: Record<StaffDayStatus, string> = {
  no_workday: 'bg-muted text-muted-foreground border-border',
  open: 'bg-primary/10 text-primary border-primary/20',
  closed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
  review_required: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
};

const STATUS_ICON: Record<StaffDayStatus, React.ComponentType<{ className?: string }>> = {
  no_workday: Clock,
  open: Loader2,
  closed: Check,
  review_required: AlertTriangle,
};

// ── Segment row ───────────────────────────────────────────────────────

const SEGMENT_ICON: Record<StaffDaySegmentKind, React.ComponentType<{ className?: string }>> = {
  project: Briefcase,
  warehouse: MapPin,
  travel: Car,
  break: Clock,
  other: Clock,
  unknown: AlertTriangle,
};

const SEGMENT_TONE: Record<StaffDaySegmentKind, string> = {
  project: 'bg-primary/10 text-primary',
  warehouse: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  travel: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  break: 'bg-muted text-muted-foreground',
  other: 'bg-muted text-muted-foreground',
  unknown: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const segmentTimeRange = (s: StaffDaySegment): string => {
  const start = extractUTCTime(s.startIso);
  if (s.ongoing) return `${start}–pågår`;
  if (!s.endIso) return start;
  return `${start}–${extractUTCTime(s.endIso)}`;
};

// ── Main component ────────────────────────────────────────────────────

interface Props {
  /** YYYY-MM-DD. Defaultar idag. */
  date?: string;
}

export const MyDayTimeline: React.FC<Props> = ({ date }) => {
  const { staff } = useMobileAuth();
  const { data: timeReports = [], isLoading: trLoading } = useMobileTimeReports();
  const { data: travelLogs = [], isLoading: tlLoading } = useMobileTravelLogs();
  const { data: workdays = [], isLoading: wdLoading } = useMobileWorkdays(7);

  const dayKey = date ?? format(new Date(), 'yyyy-MM-dd');

  const timeline = useMemo(() => {
    const workdayRow = workdays.find((w) => (w.day_key || w.started_at?.slice(0, 10)) === dayKey);
    const workday: BuilderWorkdayInput | null = workdayRow
      ? {
          id: workdayRow.id,
          started_at: workdayRow.started_at,
          ended_at: workdayRow.ended_at,
        }
      : null;

    const trInputs: BuilderTimeReportInput[] = timeReports
      .filter((r) => r.report_date === dayKey)
      .map((r) => {
        const isProject = !!r.large_project_id;
        const label = r.large_project_name ?? r.bookings?.client ?? 'Aktivitet';
        return {
          id: r.id,
          start_iso: r.start_time,
          end_iso: r.end_time,
          hours: r.hours_worked,
          label,
          category: isProject ? 'project' : 'project',
          approved: r.approved,
        };
      });

    const tlInputs: BuilderTravelLogInput[] = travelLogs
      .filter((l) => l.report_date === dayKey)
      .map((l) => ({
        id: l.id,
        start_iso: l.start_time,
        end_iso: l.end_time,
        fromAddress: l.from_address,
        toAddress: l.to_address,
        approved: !l.auto_detected, // auto-detected resor är förslag, inte godkända
      }));

    return buildStaffDayTimelineFromRaw({
      staff_id: staff?.id ?? 'me',
      staff_name: staff?.name ?? 'Jag',
      date: dayKey,
      workday,
      timeReports: trInputs,
      travelLogs: tlInputs,
    });
  }, [staff, timeReports, travelLogs, workdays, dayKey]);

  if (trLoading || tlLoading || wdLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Summering
  const projectMin = timeline.segments
    .filter((s) => s.kind === 'project' || s.kind === 'warehouse')
    .reduce((sum, s) => sum + s.durationMin, 0);
  const travelMin = timeline.segments
    .filter((s) => s.kind === 'travel')
    .reduce((sum, s) => sum + s.durationMin, 0);
  const unallocatedMin = timeline.segments
    .filter((s) => s.kind === 'unknown')
    .reduce((sum, s) => sum + s.durationMin, 0);

  // Total arbetsdag = workday-envelopen
  const totalMin = (() => {
    if (!timeline.workday_start) return 0;
    const start = new Date(timeline.workday_start).getTime();
    const end = timeline.workday_end ? new Date(timeline.workday_end).getTime() : Date.now();
    return Math.max(0, Math.round((end - start) / 60_000));
  })();

  const StatusIcon = STATUS_ICON[timeline.status];

  const dateLabel = (() => {
    const d = parseISO(dayKey);
    const today = format(new Date(), 'yyyy-MM-dd');
    if (dayKey === today) return 'Idag';
    return format(d, 'EEE d MMM', { locale: sv });
  })();

  return (
    <div className="space-y-3">
      {/* HEADER — arbetsdag + status */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {dateLabel} · Min dag
            </p>
            <p className="font-extrabold text-base text-foreground mt-1 flex items-center gap-1.5">
              <Sun className="w-4 h-4 text-primary shrink-0" />
              {timeline.workday_start ? (
                <>
                  <span>{extractUTCTime(timeline.workday_start)}</span>
                  <span className="text-muted-foreground mx-0.5">→</span>
                  {timeline.workday_end ? (
                    <span>{extractUTCTime(timeline.workday_end)}</span>
                  ) : (
                    <span className="text-primary">pågår</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground text-sm font-semibold">
                  Ingen arbetsdag
                </span>
              )}
            </p>
            {totalMin > 0 && (
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Totalt{' '}
                <span className="font-bold tabular-nums text-foreground">
                  {formatHoursMinutes(totalMin / 60)}
                </span>
              </p>
            )}
            {timeline.workday_suggested && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                Härledd från GPS/timer — ingen registrerad arbetsdag
              </p>
            )}
          </div>
          <div
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0',
              STATUS_TONE[timeline.status],
            )}
          >
            <StatusIcon
              className={cn('w-3 h-3', timeline.status === 'open' && 'animate-spin')}
            />
            {STATUS_LABEL[timeline.status]}
          </div>
        </div>
      </div>

      {/* FÖRDELNING — segmenten i tidsordning */}
      {timeline.segments.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Fördelning
          </p>
          <div className="space-y-1.5">
            {timeline.segments.map((seg) => {
              const Icon = SEGMENT_ICON[seg.kind];
              return (
                <div
                  key={seg.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2',
                    seg.reviewRequired && 'border-amber-500/30 bg-amber-500/5',
                  )}
                >
                  <div
                    className={cn(
                      'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                      SEGMENT_TONE[seg.kind],
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] tabular-nums font-semibold text-muted-foreground">
                      {segmentTimeRange(seg)}
                    </p>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {seg.label}
                    </p>
                    {seg.subtitle && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {seg.subtitle}
                      </p>
                    )}
                  </div>
                  <div className="text-xs tabular-nums font-bold text-foreground/80 shrink-0">
                    {formatHoursMinutes(seg.durationMin / 60)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUMMERING */}
      {totalMin > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Summering
          </p>
          <div className="grid grid-cols-2 gap-2">
            <SummaryCell label="Arbetsdag" value={formatHoursMinutes(totalMin / 60)} strong />
            <SummaryCell label="Projekt / Lager" value={formatHoursMinutes(projectMin / 60)} />
            <SummaryCell label="Resa" value={formatHoursMinutes(travelMin / 60)} />
            <SummaryCell
              label="Ej fördelat"
              value={formatHoursMinutes(unallocatedMin / 60)}
              hint="ingen varning — bara info"
            />
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCell: React.FC<{
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
}> = ({ label, value, strong, hint }) => (
  <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
    <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {label}
    </div>
    <div
      className={cn(
        'tabular-nums font-extrabold text-sm mt-0.5',
        strong ? 'text-foreground' : 'text-foreground/80',
      )}
    >
      {value}
    </div>
    {hint && <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{hint}</div>}
  </div>
);

export default MyDayTimeline;

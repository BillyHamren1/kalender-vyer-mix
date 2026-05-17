/**
 * TodayTab — IDAG-tabben på Time-sidan.
 *
 * Mobile day report source (PURE MIRROR of /staff-management/time-reports):
 *   get-mobile-staff-day-report
 *     → staff_day_report_cache
 *     → staff_day_submissions
 *
 * MUST NOT use as data source:
 *   - workdays / time_reports / location_time_entries / travel_time_logs
 *   - day_attestations
 *   - get-staff-day-status / useStaffDaySnapshot / useStaffDayStatus
 *   - active_time_registrations (liveness comes from the cache only)
 *
 * Komponenten räknar inte timmar, tolkar inte plats, rast eller transport
 * själv, och bygger inga egna segment.
 *
 * Sektioner:
 *   1. Översta statuskortet  (snapshot.workday + snapshot.totals + trackingPolicy)
 *   2. Just nu-kort           (snapshot.active eller "Arbetsdag pågår")
 *   3. Totaler                (snapshot.totals)
 *   4. Dagens tidslinje       (snapshot.segments)
 *   5. Behöver åtgärdas       (snapshot.actionsNeeded)
 *   6. Primär action          (Starta/Avsluta arbetsdag)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Loader2, ShieldCheck, AlertTriangle, Clock, ArrowRight, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import {
  type StaffDaySnapshot,
  type StaffDaySegment,
} from '@/hooks/useStaffDaySnapshot';
import { useStaffDayStatusViaMobileReport } from '@/hooks/useStaffDayStatusViaMobileReport';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { SEG_ICON, SEG_TONE, SEG_KIND_LABEL, FallbackSegIcon } from './segmentVisuals';
import EndDayButton from './EndDayButton';
import SegmentDetailSheet from './SegmentDetailSheet';
import DisplayTimelineV2Card from './DisplayTimelineV2Card';
import StaffDayRemindersBanner from './StaffDayRemindersBanner';
import { deriveDayStatus, type DayStatusResult } from './dayStatus';

// 1Hz tick so the active timer's elapsed seconds roll forward.
function useTick(intervalMs = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function fmtMinutes(totalMin: number | null | undefined) {
  if (totalMin == null) return '0m';
  return formatHoursMinutes(totalMin / 60);
}

function segmentRange(s: StaffDaySegment) {
  const start = formatStockholmHm(s.startedAt);
  if (s.isActive || !s.endedAt) return `${start}–pågår`;
  return `${start}–${formatStockholmHm(s.endedAt)}`;
}

// ────────────────────────────────────────────────────────────────────
// 1) Översta statuskortet — Arbetsdag
// ────────────────────────────────────────────────────────────────────

const WorkdayStatusCard: React.FC<{
  snapshot: StaffDaySnapshot;
  dayStatus: DayStatusResult;
}> = ({ snapshot, dayStatus }) => {
  const wd = snapshot.workday;
  const isOpen = dayStatus.status === 'active_day';
  useTick(isOpen ? 1000 : 60_000);

  // Backendens statusLabel respekteras BARA när vi är trygga (active/ended).
  // För has_time_not_ended/empty_day använder vi vår egen label så att en
  // backend som t.ex. säger "Arbetsdag avslutad" pga sista segmentet slutade
  // inte läcker igenom UI:t.
  const statusLine =
    dayStatus.status === 'active_day' || dayStatus.status === 'ended_day'
      ? (wd?.statusLabel ?? dayStatus.label)
      : dayStatus.label;

  // Brutto kommer ALLTID från backend. Vid pågående dag tickar vi sekundvis
  // mellan refetch genom att räkna live elapsed från startedAt — men vi
  // skriver inte över backendens värde, vi visar bara "live underminute"
  // baserat på serverns startedAt.
  const liveBruttoMin = useMemo(() => {
    const base = snapshot.totals?.grossWorkdayMinutes ?? snapshot.totals?.workdayMinutes ?? 0;
    if (!isOpen || !wd?.startedAt) return base;
    const elapsed = Math.max(0, (Date.now() - new Date(wd.startedAt).getTime()) / 60_000);
    return Math.max(base, elapsed);
  }, [isOpen, wd?.startedAt, snapshot.totals?.grossWorkdayMinutes, snapshot.totals?.workdayMinutes]);

  const tracking = snapshot.trackingPolicy ?? null;
  const lastSignalLabel = tracking?.lastSignalAt
    ? formatStockholmHm(tracking.lastSignalAt)
    : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Arbetsdag
          </p>
          <p className="font-extrabold text-base text-foreground mt-1 flex items-center gap-1.5">
            <Sun className="w-4 h-4 text-primary shrink-0" />
            {statusLine}
          </p>
          {wd && (
            <p className="text-[12px] text-muted-foreground tabular-nums mt-0.5">
              <span className="font-semibold text-foreground/80">
                {formatStockholmHm(wd.startedAt)}
              </span>{' '}
              →{' '}
              {dayStatus.status === 'ended_day' && wd.endedAt ? (
                <span className="font-semibold text-foreground/80">
                  {formatStockholmHm(wd.endedAt)}
                </span>
              ) : dayStatus.status === 'has_time_not_ended' ? (
                <span className="text-muted-foreground font-semibold">ej inskickad</span>
              ) : (
                <span className="text-primary font-semibold">pågår</span>
              )}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
            Brutto
          </p>
          <p className="font-extrabold text-lg tabular-nums text-foreground">
            {fmtMinutes(liveBruttoMin)}
          </p>
        </div>
      </div>

      {/* Diskret signalstatus — ALDRIG som "glapp"-varning */}
      {lastSignalLabel && (
        <p
          className={cn(
            'text-[11px] flex items-center gap-1 tabular-nums',
            tracking?.isSignalStale
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-muted-foreground',
          )}
        >
          <Clock className="w-3 h-3" />
          Senaste signal {lastSignalLabel}
        </p>
      )}

      {/* GPS debug-pill borttagen — premium = ingen teknisk brus.
          (signalstatus räcker för användaren) */}

    </section>
  );
};

// (ActiveNowCard borttagen 2026-05-11 — aktivt segment renderas nu inline
//  i TimelineSection som "premium active block" med tickande timer.)


// ────────────────────────────────────────────────────────────────────
// 3) Totaler
// ────────────────────────────────────────────────────────────────────

const TotalsCard: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  const t = snapshot.totals;
  const grossMin = t.grossWorkdayMinutes ?? t.workdayMinutes ?? 0;
  const transportMin = t.transportMinutes ?? t.travelMinutes ?? 0;
  const projectMin = (t.projectMinutes ?? t.allocatedProjectMinutes ?? 0) + (t.warehouseMinutes ?? 0);
  const otherMin = t.otherPlaceMinutes ?? 0;
  const breakMin = t.breakMinutes;
  const payableMin = t.payableMinutes ?? grossMin;

  // Sekundära fält visas bara om de har värde > 0 — inget brus.
  const secondary: Array<{ label: string; value: string }> = [];
  if (projectMin > 0) secondary.push({ label: 'Projekt/lager', value: fmtMinutes(projectMin) });
  if (transportMin > 0) secondary.push({ label: 'Transport', value: fmtMinutes(transportMin) });
  if (otherMin > 0) secondary.push({ label: 'Annan plats', value: fmtMinutes(otherMin) });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Totaler idag
      </p>
      <div className="grid grid-cols-3 gap-2">
        <PrimaryStat label="Brutto" value={fmtMinutes(grossMin)} />
        <PrimaryStat
          label="Rast"
          value={breakMin != null ? fmtMinutes(breakMin) : '—'}
          muted={breakMin == null}
        />
        <PrimaryStat label="Lönegrundande" value={fmtMinutes(payableMin)} highlight />
      </div>
      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {secondary.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground tabular-nums"
            >
              <span className="text-foreground/70">{s.label}</span>
              <span className="text-foreground">{s.value}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
};

const PrimaryStat: React.FC<{
  label: string; value: string; highlight?: boolean; muted?: boolean;
}> = ({ label, value, highlight, muted }) => (
  <div
    className={cn(
      'rounded-xl border px-3 py-2.5',
      highlight ? 'bg-primary/5 border-primary/20' : 'bg-background/60 border-border',
      muted && 'bg-muted/20 border-border',
    )}
  >
    <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {label}
    </div>
    <div
      className={cn(
        'font-extrabold text-base tabular-nums mt-0.5',
        highlight ? 'text-primary' : 'text-foreground',
        muted && 'text-muted-foreground',
      )}
    >
      {value}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// 4) Dagens tidslinje — aktiv rad är ett "premium active block"
//    med liten tickande timer. Stoppknapp ligger direkt under sista
//    raden när snapshot.workday.isOpen === true.
// ────────────────────────────────────────────────────────────────────

const ActiveSegmentRow: React.FC<{ seg: StaffDaySegment }> = ({ seg }) => {
  useTick(1000);
  const Icon = SEG_ICON[seg.kind] ?? FallbackSegIcon;
  const tone = SEG_TONE[seg.kind] ?? SEG_TONE.unknown;
  const kindLabel = SEG_KIND_LABEL[seg.kind] ?? '';
  const startedMs = new Date(seg.startedAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;

  return (
    <div className="rounded-xl border-2 border-primary bg-primary/5 px-3 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0 w-9 h-9 rounded-lg flex items-center justify-center relative', tone)}>
          <Icon className="w-4 h-4" />
          <span className="absolute -top-0.5 -right-0.5 flex w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-primary opacity-75 animate-ping" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-primary" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-foreground truncate">
            {seg.label}
          </p>
          <p className="text-[12px] text-muted-foreground tabular-nums">
            Startade <span className="font-semibold text-foreground/80">{formatStockholmHm(seg.startedAt)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className={cn('inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide', tone)}>
              {kindLabel}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/15 text-primary">
              <ShieldCheck className="w-3 h-3" /> Pågår
            </span>
          </div>
        </div>
        <div className="font-mono font-extrabold text-base tabular-nums text-primary shrink-0 pt-0.5">
          {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </div>
      </div>
    </div>
  );
};

const TimelineSection: React.FC<{
  snapshot: StaffDaySnapshot;
  onChanged: () => void;
  onSelectSegment: (seg: StaffDaySegment) => void;
}> = ({ snapshot, onChanged, onSelectSegment }) => {
  const segments = snapshot.segments ?? [];
  const workdayOpen = !!snapshot.workday?.isOpen;

  if (segments.length === 0 && !workdayOpen) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Dagens tidslinje
      </p>

      {segments.length === 0 ? (
        <div className="rounded-xl border-2 border-primary bg-primary/5 px-3 py-3 flex items-center gap-3">
          <span className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Sun className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-foreground">Arbetsdag pågår</p>
            {snapshot.workday?.startedAt && (
              <p className="text-[12px] text-muted-foreground tabular-nums">
                Sedan{' '}
                <span className="font-semibold text-foreground/80">
                  {formatStockholmHm(snapshot.workday.startedAt)}
                </span>
              </p>
            )}
          </div>
          <span className="flex w-2.5 h-2.5">
            <span className="absolute inline-flex w-2.5 h-2.5 rounded-full bg-primary opacity-75 animate-ping" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-primary" />
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {segments.map((seg, idx) => {
            const isActive = !!seg.isActive || !seg.endedAt;
            if (isActive) {
              return (
                <button
                  type="button"
                  key={`${seg.startedAt}-${idx}`}
                  onClick={() => onSelectSegment(seg)}
                  className="w-full text-left active:scale-[0.99] transition-transform"
                >
                  <ActiveSegmentRow seg={seg} />
                </button>
              );
            }
            const Icon = SEG_ICON[seg.kind] ?? FallbackSegIcon;
            const tone = SEG_TONE[seg.kind] ?? SEG_TONE.unknown;
            const kindLabel = SEG_KIND_LABEL[seg.kind] ?? '';
            const statusLabel = seg.statusLabel ?? null;
            return (
              <button
                type="button"
                key={`${seg.startedAt}-${idx}`}
                onClick={() => onSelectSegment(seg)}
                className={cn(
                  'w-full text-left flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 active:bg-muted/50 transition-colors',
                  seg.kind === 'unknown' && 'border-amber-500/30 bg-amber-500/5',
                )}
              >
                <div className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', tone)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] tabular-nums font-semibold text-muted-foreground">
                    {segmentRange(seg)}
                  </p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {seg.label}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    <span className={cn('inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide', tone)}>
                      {kindLabel}
                    </span>
                    {statusLabel && (
                      <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-muted text-muted-foreground">
                        {statusLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs tabular-nums font-bold text-foreground/80 shrink-0 pt-0.5">
                  {fmtMinutes(seg.durationMinutes)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {workdayOpen && (
        <div className="pt-2">
          <EndDayButton workdayOpen onStopped={onChanged} />
        </div>
      )}
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 5) Behöver åtgärdas — RENT från backend (actionsNeeded)
// ────────────────────────────────────────────────────────────────────

const ActionsNeededSection: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  const actions = snapshot.actionsNeeded ?? [];
  if (actions.length === 0) return null;
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> Behöver åtgärdas
      </p>
      {actions.map((a) => (
        <div key={a.id} className="rounded-xl border border-amber-500/30 bg-card p-3">
          <p className="font-bold text-sm text-foreground">{a.title}</p>
          {a.description && (
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {a.description}
            </p>
          )}
        </div>
      ))}
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 6) Primär action
//    - Pågående arbetsdag: stopp finns redan inline under tidslinjen.
//    - Ingen arbetsdag: länk till /m där WorkDayPanel äger startflödet.
// ────────────────────────────────────────────────────────────────────

const PrimaryAction: React.FC<{ snapshot: StaffDaySnapshot | null }> = ({ snapshot }) => {
  const navigate = useNavigate();
  const isOpen = snapshot?.workday?.isOpen ?? false;
  if (isOpen) return null;
  return (
    <Button
      size="lg"
      className="w-full h-12 rounded-2xl text-sm font-bold gap-2"
      onClick={() => navigate('/m')}
    >
      <Play className="w-4 h-4" />
      Starta dag
      <ArrowRight className="w-4 h-4" />
    </Button>
  );
};

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

/**
 * Derived rule: ett pågående arbetsblock = pågående arbetsdag.
 * Om backend-snapshot saknar workday.isOpen men det finns ett aktivt segment
 * (projekt/lager/booking-block som tickar), synthesiserar vi en öppen workday
 * med startedAt = tidigaste aktiva segments startedAt. Detta påverkar bara UI;
 * inga timers skapas i databasen härifrån.
 */
export function deriveEffectiveSnapshot(snapshot: StaffDaySnapshot): StaffDaySnapshot {
  const wd = snapshot.workday;
  if (wd?.isOpen) return snapshot;

  const segments = snapshot.segments ?? [];
  const activeBlocks = segments.filter((s) => {
    if (!s) return false;
    if (s.isActive === true) return true;
    if (!s.endedAt) return true;
    return false;
  });
  if (activeBlocks.length === 0) return snapshot;

  // Bara "riktiga" arbetsblock räknas — inte private/gps_gap/unknown-gap.
  const workish = activeBlocks.filter((s) => {
    const k = s.kind as string;
    return k === 'project' || k === 'warehouse' || k === 'booking'
      || k === 'travel' || k === 'other_place' || k === 'location'
      || k === 'active' || k === 'work' || k === 'activity';
  });
  const pickFrom = workish.length > 0 ? workish : activeBlocks;
  const earliest = pickFrom.reduce<StaffDaySegment | null>((acc, s) => {
    if (!acc) return s;
    return new Date(s.startedAt).getTime() < new Date(acc.startedAt).getTime() ? s : acc;
  }, null);
  if (!earliest) return snapshot;

  return {
    ...snapshot,
    workday: {
      ...(wd ?? {}),
      isOpen: true,
      startedAt: earliest.startedAt,
      endedAt: null,
      statusLabel: wd?.statusLabel ?? 'Arbetsdag pågår',
    } as StaffDaySnapshot['workday'],
  };
}

export const TodayTab: React.FC = () => {
  const { snapshot: rawSnapshot, isLoading, error, refresh } = useStaffDayStatusViaMobileReport();
  const { effectiveStaffId, staff } = useMobileAuth();
  const [selectedSeg, setSelectedSeg] = useState<StaffDaySegment | null>(null);

  const snapshot = useMemo(
    () => (rawSnapshot ? deriveEffectiveSnapshot(rawSnapshot) : null),
    [rawSnapshot],
  );

  if (isLoading && !snapshot) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void refresh()}>
          Försök igen
        </Button>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-3">
      <StaffDayRemindersBanner />
      <WorkdayStatusCard snapshot={snapshot} />
      <TotalsCard snapshot={snapshot} />
      <TimelineSection
        snapshot={snapshot}
        onChanged={() => { void refresh(); }}
        onSelectSegment={setSelectedSeg}
      />
      <ActionsNeededSection snapshot={snapshot} />
      <div className="pt-1">
        <PrimaryAction snapshot={snapshot} />
      </div>

      {/* Lager 4.5 — read-only förhandsvisning av Display Timeline V2.
          Renderar null när V2-data saknas (fallback till befintlig vy). */}
      <DisplayTimelineV2Card date={snapshot.date} />

      <SegmentDetailSheet
        segment={selectedSeg}
        date={snapshot.date}
        staffId={effectiveStaffId ?? null}
        staffName={staff?.name ?? null}
        onClose={() => setSelectedSeg(null)}
      />
    </div>
  );
};

export default TodayTab;

/**
 * TodayTab — IDAG-tabben på Time-sidan.
 *
 * SANNINGSREGEL (hård):
 *   Allt som visas kommer från `useStaffDayStatus()` (server snapshot från
 *   `get-staff-day-status`). Komponenten:
 *     - räknar inte timmar
 *     - tolkar inte plats, rast eller transport själv
 *     - läser inte time_reports / workdays / location_time_entries / pings
 *     - visar inte "Saknar arbetsdag" / "Glapp" / "Okänd plats" om backend
 *       inte explicit har skickat det som segment / flag / actionNeeded.
 *
 * Sektioner enligt spec:
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
  Sun, Loader2, ShieldCheck, AlertTriangle, Clock, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import {
  useStaffDayStatus,
  type StaffDaySnapshot,
  type StaffDaySegment,
} from '@/hooks/useStaffDayStatus';
import { SEG_ICON, SEG_TONE, SEG_KIND_LABEL, FallbackSegIcon } from './segmentVisuals';

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

const WorkdayStatusCard: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  const wd = snapshot.workday;
  const isOpen = !!wd?.isOpen;
  useTick(isOpen ? 1000 : 60_000);

  const statusLine = wd?.statusLabel
    ?? (wd ? (isOpen ? 'Arbetsdag igång' : 'Arbetsdag avslutad') : 'Ingen arbetsdag startad');

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
              {wd.endedAt ? (
                <span className="font-semibold text-foreground/80">
                  {formatStockholmHm(wd.endedAt)}
                </span>
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

      {/* Backend-driven tracking-policy debug pill (mode/reason/expires) */}
      {tracking?.mode && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono uppercase tracking-wide">
            GPS: {tracking.mode}
          </span>
          {typeof tracking.heartbeatMs === 'number' && (
            <span className="font-mono tabular-nums">
              {Math.round(tracking.heartbeatMs / 1000)}s · {tracking.distanceFilter}m
            </span>
          )}
          {tracking.expiresAt && (
            <span className="font-mono tabular-nums">
              t/m {formatStockholmHm(tracking.expiresAt)}
            </span>
          )}
          {tracking.reason && (
            <span className="italic truncate max-w-[160px]">{tracking.reason}</span>
          )}
        </div>
      )}
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 2) Just nu-kort
// ────────────────────────────────────────────────────────────────────

const ActiveNowCard: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  useTick(1000);
  const active = snapshot.active;
  const workdayOpen = !!snapshot.workday?.isOpen;

  if (!active) {
    if (workdayOpen) {
      // Backend säger arbetsdag pågår men ingen aktiv plats är bunden.
      // Visa ENDAST det — inga "okänd plats" / "saknar aktivitet" / "glapp".
      return (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
            Just nu
          </p>
          <p className="text-sm font-bold text-foreground mt-1 flex items-center gap-1.5">
            <Sun className="w-4 h-4 text-primary" />
            Arbetsdag pågår
          </p>
        </section>
      );
    }
    return null;
  }

  const Icon = SEG_ICON[active.kind === 'project' ? 'project'
    : active.kind === 'location' ? 'location'
    : 'booking'];
  const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;

  return (
    <section className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
            Just nu
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
              <Icon className="w-4 h-4" />
            </span>
            <p className="font-extrabold text-base text-foreground truncate">
              {active.label}
            </p>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Sedan{' '}
            <span className="tabular-nums font-semibold text-foreground/80">
              {formatStockholmHm(active.startedAt)}
            </span>
          </p>
        </div>
        <div className="font-mono font-extrabold text-lg tabular-nums text-primary shrink-0">
          {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </div>
      </div>

      {/* Status från backend — ingen lokal tolkning */}
      {active.statusLabel && (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          {active.statusLabel}
        </div>
      )}
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 3) Totaler
// ────────────────────────────────────────────────────────────────────

const TotalsCard: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  const t = snapshot.totals;
  // Visa bara fält som backend faktiskt skickat värde för (>0 eller satt).
  const grossMin = t.grossWorkdayMinutes ?? t.workdayMinutes ?? 0;
  const transportMin = t.transportMinutes ?? t.travelMinutes ?? 0;
  const projectMin = (t.projectMinutes ?? t.allocatedProjectMinutes ?? 0) + (t.warehouseMinutes ?? 0);
  const rows: Array<{ label: string; value: string; muted?: boolean; strong?: boolean }> = [
    { label: 'Brutto', value: fmtMinutes(grossMin), strong: true },
    { label: 'Rast', value: t.breakMinutes != null
        ? fmtMinutes(t.breakMinutes)
        : 'ej angiven', muted: t.breakMinutes == null },
    { label: 'Lönegrundande', value: fmtMinutes(t.payableMinutes ?? grossMin), strong: true },
    { label: 'Projekt/lager', value: fmtMinutes(projectMin) },
    { label: 'Transport', value: fmtMinutes(transportMin) },
    { label: 'Annan plats', value: fmtMinutes(t.otherPlaceMinutes ?? 0) },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Totaler idag
      </p>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn(
              'rounded-xl border border-border px-3 py-2',
              r.muted ? 'bg-muted/20' : 'bg-background/60',
            )}
          >
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
              {r.label}
            </div>
            <div
              className={cn(
                'font-extrabold text-sm tabular-nums mt-0.5',
                r.muted ? 'text-muted-foreground' : 'text-foreground/80',
                r.strong && 'text-foreground',
              )}
            >
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 4) Dagens tidslinje
// ────────────────────────────────────────────────────────────────────

const TimelineSection: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  if (snapshot.segments.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Dagens tidslinje
      </p>
      <div className="space-y-1.5">
        {snapshot.segments.map((seg, idx) => {
          const Icon = SEG_ICON[seg.kind] ?? FallbackSegIcon;
          const tone = SEG_TONE[seg.kind] ?? SEG_TONE.unknown;
          const kindLabel = SEG_KIND_LABEL[seg.kind] ?? '';
          const statusLabel = seg.statusLabel ?? null;
          return (
            <div
              key={`${seg.startedAt}-${idx}`}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5',
                seg.kind === 'unknown' && 'border-amber-500/30 bg-amber-500/5',
                seg.isActive && 'border-primary/30 bg-primary/5',
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
            </div>
          );
        })}
      </div>
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
// 6) Primär action — länk till WorkDayPanel (enda timer-ytan)
// ────────────────────────────────────────────────────────────────────

/**
 * Single-timer policy: TodayTab styr inte timer själv. Knappen länkar
 * till `/m` där `WorkDayPanel` är monterad och äger start/stopp av
 * arbetsdagen.
 */
const PrimaryAction: React.FC<{ snapshot: StaffDaySnapshot | null }> = ({ snapshot }) => {
  const navigate = useNavigate();
  const isOpen = snapshot?.workday?.isOpen ?? false;
  const label = isOpen ? 'Hantera arbetsdag i översikten' : 'Starta arbetsdag i översikten';
  return (
    <Button
      size="lg"
      variant={isOpen ? 'outline' : 'default'}
      className="w-full h-12 rounded-2xl text-sm font-bold gap-2"
      onClick={() => navigate('/m')}
    >
      {label}
      <ArrowRight className="w-4 h-4" />
    </Button>
  );
};

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

export const TodayTab: React.FC = () => {
  const { snapshot, isLoading, error, refresh } = useStaffDayStatus();

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
      <WorkdayStatusCard snapshot={snapshot} />
      <ActiveNowCard snapshot={snapshot} />
      <TotalsCard snapshot={snapshot} />
      <TimelineSection snapshot={snapshot} />
      <ActionsNeededSection snapshot={snapshot} />
      <div className="pt-1">
        <PrimaryAction snapshot={snapshot} />
      </div>
    </div>
  );
};

export default TodayTab;

/**
 * TodayTab — live-vy + arbetsdagsassistent.
 *
 * Driven 100% from `useStaffDayStatus` (server snapshot). Does NOT consult
 * activeTimers, time_reports rows or workday rows directly. If the snapshot
 * says `active=null`, no live timer is shown — local hardware state is
 * never allowed to override the backend truth.
 *
 * Block order (per spec):
 *   1. Live-statuskort         (snapshot.active)
 *   2. Arbetsdag-kort          (snapshot.workday + snapshot.totals)
 *   3. Behöver din hjälp       (snapshot.flags + unknown segments)
 *   4. Dagens tidslinje        (snapshot.segments)
 *   5. Primär action           (Starta/Avsluta arbetsdag)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Sun, Briefcase, Building2, MapPin, Car, Clock, AlertTriangle, Check,
  Loader2, Square, Play, HelpCircle, ChevronRight, ShieldCheck, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { extractUTCTime } from '@/utils/dateUtils';
import { formatHoursMinutes } from '@/utils/formatHours';
import { toast } from 'sonner';
import {
  useStaffDayStatus,
  type StaffDaySnapshot,
  type StaffDayActive,
  type StaffDaySegment,
  type StaffDayFlag,
} from '@/hooks/useStaffDayStatus';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useGeofencingContextOptional } from '@/contexts/GeofencingContext';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { mobileApi } from '@/services/mobileApiService';
import StartDayDialog, { type StartDaySelection } from '../StartDayDialog';
import { useNavigate } from 'react-router-dom';

// 1Hz tick so the active timer's elapsed seconds roll forward.
function useTick(intervalMs = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

// ────────────────────────────────────────────────────────────────────
// Helpers — purely presentational, no aggregation
// ────────────────────────────────────────────────────────────────────

const SEG_ICON: Record<StaffDaySegment['kind'], React.ComponentType<{ className?: string }>> = {
  project: Briefcase,
  booking: Briefcase,
  location: Building2,
  travel: Car,
  unknown: AlertTriangle,
  active: Sun,
};

const SEG_TONE: Record<StaffDaySegment['kind'], string> = {
  project: 'bg-primary/10 text-primary',
  booking: 'bg-primary/10 text-primary',
  location: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  travel: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  unknown: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  active: 'bg-primary/10 text-primary',
};

const ACTIVE_ICON = (a: StaffDayActive) => {
  if (a.kind === 'project') return Briefcase;
  if (a.kind === 'location') return Building2;
  return Briefcase;
};

/** Confidence label from snapshot source string. */
function activeConfidence(active: StaffDayActive, snapshot: StaffDaySnapshot | null) {
  // Find the matching segment to read its source (geofence, manual, etc).
  const seg = snapshot?.segments.find((s) =>
    s.refs.locationEntryId === active.locationEntryId
  );
  const source = seg?.source ?? 'location_entry';

  if (source.includes('geofence')) {
    return { label: 'GPS bekräftad', tone: 'text-emerald-700 dark:text-emerald-400', icon: ShieldCheck };
  }
  if (source.includes('manual')) {
    return { label: 'Manuell', tone: 'text-foreground/80', icon: Smartphone };
  }
  if (source.includes('review') || seg?.kind === 'unknown') {
    return { label: 'Behöver granskning', tone: 'text-amber-700 dark:text-amber-400', icon: AlertTriangle };
  }
  return { label: 'Okänd källa', tone: 'text-muted-foreground', icon: HelpCircle };
}

function segmentRange(s: StaffDaySegment) {
  const start = extractUTCTime(s.startedAt);
  if (s.isActive || !s.endedAt) return `${start}–pågår`;
  return `${start}–${extractUTCTime(s.endedAt)}`;
}

function segmentBadge(s: StaffDaySegment): { label: string; tone: string } {
  if (s.kind === 'unknown') {
    return { label: 'Behöver granskning', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' };
  }
  if (s.source.includes('geofence')) {
    return { label: 'GPS bekräftad', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' };
  }
  if (s.kind === 'travel') {
    return { label: 'Resa', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' };
  }
  if (s.kind === 'location') {
    return { label: 'Plats', tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' };
  }
  return { label: 'Projekt', tone: 'bg-primary/10 text-primary' };
}

// ────────────────────────────────────────────────────────────────────
// 1) Live-statuskort
// ────────────────────────────────────────────────────────────────────

const LiveStatusCard: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  useTick(1000);
  const active = snapshot.active;
  if (!active) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Just nu
        </p>
        <p className="text-sm text-foreground mt-1">
          Ingen aktiv tid registreras just nu.
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Välj projekt eller plats i fliken Jobb för att börja registrera tid.
        </p>
      </section>
    );
  }

  const Icon = ACTIVE_ICON(active);
  const conf = activeConfidence(active, snapshot);
  const ConfIcon = conf.icon;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <section className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
            Du jobbar just nu
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn('shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 text-primary')}>
              <Icon className="w-4.5 h-4.5" />
            </span>
            <p className="font-extrabold text-base text-foreground truncate">{active.label}</p>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Sedan <span className="tabular-nums font-semibold text-foreground/80">{extractUTCTime(active.startedAt)}</span>
          </p>
        </div>
        <div className="font-mono font-extrabold text-lg tabular-nums text-primary shrink-0">
          {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </div>
      </div>
      <div className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', conf.tone)}>
        <ConfIcon className="w-3.5 h-3.5" />
        {conf.label}
      </div>
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 2) Arbetsdag-kort
// ────────────────────────────────────────────────────────────────────

const WorkdayCard: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  const wd = snapshot.workday;
  const t = snapshot.totals;
  const isOpen = !!wd?.isOpen;
  // Tick every second while the workday is open so the "Lönegrundande" cell
  // reflects live elapsed time without waiting for the next snapshot refetch.
  useTick(isOpen ? 1000 : 60_000);

  // Live workday minutes when open: max of server snapshot and (now - start).
  // When closed, trust the locked snapshot value.
  const liveWorkdayMinutes = React.useMemo(() => {
    const base = t?.workdayMinutes ?? 0;
    if (!isOpen || !wd?.startedAt) return base;
    const elapsed = Math.max(0, (Date.now() - new Date(wd.startedAt).getTime()) / 60_000);
    return Math.max(base, elapsed);
  }, [isOpen, wd?.startedAt, t?.workdayMinutes]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Arbetsdag
          </p>
          <p className="font-extrabold text-base text-foreground mt-1 flex items-center gap-1.5">
            <Sun className="w-4 h-4 text-primary shrink-0" />
            {wd ? (
              <>
                <span className="tabular-nums">{extractUTCTime(wd.startedAt)}</span>
                <span className="text-muted-foreground mx-0.5">→</span>
                {wd.endedAt ? (
                  <span className="tabular-nums">{extractUTCTime(wd.endedAt)}</span>
                ) : (
                  <span className="text-primary">pågår</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-sm font-semibold">Ej startad</span>
            )}
          </p>
        </div>
        {wd?.approved && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" /> Godkänd
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Lönegrundande"
          value={formatHoursMinutes(liveWorkdayMinutes / 60)}
          strong
        />
        <Stat
          label="Fördelat"
          value={formatHoursMinutes((t?.allocatedProjectMinutes ?? 0) / 60)}
        />
        <Stat
          label="Restid"
          value={formatHoursMinutes((t?.travelMinutes ?? 0) / 60)}
        />
        <Stat
          label="Ej fördelat"
          value={formatHoursMinutes((t?.unallocatedMinutes ?? 0) / 60)}
          muted
        />
      </div>
    </section>
  );
};

const Stat: React.FC<{ label: string; value: string; strong?: boolean; muted?: boolean }> = ({
  label, value, strong, muted,
}) => (
  <div className={cn(
    'rounded-xl border border-border px-3 py-2',
    muted ? 'bg-muted/20' : 'bg-background/60',
  )}>
    <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {label}
    </div>
    <div className={cn(
      'font-extrabold text-sm tabular-nums mt-0.5',
      strong ? 'text-foreground' : 'text-foreground/80',
    )}>
      {value}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// 3) Behöver din hjälp
// ────────────────────────────────────────────────────────────────────

const NeedsHelpSection: React.FC<{
  snapshot: StaffDaySnapshot;
  onClassifyUnknown: (seg: StaffDaySegment) => void;
}> = ({ snapshot, onClassifyUnknown }) => {
  const flags = useMemo(
    () => (snapshot.flags ?? []).filter((f) => !f.resolved && f.severity !== 'info'),
    [snapshot.flags],
  );
  const unknownSegs = useMemo(
    () => snapshot.segments.filter((s) => s.kind === 'unknown'),
    [snapshot.segments],
  );

  if (flags.length === 0 && unknownSegs.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> Behöver din hjälp
      </p>

      {unknownSegs.map((seg) => (
        <div key={seg.refs.locationEntryId ?? seg.startedAt} className="rounded-xl border border-amber-500/30 bg-card p-3 space-y-2">
          <div>
            <p className="font-bold text-sm text-foreground">Okänd vistelse</p>
            <p className="text-[12px] text-muted-foreground tabular-nums">{segmentRange(seg)}</p>
          </div>
          <p className="text-[12px] text-foreground/80">Vad var detta?</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" className="h-9 rounded-lg text-xs"
              onClick={() => onClassifyUnknown({ ...seg, source: 'classify:private' })}>
              Privat
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-lg text-xs"
              onClick={() => onClassifyUnknown({ ...seg, source: 'classify:travel' })}>
              Resa
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-lg text-xs"
              onClick={() => onClassifyUnknown({ ...seg, source: 'classify:other_work' })}>
              Annat arbete
            </Button>
            <Button size="sm" variant="ghost" className="h-9 rounded-lg text-xs text-muted-foreground"
              onClick={() => onClassifyUnknown({ ...seg, source: 'classify:ignore' })}>
              Ignorera
            </Button>
          </div>
        </div>
      ))}

      {flags.map((f: StaffDayFlag) => (
        <div key={f.id} className="rounded-xl border border-amber-500/30 bg-card p-3">
          <p className="font-bold text-sm text-foreground">{f.title}</p>
          {f.description && (
            <p className="text-[12px] text-muted-foreground mt-0.5">{f.description}</p>
          )}
        </div>
      ))}
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 4) Dagens tidslinje
// ────────────────────────────────────────────────────────────────────

const DayTimelineSection: React.FC<{ snapshot: StaffDaySnapshot }> = ({ snapshot }) => {
  if (snapshot.segments.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Dagens tidslinje
      </p>
      <div className="space-y-1.5">
        {snapshot.segments.map((seg, idx) => {
          const Icon = SEG_ICON[seg.kind] ?? Clock;
          const badge = segmentBadge(seg);
          return (
            <div
              key={`${seg.startedAt}-${idx}`}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5',
                seg.kind === 'unknown' && 'border-amber-500/30 bg-amber-500/5',
                seg.isActive && 'border-primary/30 bg-primary/5',
              )}
            >
              <div className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', SEG_TONE[seg.kind])}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] tabular-nums font-semibold text-muted-foreground">
                  {segmentRange(seg)}
                </p>
                <p className="text-sm font-semibold text-foreground truncate">
                  {seg.label}
                </p>
                <span className={cn('inline-block mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide', badge.tone)}>
                  {badge.label}
                </span>
              </div>
              <div className="text-xs tabular-nums font-bold text-foreground/80 shrink-0 pt-0.5">
                {formatHoursMinutes(seg.durationMinutes / 60)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// ────────────────────────────────────────────────────────────────────
// 5) Primär action
// ────────────────────────────────────────────────────────────────────

const PrimaryAction: React.FC<{ snapshot: StaffDaySnapshot | null }> = ({ snapshot }) => {
  const { start, isLoading } = useWorkDay();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const geo = useGeofencingContextOptional();
  const { requestStart } = useTimerStartFlow(bookings, staff?.id);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const isOpen = snapshot?.workday?.isOpen ?? false;

  const startDayLocations = useMemo(
    () => (geo?.orgLocations ?? [])
      .filter((loc: any) => loc.show_as_project === true)
      .map((loc: any) => ({ id: loc.id, name: loc.name, address: loc.address ?? null })),
    [geo?.orgLocations],
  );

  const handleEnd = () => {
    window.dispatchEvent(new CustomEvent('request-end-day'));
  };

  const handleConfirm = async (selection: StartDaySelection) => {
    setBusy(true);
    try {
      if (selection.kind === 'target') {
        const result = await requestStart(selection.target, {
          label: selection.label,
          startedAtIso: selection.startedAtIso,
        });
        if (result === 'started' || result === 'already_running') {
          toast.success(`Arbetsdag startad på ${selection.label}`);
          setDialogOpen(false);
        } else if (result === 'conflict') {
          setDialogOpen(false);
        }
        return;
      }
      if (selection.kind === 'presence') {
        const wd = await start(selection.startedAtIso ? { startedAtIso: selection.startedAtIso } : {});
        if (!wd) { toast.error('Kunde inte starta arbetsdagen'); return; }
        toast.success('Arbetsdag startad. Plats moniteras.');
        setDialogOpen(false);
        return;
      }
      // manual
      const wd = await start(selection.startedAtIso ? { startedAtIso: selection.startedAtIso } : {});
      if (!wd) { toast.error('Kunde inte starta arbetsdagen'); return; }
      try {
        await mobileApi.createWorkdayFlag({
          flag_type: 'unclear_start_target',
          flag_date: new Date().toISOString().slice(0, 10),
          title: 'Oklart startprojekt',
          description: selection.text,
          severity: 'warning',
          needs_user_input: false,
          context: { entered_text: selection.text, source: 'today_tab_manual', startedAtIso: selection.startedAtIso ?? null },
        });
      } catch (err) {
        console.warn('[TodayTab] createWorkdayFlag failed (non-fatal):', err);
      }
      toast.success('Arbetsdag startad. Arbetsledare kopplar projekt åt dig.');
      setDialogOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (isOpen) {
    return (
      <Button
        size="lg"
        variant="outline"
        className="w-full h-12 rounded-2xl text-sm font-bold gap-2"
        onClick={handleEnd}
      >
        <Square className="w-4 h-4" />
        Avsluta arbetsdag
      </Button>
    );
  }

  return (
    <>
      <Button
        size="lg"
        className="w-full h-12 rounded-2xl text-sm font-bold gap-2"
        onClick={() => setDialogOpen(true)}
        disabled={busy || isLoading}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        Starta arbetsdag
      </Button>
      <StartDayDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
        bookings={bookings}
        locations={startDayLocations}
        starting={busy}
      />
    </>
  );
};

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

export const TodayTab: React.FC = () => {
  const { snapshot, isLoading, error, refresh } = useStaffDayStatus();
  const navigate = useNavigate();

  const handleClassifyUnknown = (_seg: StaffDaySegment) => {
    // Classification UI lives in the assistant flow / day timeline editor;
    // for now navigate the user to the report-detail page where they can
    // resolve the unknown segment. Backend remains the single writer.
    toast.info('Öppnar dagens detaljvy för att klassificera vistelsen');
    navigate('/m/report');
  };

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
      <LiveStatusCard snapshot={snapshot} />
      <WorkdayCard snapshot={snapshot} />
      <NeedsHelpSection snapshot={snapshot} onClassifyUnknown={handleClassifyUnknown} />
      <DayTimelineSection snapshot={snapshot} />
      <div className="pt-1">
        <PrimaryAction snapshot={snapshot} />
      </div>
    </div>
  );
};

export default TodayTab;

// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
import React, { useMemo, useState } from 'react';
import {
  Sun, Clock, MapPin, Square, ArrowRightLeft, Pencil, X,
  Loader2, Building2, Briefcase, Truck, AlertTriangle, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStaffDaySnapshot, type StaffDayActive, type StaffDaySnapshot } from '@/hooks/useStaffDaySnapshot';
import { useWorkSession } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { extractUTCTime } from '@/utils/dateUtils';
import { formatHoursMinutes } from '@/utils/formatHours';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Props {
  onChanged?: () => void;
}

function useTick(intervalMs = 1000) {
  const [, setT] = useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function activeIcon(active: StaffDayActive) {
  if (active.kind === 'project') return Briefcase;
  if (active.kind === 'location') return Building2;
  return Briefcase;
}

/**
 * DayStatusPanel — fully driven by `get-staff-day-status` snapshot.
 *
 * The server is authority on what's active, allocated and approved.
 * We do NOT consult local activeTimers here; if the snapshot says
 * `active` is null, no live timer is rendered.
 */
export const DayStatusPanel: React.FC<Props> = ({ onChanged }) => {
  useTick(1000);
  const { snapshot, refresh } = useStaffDaySnapshot();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<null | 'stop' | 'not_work'>(null);
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { stopAny, dialogs: workSessionDialogs } = useWorkSession(bookings, staff?.id);

  const wd = snapshot?.workday ?? null;
  const active = snapshot?.active ?? null;
  const totals = snapshot?.totals;

  const workdayHHMM = wd?.startedAt ? extractUTCTime(wd.startedAt) : null;
  const workdayElapsedSec = wd?.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(wd.startedAt).getTime()) / 1000))
    : 0;

  const buildTargetForActive = (a: StaffDayActive) => {
    if (a.kind === 'project' && a.largeProjectId) {
      return { kind: 'project' as const, largeProjectId: a.largeProjectId, name: a.label };
    }
    if (a.kind === 'booking' && a.bookingId) {
      return { kind: 'booking' as const, bookingId: a.bookingId, client: a.label };
    }
    if (a.kind === 'location' && a.locationId) {
      return { kind: 'location' as const, locationId: a.locationId, name: a.label };
    }
    return undefined;
  };

  const handleStop = async () => {
    if (!active || busy) return;
    setBusy('stop');
    try {
      await stopAny({
        target: buildTargetForActive(active),
        serverEntryId: active.locationEntryId,
        stopReason: 'day_status_stop',
      });
      toast.success('Timer stoppad');
      await refresh();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa');
    } finally {
      setBusy(null);
    }
  };

  const handleNotWork = async () => {
    if (!active || busy) return;
    if (!confirm('Markera som ej arbete? Ingen tidrapport sparas och den öppna posten stängs.')) return;
    setBusy('not_work');
    try {
      await stopAny({
        target: buildTargetForActive(active),
        serverEntryId: active.locationEntryId,
        skipReport: true,
        stopReason: 'mark_not_work',
      });
      toast.success('Markerat som ej arbete');
      await refresh();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte uppdatera');
    } finally {
      setBusy(null);
    }
  };

  // ── Empty state ────────────────────────────────────────────────────
  if (!wd && !active) {
    return (
      <section className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Idag</p>
        <p className="text-sm text-muted-foreground">
          Ingen arbetsdag startad. Använd "Starta dagen" eller börja en aktivitet.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-4">
        {/* Top row — workday + payable */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Arbetsdag</p>
            <p className="font-extrabold text-base text-foreground">
              {workdayHHMM ? `${workdayHHMM} → ` : ''}
              {wd?.endedAt
                ? extractUTCTime(wd.endedAt)
                : <span className="text-primary">pågår</span>}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {workdayElapsedSec > 0
                ? `${Math.floor(workdayElapsedSec / 3600)}h ${Math.floor((workdayElapsedSec % 3600) / 60)}m sedan start`
                : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Total tid</p>
            <p className="font-extrabold text-base text-foreground tabular-nums">
              {formatHoursMinutes((totals?.workdayMinutes ?? 0) / 60)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {wd?.approved ? 'godkänd' : 'hittills idag'}
            </p>
          </div>
        </div>

        {/* Allocation summary from snapshot */}
        {totals && (
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <Stat label="Fördelat" value={formatHoursMinutes(totals.allocatedProjectMinutes / 60)} icon={<Briefcase className="w-3 h-3" />} />
            <Stat label="Restid" value={formatHoursMinutes(totals.travelMinutes / 60)} icon={<Truck className="w-3 h-3" />} />
            <Stat label="Ej fördelat" value={formatHoursMinutes(totals.unallocatedMinutes / 60)} icon={<Clock className="w-3 h-3" />} muted />
          </div>
        )}

        {/* Current activity — server is authority */}
        {active ? (
          <CurrentActivityCard
            active={active}
            busy={busy}
            onStop={handleStop}
            onNotWork={handleNotWork}
            onSwitch={() => navigate('/m/jobs')}
            onCorrect={() => {
              const el = document.getElementById('time-report-form');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              else navigate('/m/report');
            }}
          />
        ) : wd && !wd.endedAt ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            Arbetsdag pågår men ingen aktiv aktivitet just nu.
          </div>
        ) : null}

        {/* Approved badge */}
        {wd?.approved && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" /> Dagen är godkänd av admin
          </div>
        )}

        {/* Snapshot flags */}
        <SnapshotFlags snapshot={snapshot} />
      </section>
      {workSessionDialogs}
    </>
  );
};

const Stat: React.FC<{ label: string; value: string; icon: React.ReactNode; muted?: boolean }> = ({ label, value, icon, muted }) => (
  <div className={cn('rounded-xl border border-border px-2.5 py-1.5', muted ? 'bg-muted/20' : 'bg-background/60')}>
    <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
      {icon}{label}
    </div>
    <div className="font-extrabold text-sm text-foreground tabular-nums">{value}</div>
  </div>
);

const SnapshotFlags: React.FC<{ snapshot: StaffDaySnapshot | null }> = ({ snapshot }) => {
  const flags = useMemo(
    () => (snapshot?.flags ?? []).filter((f) => !f.resolved && f.severity !== 'info'),
    [snapshot],
  );
  if (flags.length === 0) return null;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 space-y-1">
      {flags.map((f) => (
        <div key={f.id} className="flex items-start gap-2 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{f.title}</p>
            {f.description && <p className="text-[11px] text-warning/80">{f.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

const CurrentActivityCard: React.FC<{
  active: StaffDayActive;
  busy: 'stop' | 'not_work' | null;
  onStop: () => void;
  onNotWork: () => void;
  onSwitch: () => void;
  onCorrect: () => void;
}> = ({ active, busy, onStop, onNotWork, onSwitch, onCorrect }) => {
  const Icon = activeIcon(active);
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Icon className="w-3 h-3" />
            Aktiv
          </span>
          <p className="mt-1.5 font-bold text-sm text-foreground truncate">{active.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            sedan {extractUTCTime(active.startedAt)}
          </p>
        </div>
        <div className="font-mono font-extrabold text-base tabular-nums text-primary shrink-0">
          {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="default" className="rounded-xl h-10 gap-1.5 text-xs font-semibold" onClick={onStop} disabled={!!busy}>
          {busy === 'stop' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
          Sluta här
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl h-10 gap-1.5 text-xs font-semibold" onClick={onSwitch} disabled={!!busy}>
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Byt plats/projekt
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl h-10 gap-1.5 text-xs font-semibold" onClick={onCorrect} disabled={!!busy}>
          <Pencil className="w-3.5 h-3.5" />
          Korrigera starttid
        </Button>
        <Button size="sm" variant="ghost" className="rounded-xl h-10 gap-1.5 text-xs font-semibold text-muted-foreground" onClick={onNotWork} disabled={!!busy}>
          {busy === 'not_work' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Inte arbete
        </Button>
      </div>
    </div>
  );
};

export default DayStatusPanel;

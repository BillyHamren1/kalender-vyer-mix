import React, { useMemo, useState } from 'react';
import { Play, Square, Loader2, Repeat, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useActiveTimerStatus } from '@/hooks/useActiveTimerStatus';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useGeofencingContextOptional } from '@/contexts/GeofencingContext';
import { mobileApi } from '@/services/mobileApiService';
import StartDayDialog, { type StartDaySelection } from './StartDayDialog';

/**
 * WorkDayPanel — den ENDA synliga timer-ytan i Tidappen.
 *
 * Frikopplad från workday/useWorkSession. Styr ENBART
 * `active_time_registrations` via Time Engine v2:
 *   - start: mobileApi.startLocationTimer  (→ start_time_registration)
 *   - stop:  mobileApi.stopTimeRegistration (→ stop_time_registration)
 *
 * Två lägen, drivna ENBART av useActiveTimerStatus:
 *   A) Ingen aktiv timer  → "Tid registreras inte" + [Starta timer]
 *   B) Aktiv timer        → HH:MM:SS + "Registreras på: {label}" + [Ändra] [Stoppa timer]
 *
 * Får inte: skapa workday, läsa useWorkSession, läsa location_time_entries,
 * dispatch:a request-end-day, eller använda useTimerStartFlow/useWorkDay.
 */
const formatHMS = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const WorkDayPanel: React.FC = () => {
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const geo = useGeofencingContextOptional();

  const { data: timer, refresh } = useActiveTimerStatus(!!staff);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const startDayLocations = useMemo(
    () =>
      (geo?.orgLocations ?? [])
        .filter((loc: any) => loc.show_as_project === true)
        .map((loc: any) => ({ id: loc.id, name: loc.name, address: loc.address ?? null })),
    [geo?.orgLocations],
  );

  const handleStartClick = () => setDialogOpen(true);
  const handleSwitchClick = () => setDialogOpen(true);

  const notifyChanged = () => {
    window.dispatchEvent(new Event('timer-state-changed'));
    refresh?.();
  };

  const handleStop = async () => {
    if (stopping || !timer.timerId) return;
    setStopping(true);
    try {
      const res = await mobileApi.stopTimeRegistration({
        registration_id: timer.timerId,
        stop_source: 'user_manual',
      });
      if (res?.success === false) {
        toast.error('Kunde inte stoppa timern. Försök igen.');
      } else {
        toast.success('Timer stoppad.');
        notifyChanged();
      }
    } catch (err) {
      console.warn('[WorkDayPanel] stopTimeRegistration failed:', err);
      toast.error('Kunde inte stoppa timern. Försök igen.');
    } finally {
      setStopping(false);
    }
  };

  const startWithParams = async (
    params: Parameters<typeof mobileApi.startLocationTimer>[0],
    label: string,
  ) => {
    // If a timer is already running, stop it first to allow switching target.
    if (timer.timerActive && timer.timerId) {
      try {
        await mobileApi.stopTimeRegistration({
          registration_id: timer.timerId,
          stop_source: 'user_switch',
        });
      } catch (err) {
        console.warn('[WorkDayPanel] stop-before-switch failed:', err);
      }
    }
    const res = await mobileApi.startLocationTimer(params);
    if (res?.success === false) {
      toast.error('Kunde inte starta timern.');
      return false;
    }
    toast.success(`Timer startad på ${label}`);
    notifyChanged();
    return true;
  };

  const handleDialogConfirm = async (selection: StartDaySelection) => {
    setStarting(true);
    try {
      if (selection.kind === 'target') {
        const t = selection.target as any;
        // Mappa selektion → Time Engine target_type/target_id.
        // booking_id        → target_type:'booking',       target_id: booking_id
        // large_project_id  → target_type:'large_project', target_id: large_project_id
        // location_id       → target_type:'location',      target_id: location_id
        let target_type: 'booking' | 'large_project' | 'location' | null = null;
        let target_id: string | null = null;
        if (t.kind === 'project' && t.largeProjectId) {
          target_type = 'large_project';
          target_id = t.largeProjectId;
        } else if (t.kind === 'booking' && t.bookingId) {
          target_type = 'booking';
          target_id = t.bookingId;
        } else if (t.kind === 'location' && t.locationId) {
          target_type = 'location';
          target_id = t.locationId;
        }
        if (!target_type || !target_id) {
          toast.error('Ogiltigt mål för timer.');
          return;
        }
        const params: Parameters<typeof mobileApi.startLocationTimer>[0] = {
          started_at: selection.startedAtIso,
          ...(target_type === 'booking'       ? { booking_id: target_id } : {}),
          ...(target_type === 'large_project' ? { large_project_id: target_id } : {}),
          ...(target_type === 'location'      ? { location_id: target_id } : {}),
        };
        const ok = await startWithParams(params, selection.label);
        if (ok) setDialogOpen(false);
        return;
      }
      // 'presence' / 'manual' → workday-relaterade flöden hör inte hemma här.
      toast.error('Välj projekt eller plats för att starta timer.');
    } finally {
      setStarting(false);
    }
  };

  // ── LÄGE A — ingen aktiv timer ───────────────────────────────────────
  if (!timer.timerActive) {
    return (
      <>
        <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-md text-center">
          <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-2xl bg-muted mb-4">
            <Clock className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-2xl font-extrabold text-foreground tracking-tight">
            Tid registreras inte
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Starta timern när du börjar jobba.
          </p>
          <button
            onClick={handleStartClick}
            disabled={starting}
            className="mt-6 w-full h-16 rounded-2xl bg-primary text-primary-foreground font-extrabold text-lg flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-all disabled:opacity-60"
          >
            {starting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6 fill-current" />}
            {starting ? 'Startar…' : 'Starta timer'}
          </button>
        </div>
        <StartDayDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onConfirm={handleDialogConfirm}
          bookings={bookings}
          locations={startDayLocations}
          starting={starting}
        />
      </>
    );
  }

  // ── LÄGE B — aktiv timer ─────────────────────────────────────────────
  return (
    <>
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-md">
        <div className="text-center">
          <div className="text-5xl font-extrabold tracking-tight text-foreground tabular-nums">
            {formatHMS(timer.elapsedSeconds)}
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mt-3">
            Registreras på
          </p>
          <p className="text-base font-bold text-foreground mt-1 line-clamp-2">
            {timer.registrationLabel}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={handleSwitchClick}
            className="h-12 rounded-2xl bg-secondary text-secondary-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            <Repeat className="w-4 h-4" />
            Ändra
          </button>
          <button
            onClick={handleStop}
            disabled={stopping}
            className="h-12 rounded-2xl bg-destructive text-destructive-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-60"
          >
            {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
            Stoppa timer
          </button>
        </div>
      </div>
      <StartDayDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDialogConfirm}
        bookings={bookings}
        locations={startDayLocations}
        starting={starting}
      />
    </>
  );
};

export default WorkDayPanel;

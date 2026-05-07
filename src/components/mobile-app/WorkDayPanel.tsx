import React, { useMemo, useState } from 'react';
import { Play, Square, Loader2, Repeat, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useActiveTimerStatus } from '@/hooks/useActiveTimerStatus';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useGeofencingContextOptional } from '@/contexts/GeofencingContext';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { useWorkDay } from '@/hooks/useWorkDay';
import { mobileApi } from '@/services/mobileApiService';
import { clearWorkdayEnded } from '@/services/workdayState';
import StartDayDialog, { type StartDaySelection } from './StartDayDialog';

/**
 * WorkDayPanel — den ENDA synliga timer-ytan i Tidappen.
 *
 * Två lägen, drivna ENBART av backendens get-active-timer-status:
 *   A) Ingen aktiv timer  → "Tid registreras inte"  + [Starta timer]
 *   B) Aktiv timer        → HH:MM:SS + "Registreras på: {label}" + [Ändra] [Stoppa timer]
 *
 * Lokala timer-källor (useWorkSession, location_time_entries, time_reports,
 * workday, activeTimers) får INTE läsas här. Stop går via befintligt
 * 'request-end-day'-event som GlobalActiveTimerBanner lyssnar på i bakgrunden.
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
  const { start } = useWorkDay();
  const { requestStart } = useTimerStartFlow(bookings, staff?.id);

  const { data: timer } = useActiveTimerStatus(!!staff);

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

  const handleStop = () => {
    if (stopping) return;
    setStopping(true);
    window.dispatchEvent(new CustomEvent('request-end-day'));
    setTimeout(() => setStopping(false), 1500);
  };

  const handleDialogConfirm = async (selection: StartDaySelection) => {
    setStarting(true);
    try {
      clearWorkdayEnded();
      if (selection.kind === 'target') {
        const res = await requestStart(selection.target, {
          label: selection.label,
          startedAtIso: selection.startedAtIso,
        });
        if (res === 'started' || res === 'already_running') {
          toast.success(`Timer startad på ${selection.label}`);
          setDialogOpen(false);
          window.dispatchEvent(new Event('timer-state-changed'));
        } else if (res === 'conflict') {
          setDialogOpen(false);
        }
        return;
      }
      if (selection.kind === 'presence') {
        const wd = await start(selection.startedAtIso ? { startedAtIso: selection.startedAtIso } : {});
        if (!wd) { toast.error('Kunde inte starta. Försök igen.'); return; }
        toast.success('Arbetsdag startad. Plats kopplas automatiskt.');
        setDialogOpen(false);
        window.dispatchEvent(new Event('timer-state-changed'));
        return;
      }
      const wd = await start(selection.startedAtIso ? { startedAtIso: selection.startedAtIso } : {});
      if (!wd) { toast.error('Kunde inte starta. Försök igen.'); return; }
      try {
        await mobileApi.createWorkdayFlag({
          flag_type: 'unclear_start_target',
          flag_date: new Date().toISOString().slice(0, 10),
          title: 'Oklart startprojekt',
          description: selection.text,
          severity: 'warning',
          needs_user_input: false,
          context: { entered_text: selection.text, source: 'workday_panel_manual', startedAtIso: selection.startedAtIso ?? null },
        });
      } catch (err) {
        console.warn('[WorkDayPanel] createWorkdayFlag failed (non-fatal):', err);
      }
      toast.success('Arbetsdag startad.');
      setDialogOpen(false);
      window.dispatchEvent(new Event('timer-state-changed'));
    } finally {
      setStarting(false);
    }
  };

  // ── LÄGE A — ingen aktiv timer ───────────────────────────────────────
  if (!timer.timerActive) {
    return (
      <>
        <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-md text-center">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-2xl bg-muted mb-3">
            <Clock className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-base font-bold text-foreground">Tid registreras inte</p>
          <button
            onClick={handleStartClick}
            disabled={starting}
            className="mt-5 w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all disabled:opacity-60"
          >
            {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
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

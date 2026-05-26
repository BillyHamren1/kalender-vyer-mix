import React, { useState } from 'react';
import { Play, Square, Loader2, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useActiveTimerStatus } from '@/hooks/useActiveTimerStatus';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';
import StartDayDialog, { type StartDaySelection } from './StartDayDialog';

/**
 * WorkDayPanel — den ENDA synliga timer-ytan i Tidappen.
 *
 * En enda mental modell för användaren:
 *   • Starta arbetsdag
 *   • Avsluta arbetsdag
 *
 * Projekt/bokningar/lager/transport visas som "vad dagen består av"
 * (label på den aktiva registreringen), inte som separata timers
 * användaren styr. Användaren ser inte längre orden "timer".
 *
 * Datakälla: useActiveTimerStatus (active_time_registrations).
 * Skriver:    mobileApi.startTimeRegistration / stopTimeRegistration.
 *
 * Får inte: skapa workday, läsa useWorkSession, läsa location_time_entries,
 * dispatch:a request-end-day, eller använda useTimerStartFlow/useWorkDay.
 */
const formatDuration = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
};

export const WorkDayPanel: React.FC = () => {
  const { staff } = useMobileAuth();
  const { data: timer, refresh } = useActiveTimerStatus(!!staff);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

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
        toast.error('Kunde inte avsluta arbetsdagen. Försök igen.');
      } else {
        toast.success('Arbetsdag avslutad.');
        notifyChanged();
      }
    } catch (err) {
      console.warn('[WorkDayPanel] stopTimeRegistration failed:', err);
      toast.error('Kunde inte avsluta arbetsdagen. Försök igen.');
    } finally {
      setStopping(false);
    }
  };

  const handleDialogConfirm = async (selection: StartDaySelection) => {
    setStarting(true);
    try {
      const res = await mobileApi.startTimeRegistration({
        started_at: selection.startedAtIso,
      });
      if (res?.success === false) {
        toast.error('Kunde inte starta arbetsdagen.');
        return;
      }
      toast.success('Arbetsdag startad.');
      notifyChanged();
      setDialogOpen(false);
    } finally {
      setStarting(false);
    }
  };

  // ── Kompakt: arbetsdagen är inte startad ────────────────────────────
  if (!timer.timerActive) {
    return (
      <>
        <div
          className="rounded-2xl border border-primary/15 bg-primary-soft p-4 flex items-center gap-3"
          style={{ boxShadow: '0 1px 2px hsl(184 30% 15% / 0.04)' }}
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-primary/15 shrink-0">
            <Sun className="w-[18px] h-[18px] text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/80 leading-none">
              Arbetsdag
            </p>
            <p className="text-[15px] font-semibold text-foreground leading-tight mt-1">
              Inte startad
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Tryck för att börja jobba.
            </p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            disabled={starting}
            className="shrink-0 h-11 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-60 shadow-[0_2px_0_hsl(var(--primary-dark))]"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{starting ? 'Startar…' : 'Starta'}</span>
          </button>
        </div>
        <StartDayDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onConfirm={handleDialogConfirm}
          starting={starting}
        />
      </>
    );
  }


  // ── Kompakt: arbetsdagen är aktiv ───────────────────────────────────
  const startedLabel = timer.startedAt ? format(parseISO(timer.startedAt), 'HH:mm') : '—';
  const totalLabel = formatDuration(timer.elapsedSeconds);

  return (
    <>
      <div
        className="rounded-2xl border border-primary/15 bg-primary-soft p-4"
        style={{ boxShadow: '0 1px 2px hsl(184 30% 15% / 0.04)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-primary/15 shrink-0">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/80 leading-none">
              Arbetsdag aktiv
            </p>
            <div className="text-[26px] font-extrabold tracking-tight text-foreground tabular-nums leading-none mt-1.5">
              {totalLabel}
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight mt-1.5">
              Startad <span className="font-semibold text-foreground">{startedLabel}</span>
              <span className="text-muted-foreground/60"> · plats fördelas automatiskt</span>
            </p>
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={handleStop}
            disabled={stopping}
            className="w-full h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
            Avsluta arbetsdag
          </button>
        </div>
      </div>
    </>
  );
};


export default WorkDayPanel;

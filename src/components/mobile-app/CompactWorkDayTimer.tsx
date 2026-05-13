import React, { useMemo, useState } from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useActiveTimerStatus } from '@/hooks/useActiveTimerStatus';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useGeofencingContextOptional } from '@/contexts/GeofencingContext';
import { mobileApi } from '@/services/mobileApiService';
import StartDayDialog, { type StartDaySelection } from './StartDayDialog';

/**
 * CompactWorkDayTimer — kompakt timer-strip för MobileJobs header.
 * Samma datakälla som WorkDayPanel. Avsluta-knapp får aldrig blockeras.
 */
const formatDuration = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
};

const CompactWorkDayTimer: React.FC = () => {
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
        toast.error('Kunde inte avsluta arbetsdagen.');
      } else {
        toast.success('Arbetsdag avslutad');
        notifyChanged();
      }
    } catch (err) {
      console.warn('[CompactWorkDayTimer] stop failed:', err);
      toast.error('Kunde inte avsluta arbetsdagen.');
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
      toast.success('Arbetsdag startad');
      notifyChanged();
      setDialogOpen(false);
    } finally {
      setStarting(false);
    }
  };

  if (!timer.timerActive) {
    return (
      <>
        <div className="h-11 px-3 flex items-center gap-2 bg-primary-foreground/10 rounded-xl">
          <span className="text-xs font-semibold text-primary-foreground/80 flex-1 truncate">
            Ej startad
          </span>
          <button
            onClick={() => setDialogOpen(true)}
            disabled={starting}
            className="h-8 px-3 rounded-lg bg-primary-foreground text-primary text-xs font-bold flex items-center gap-1 active:scale-95 transition-all disabled:opacity-60"
          >
            {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            Starta
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

  const totalLabel = formatDuration(timer.elapsedSeconds);

  return (
    <div className="h-11 px-3 flex items-center gap-2 bg-primary-foreground/10 rounded-xl">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
      <span className="text-sm font-bold text-primary-foreground tabular-nums shrink-0">
        {totalLabel}
      </span>
      <span className="text-xs text-primary-foreground/70 truncate flex-1 min-w-0">
        {timer.registrationLabel || '—'}
      </span>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="h-8 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold flex items-center gap-1 active:scale-95 transition-all disabled:opacity-60 shrink-0"
      >
        {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
        Avsluta
      </button>
    </div>
  );
};

export default CompactWorkDayTimer;

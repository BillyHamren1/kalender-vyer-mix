/**
 * GlobalActiveTimerBanner
 * ========================
 *
 * Floating list of active timers shown on every mobile route except
 * `/m/report` (where the dedicated cards already do the same job).
 *
 * Two stop verbs side by side (Prompt 3):
 *
 *   • per row → "Avsluta aktivitet"  (calls stopSession on that timer)
 *   • footer  → "Avsluta dagen"      (calls endDay — stops every timer
 *                                     and triggers EOD reconciliation)
 *
 * Both verbs go through the unified `useWorkSession` engine so the
 * break-prompt + save-then-stop + presence handling are identical no
 * matter which surface the user touches. Role classification (presence
 * vs reportable) lives in `src/lib/timerRole.ts`.
 */
import React, { useState, useEffect } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2, MoonStar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { useWorkSession } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { buildStopTarget, getTimerRole } from '@/lib/timerRole';

const GlobalActiveTimerBanner: React.FC = () => {
  const location = useLocation();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { activeTimers, stopSession, endDay, dialogs } = useWorkSession(bookings, staff?.id);
  const [, setTick] = useState(0);
  const [endingDay, setEndingDay] = useState(false);

  // 1Hz tick so the elapsed counters stay live. activeTimers itself
  // updates via the engine — we don't poll localStorage anymore.
  useEffect(() => {
    if (activeTimers.size === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimers.size]);

  const handleStopActivity = async (key: string, timer: ActiveTimer) => {
    const target = buildStopTarget(key, timer);
    const role = getTimerRole(timer);
    try {
      const res = await stopSession(target);
      if (res.cancelled) return;
      if (res.saved) {
        if (role.kind === 'location' && role.presenceOnly) {
          toast.success('Aktivitet avslutad');
        } else {
          toast.success(`Tidrapport sparad: ${res.hoursWorked}h`);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte avsluta aktiviteten');
    }
  };

  const handleEndDay = async () => {
    if (endingDay) return;
    setEndingDay(true);
    try {
      const res = await endDay();
      if (res.cancelled) return;
      if (!res.eodPromptShown && res.stoppedCount === 0) {
        toast.message('Inga aktiva timers — dagen är redan avslutad');
      } else if (!res.eodPromptShown) {
        toast.success(`Dagen avslutad — ${res.stoppedCount} aktivitet${res.stoppedCount === 1 ? '' : 'er'} stoppad${res.stoppedCount === 1 ? '' : 'e'}`);
      }
      // If eodPromptShown=true, EndOfDayStopDialog handles its own toast.
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte avsluta dagen');
    } finally {
      setEndingDay(false);
    }
  };

  if (location.pathname === '/m/report') return null;

  return (
    <>
      {activeTimers.size > 0 && (
        <div className="px-5 pt-3 space-y-2">
          {Array.from(activeTimers.entries()).map(([key, timer]) => (
            <TimerRow key={key} timerKey={key} timer={timer} onStop={handleStopActivity} />
          ))}
          <Button
            variant="outline"
            onClick={handleEndDay}
            disabled={endingDay}
            className="w-full rounded-xl h-10 gap-2 text-sm font-semibold border-primary/30 text-primary hover:bg-primary/10"
          >
            {endingDay ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoonStar className="w-4 h-4" />}
            Avsluta dagen
          </Button>
        </div>
      )}
      {dialogs}
    </>
  );
};

const TimerRow: React.FC<{
  timerKey: string;
  timer: ActiveTimer;
  onStop: (key: string, timer: ActiveTimer) => void;
}> = ({ timerKey, timer, onStop }) => {
  const elapsed = differenceInSeconds(new Date(), parseISO(timer.startTime));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const role = getTimerRole(timer);
  const isLocation = role.kind === 'location';

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-primary/20 bg-primary/5">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5">
          {isLocation && <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />}
          {timer.locationName || timer.client}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Startad {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (auto)'}
          {isLocation && role.presenceOnly && ' · närvaro'}
        </p>
      </div>
      <div className="font-mono font-extrabold text-base tabular-nums text-primary">
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </div>
      <Button
        size="sm"
        variant="destructive"
        className="rounded-xl h-9 gap-1 text-xs font-semibold"
        onClick={() => onStop(timerKey, timer)}
      >
        <Square className="w-3 h-3" />
        Avsluta
      </Button>
    </div>
  );
};

export default GlobalActiveTimerBanner;

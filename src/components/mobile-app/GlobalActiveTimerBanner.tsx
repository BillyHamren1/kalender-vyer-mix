/**
 * GlobalActiveTimerBanner
 * ========================
 *
 * Floating list of active timers shown on every mobile route except
 * `/m/report` (where the dedicated cards already do the same job).
 *
 * Architectural decision (Prompt 2):
 *
 *   This banner is just another STOP SURFACE. It MUST go through the
 *   unified work-session engine — `useWorkSession.stopSession()` — for
 *   exactly the same break-prompt + save-then-stop + presence handling
 *   as the time-report page and location detail. Stopping the same
 *   timer from the banner, the report page, or the location screen now
 *   produces an identical outcome.
 *
 *   The legacy implementation called `mobileApi.createTimeReport()`
 *   directly with `key.startsWith('project-')` as the proxy for
 *   "is this a location?". That misclassified location timers
 *   (`location-…` keys) as bookings and silently produced bogus
 *   time_reports. That whole code path is gone.
 *
 *   Role classification (presence vs reportable) is now done in ONE
 *   place — `src/lib/timerRole.ts` — and re-used everywhere.
 */
import React, { useState, useEffect } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2 } from 'lucide-react';
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
  const { activeTimers, stopSession, dialogs } = useWorkSession(bookings, staff?.id);
  const [, setTick] = useState(0);

  // 1Hz tick so the elapsed counters stay live. activeTimers itself
  // updates via the engine — we don't poll localStorage anymore.
  useEffect(() => {
    if (activeTimers.size === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimers.size]);

  const handleStop = async (key: string, timer: ActiveTimer) => {
    const target = buildStopTarget(key, timer);
    const role = getTimerRole(timer);
    try {
      const res = await stopSession(target);
      if (res.cancelled) return;
      if (res.saved) {
        // Same UX language as the time-report screen so users learn
        // one model, not three.
        if (role.kind === 'location' && role.presenceOnly) {
          toast.success('Timer stopped');
        } else {
          toast.success(`Time report saved: ${res.hoursWorked}h`);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not stop timer');
    }
  };

  if (location.pathname === '/m/report') return null;

  return (
    <>
      {activeTimers.size > 0 && (
        <div className="px-5 pt-3 space-y-2">
          {Array.from(activeTimers.entries()).map(([key, timer]) => (
            <TimerRow key={key} timerKey={key} timer={timer} onStop={handleStop} />
          ))}
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
          Started {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (auto)'}
          {isLocation && role.presenceOnly && ' · presence'}
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
        Stop
      </Button>
    </div>
  );
};

export default GlobalActiveTimerBanner;

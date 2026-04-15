import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import type { ActiveTimer } from '@/hooks/useGeofencing';

const TIMERS_KEY = 'eventflow-mobile-timers';

function loadTimersFromStorage(): Map<string, ActiveTimer> {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

/**
 * Global banner showing active timers on ALL mobile pages.
 * Reads from localStorage so it works independently of useGeofencing instances.
 * The time report page already shows its own ActiveTimerCard, so we hide there.
 */
const GlobalActiveTimerBanner: React.FC = () => {
  const location = useLocation();
  const [timers, setTimers] = useState<Map<string, ActiveTimer>>(loadTimersFromStorage);
  const [tick, setTick] = useState(0);

  // Poll localStorage for timer changes (useGeofencing writes here)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(loadTimersFromStorage());
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Also listen for custom event from useGeofencing
  useEffect(() => {
    const handler = () => setTimers(loadTimersFromStorage());
    window.addEventListener('timer-state-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('timer-state-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const handleStop = useCallback(async (key: string, timer: ActiveTimer) => {
    // Remove from localStorage immediately
    const current = loadTimersFromStorage();
    current.delete(key);
    localStorage.setItem(TIMERS_KEY, JSON.stringify(Array.from(current.entries())));
    setTimers(current);

    // Notify useGeofencing instances
    window.dispatchEvent(new Event('timer-state-changed'));

    // Stop on server if it's a location timer
    if (timer.locationId) {
      try {
        await mobileApi.stopLocationTimer({ location_id: timer.locationId });
      } catch (err) {
        console.warn('Failed to stop location timer on server:', err);
      }
    }

    toast.success('Timer stoppad');
  }, []);

  // Hide on time report page (it has its own display)
  if (location.pathname === '/m/report') return null;

  if (timers.size === 0) return null;

  return (
    <div className="px-5 pt-3 space-y-2">
      {Array.from(timers.entries()).map(([key, timer]) => (
        <TimerRow key={key} timerKey={key} timer={timer} onStop={handleStop} />
      ))}
    </div>
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
  const isLocation = !!timer.locationId;

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
        Stopp
      </Button>
    </div>
  );
};

export default GlobalActiveTimerBanner;

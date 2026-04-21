/**
 * useWorkDayTimer — the "day timer".
 *
 * Starts the moment the user's first activity timer of the day starts and
 * keeps ticking until the user actively ends the day (Avsluta dagen).
 *
 * Robustness rules:
 *  - Persisted in localStorage (`eventflow-workday-start`) so it survives
 *    reloads, app kills and tab switches.
 *  - Auto-recovery: if the workday key is missing but at least one
 *    activity timer is running, we adopt the EARLIEST active timer's
 *    `startTime` as the workday start. This makes it impossible to "lose"
 *    the day timer just because the user reloaded mid-shift.
 *  - Day-rollover safety: if a stored workday start is older than 18h
 *    AND there are no active timers, we discard it instead of showing
 *    yesterday's clock.
 *  - Cleared on `workday-ended` (dispatched by the EOD pipeline once all
 *    activity timers have been stopped).
 */
import { useEffect, useState, useCallback } from 'react';
import { parseISO, differenceInSeconds } from 'date-fns';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import {
  clearWorkdayEnded,
  hasWorkdayEndedToday,
  WORKDAY_ENDED_STATE_CHANGED_EVENT,
} from '@/services/workdayState';

const WORKDAY_KEY = 'eventflow-workday-start';
const TIMERS_KEY = 'eventflow-mobile-timers';
const MAX_AGE_HOURS = 18;

function readTimers(): Map<string, ActiveTimer> {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

function readWorkdayStart(): string | null {
  try {
    return localStorage.getItem(WORKDAY_KEY);
  } catch {
    return null;
  }
}

function writeWorkdayStart(iso: string | null) {
  try {
    if (iso) localStorage.setItem(WORKDAY_KEY, iso);
    else localStorage.removeItem(WORKDAY_KEY);
    window.dispatchEvent(new CustomEvent('workday-timer-changed'));
  } catch {
    /* ignore */
  }
}

/** Pick the earliest startTime across active timers (or null). */
function earliestActiveStart(timers: Map<string, ActiveTimer>): string | null {
  let min: number | null = null;
  let iso: string | null = null;
  for (const t of timers.values()) {
    const ts = parseISO(t.startTime).getTime();
    if (!Number.isFinite(ts)) continue;
    if (min === null || ts < min) {
      min = ts;
      iso = t.startTime;
    }
  }
  return iso;
}

/** Reconcile workday-start against current timers. Pure, idempotent. */
function reconcile(): string | null {
  const timers = readTimers();
  const stored = readWorkdayStart();
  const earliest = earliestActiveStart(timers);

   if (hasWorkdayEndedToday() && !earliest) {
    if (stored) writeWorkdayStart(null);
    return null;
   }

  // Auto-start: at least one active timer but no workday start saved.
  if (!stored && earliest) {
    clearWorkdayEnded();
    writeWorkdayStart(earliest);
    return earliest;
  }

  // Auto-recover earlier start: an active timer started BEFORE the saved
  // workday start (e.g. backdated start from arrival popup).
  if (stored && earliest) {
    const storedTs = parseISO(stored).getTime();
    const earliestTs = parseISO(earliest).getTime();
    if (Number.isFinite(storedTs) && Number.isFinite(earliestTs) && earliestTs < storedTs) {
      clearWorkdayEnded();
      writeWorkdayStart(earliest);
      return earliest;
    }
  }

  // Day-rollover safety: stale workday start with no active timers.
  if (stored && !earliest) {
    const storedTs = parseISO(stored).getTime();
    if (
      Number.isFinite(storedTs) &&
      Date.now() - storedTs > MAX_AGE_HOURS * 3600 * 1000
    ) {
      writeWorkdayStart(null);
      return null;
    }
  }

  return stored;
}

export function useWorkDayTimer() {
  const [startIso, setStartIso] = useState<string | null>(() => reconcile());
  const [, setTick] = useState(0);

  // Re-reconcile whenever timer-state changes.
  useEffect(() => {
    const refresh = () => setStartIso(reconcile());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TIMERS_KEY || e.key === WORKDAY_KEY) refresh();
    };
    const onWorkdayEnded = () => {
      writeWorkdayStart(null);
      setStartIso(null);
    };

    window.addEventListener('timer-state-changed', refresh);
    window.addEventListener('workday-timer-changed', refresh);
    window.addEventListener('workday-ended', onWorkdayEnded);
    window.addEventListener(WORKDAY_ENDED_STATE_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('timer-state-changed', refresh);
      window.removeEventListener('workday-timer-changed', refresh);
      window.removeEventListener('workday-ended', onWorkdayEnded);
      window.removeEventListener(WORKDAY_ENDED_STATE_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Tick once per second to refresh the displayed elapsed time.
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [startIso]);

  const elapsedSeconds = startIso
    ? Math.max(0, differenceInSeconds(new Date(), parseISO(startIso)))
    : 0;

  const endWorkDay = useCallback(() => {
    writeWorkdayStart(null);
    setStartIso(null);
    window.dispatchEvent(new CustomEvent('workday-ended'));
  }, []);

  return {
    isActive: !!startIso,
    startIso,
    elapsedSeconds,
    endWorkDay,
  };
}

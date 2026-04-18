import { useEffect, useState, useCallback, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import type { ActiveTimer } from './useGeofencing';

const TIMERS_KEY = 'eventflow-mobile-timers';
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const STALE_AGE_MS = 24 * 60 * 60 * 1000;

interface StaleEntry {
  key: string;
  timer: ActiveTimer;
}

function loadTimers(): Map<string, ActiveTimer> {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

function saveTimers(map: Map<string, ActiveTimer>) {
  localStorage.setItem(TIMERS_KEY, JSON.stringify(Array.from(map.entries())));
  window.dispatchEvent(new Event('timer-state-changed'));
}

/**
 * Per architectural decision §1 (server is source of truth) and §7 (stale timers warn, not delete):
 *
 * Periodically reconciles localStorage timers against location_time_entries on the server.
 * - Local timer with no matching open server entry AND >24h old → flagged isStale
 * - Local timer that has been closed on the server (exited_at set) → flagged isStale='no_server_match'
 *
 * Returns the list of stale timers needing user attention.
 * Never silently deletes anything.
 */
export function useTimerReconciliation(enabled: boolean) {
  const [staleTimers, setStaleTimers] = useState<StaleEntry[]>([]);
  const runningRef = useRef(false);

  const reconcile = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const local = loadTimers();
      if (local.size === 0) {
        setStaleTimers([]);
        return;
      }

      // Fetch open server entries (last 7 days window, only open ones)
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      let openEntries: any[] = [];
      try {
        const res = await mobileApi.getLocationTimeEntries({ date_from: fromDate, limit: 100 });
        openEntries = (res.entries || []).filter((e: any) => !e.exited_at);
      } catch (err) {
        console.warn('[Reconcile] Could not fetch server entries:', err);
        // If we can't reach the server, do not flag — try again next cycle.
        return;
      }

      const openByLocation = new Set<string>(
        openEntries.map((e: any) => `location-${e.location_id}`)
      );

      const stale: StaleEntry[] = [];
      let mutated = false;
      const next = new Map(local);

      for (const [key, timer] of local) {
        const ageMs = Date.now() - new Date(timer.startTime).getTime();
        const isOld = ageMs > STALE_AGE_MS;
        const isLocationTimer = key.startsWith('location-');

        // Location timer: must have a matching open server entry
        if (isLocationTimer && !openByLocation.has(key)) {
          if (!timer.isStale) {
            next.set(key, { ...timer, isStale: true, staleReason: 'no_server_match' });
            mutated = true;
          }
          stale.push({ key, timer: next.get(key)! });
          continue;
        }

        // Booking/project timer: only age-based flagging (no server timer to check)
        if (!isLocationTimer && isOld) {
          if (!timer.isStale) {
            next.set(key, { ...timer, isStale: true, staleReason: 'age' });
            mutated = true;
          }
          stale.push({ key, timer: next.get(key)! });
          continue;
        }

        // Already-flagged stale that is still here
        if (timer.isStale) {
          stale.push({ key, timer });
        }
      }

      if (mutated) saveTimers(next);
      setStaleTimers(stale);
    } finally {
      runningRef.current = false;
    }
  }, []);

  // Save (convert) a stale timer: caller already created the time_report.
  // We simply remove it from localStorage.
  const dismissStale = useCallback((key: string) => {
    const current = loadTimers();
    if (current.delete(key)) {
      saveTimers(current);
    }
    setStaleTimers((prev) => prev.filter((s) => s.key !== key));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Initial reconcile shortly after mount
    const initial = window.setTimeout(reconcile, 4000);
    const interval = window.setInterval(reconcile, RECONCILE_INTERVAL_MS);
    const onFocus = () => reconcile();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, reconcile]);

  return { staleTimers, dismissStale, reconcile };
}

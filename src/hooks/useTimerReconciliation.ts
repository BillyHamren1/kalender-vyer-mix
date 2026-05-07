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

export interface ServerOnlyEntry {
  key: string;
  entry: any;
}

export interface ReconcileSyncProblem {
  key: string;
  kind: 'local_only' | 'server_only' | 'stale';
  reason: string;
  timer?: ActiveTimer;
  entry?: any;
}

/**
 * Build canonical server-side timer keys from a `location_time_entries` row.
 * Mirrors the local key scheme used by useWorkSession.resolveTargetKey:
 *   - location-${location_id}
 *   - project-${large_project_id}
 *   - booking-${booking_id}    (NOTE: locally booking timers use the booking_id
 *     as the raw key — we ALSO emit the prefixed form so reconciliation can
 *     compare both representations safely.)
 */
function serverKeysForEntry(entry: any): string[] {
  const keys: string[] = [];
  if (entry?.location_id) keys.push(`location-${entry.location_id}`);
  if (entry?.large_project_id) keys.push(`project-${entry.large_project_id}`);
  if (entry?.booking_id) {
    keys.push(`booking-${entry.booking_id}`);
    keys.push(String(entry.booking_id)); // legacy raw-id key
  }
  return keys;
}

/** Mirror of resolveTargetKey for ActiveTimer (without importing the engine). */
function localKeyVariants(key: string, timer: ActiveTimer): string[] {
  const variants = new Set<string>([key]);
  if (timer.largeProjectId) variants.add(`project-${timer.largeProjectId}`);
  if (timer.locationId) variants.add(`location-${timer.locationId}`);
  if (!timer.largeProjectId && !timer.locationId) {
    // booking timer — local key historically equals the booking_id
    variants.add(`booking-${key}`);
  }
  return Array.from(variants);
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
  const [serverOnlyEntries, setServerOnlyEntries] = useState<ServerOnlyEntry[]>([]);
  const [syncProblems, setSyncProblems] = useState<ReconcileSyncProblem[]>([]);
  const runningRef = useRef(false);

  const reconcile = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const local = loadTimers();

      // Fetch open server entries (last 7 days window, only open ones)
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      let openEntries: any[] = [];
      try {
        const res = await mobileApi.getLocationTimeEntriesLegacy({ date_from: fromDate, limit: 200 });
        openEntries = (res.entries || []).filter((e: any) => !e.exited_at);
      } catch (err) {
        console.warn('[Reconcile] Could not fetch server entries:', err);
        // If we can't reach the server, do not flag — try again next cycle.
        return;
      }

      // Build a server-key index covering location/project/booking entries.
      const serverKeyToEntry = new Map<string, any>();
      for (const e of openEntries) {
        for (const k of serverKeysForEntry(e)) {
          if (!serverKeyToEntry.has(k)) serverKeyToEntry.set(k, e);
        }
      }

      const stale: StaleEntry[] = [];
      const problems: ReconcileSyncProblem[] = [];
      const matchedServerKeys = new Set<string>();
      let mutated = false;
      const next = new Map(local);

      for (const [key, timer] of local) {
        const ageMs = Date.now() - new Date(timer.startTime).getTime();
        const isOld = ageMs > STALE_AGE_MS;

        // Try every key representation this timer could match on the server.
        const variants = localKeyVariants(key, timer);
        const matchedEntry = variants
          .map(v => serverKeyToEntry.get(v))
          .find(Boolean);

        if (matchedEntry) {
          for (const v of variants) {
            if (serverKeyToEntry.has(v)) matchedServerKeys.add(v);
          }
          // Healthy match — clear any prior stale flag.
          if (timer.isStale) {
            const { isStale: _i, staleReason: _r, ...rest } = timer;
            next.set(key, rest as ActiveTimer);
            mutated = true;
          }
          continue;
        }

        // No server match. Only flag once the timer is older than the
        // pending-sync grace window (covers retry storms / queue lag).
        if (isOld) {
          if (!timer.isStale) {
            next.set(key, { ...timer, isStale: true, staleReason: 'no_server_match' });
            mutated = true;
          }
          const flagged = next.get(key)!;
          stale.push({ key, timer: flagged });
          problems.push({
            key,
            kind: 'local_only',
            reason: 'no_server_match',
            timer: flagged,
          });
        }
      }

      // Server-only: open server entries that no local timer represents.
      const serverOnly: ServerOnlyEntry[] = [];
      for (const [k, e] of serverKeyToEntry) {
        if (matchedServerKeys.has(k)) continue;
        // Avoid emitting the same entry twice via its alternate keys.
        const alt = serverKeysForEntry(e);
        if (alt.some(a => matchedServerKeys.has(a))) continue;
        // Prefer the canonical (prefixed) representation.
        const canonical = alt[0] || k;
        if (serverOnly.some(s => s.key === canonical)) continue;
        serverOnly.push({ key: canonical, entry: e });
        problems.push({
          key: canonical,
          kind: 'server_only',
          reason: 'open_server_entry_without_local_timer',
          entry: e,
        });
      }

      if (mutated) saveTimers(next);
      setStaleTimers(stale);
      setServerOnlyEntries(serverOnly);
      setSyncProblems(problems);
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
    setSyncProblems((prev) => prev.filter((p) => p.key !== key));
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

  return { staleTimers, serverOnlyEntries, syncProblems, dismissStale, reconcile };
}

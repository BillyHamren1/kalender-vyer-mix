/**
 * useWorkDayTimer — server-driven day timer.
 *
 * SOURCE OF TRUTH: the `workdays` table, exposed via `useWorkDay`.
 *
 * Architectural rule (workday-first, post 2026-04-22):
 *   The workday is PRIMARY. Activity timers (project/travel/warehouse/
 *   location) are SECONDARY segments. This hook NEVER derives the day
 *   from active timers. It reads the open WorkdayRecord from the server
 *   and ticks the elapsed-seconds clock.
 *
 * Local cache (`eventflow-workday-cache`) is kept as a thin first-render
 * fallback so the header pill doesn't blink to "off" while the network
 * round-trip resolves on cold start. It is OVERWRITTEN by server state
 * on first response and is never the canonical source.
 *
 * The legacy `eventflow-workday-start` key (which used to be derived from
 * the earliest active timer) is no longer read here. It is left in
 * localStorage so an in-flight EOD pipeline can finish unaware, but it
 * has no effect on what this hook reports.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { useWorkDay } from '@/hooks/useWorkDay';
import {
  hasWorkdayEndedToday,
  WORKDAY_ENDED_STATE_CHANGED_EVENT,
} from '@/services/workdayState';

const CACHE_KEY = 'eventflow-workday-cache';

interface CachedWorkday {
  startedAt: string;
  endedAt: string | null;
}

function readCache(): CachedWorkday | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWorkday;
    if (!parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(record: CachedWorkday | null) {
  try {
    if (record) localStorage.setItem(CACHE_KEY, JSON.stringify(record));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function useWorkDayTimer() {
  const { current } = useWorkDay();
  const [cache, setCache] = useState<CachedWorkday | null>(() => readCache());
  const [, setTick] = useState(0);

  // Mirror server state into the cache so the next cold render is instant.
  useEffect(() => {
    if (current) {
      const next: CachedWorkday = {
        startedAt: current.started_at,
        endedAt: current.ended_at,
      };
      writeCache(next);
      setCache(next);
    } else {
      // Server says no open workday. Honour it — clear cache.
      writeCache(null);
      setCache(null);
    }
  }, [current?.id, current?.started_at, current?.ended_at, current]);

  // Clear cache on explicit workday-ended UI hint (banner/EOD pipeline).
  useEffect(() => {
    const onEnded = () => {
      writeCache(null);
      setCache(null);
    };
    const onStateChanged = () => {
      if (hasWorkdayEndedToday() && !current) {
        writeCache(null);
        setCache(null);
      }
    };
    window.addEventListener('workday-ended', onEnded);
    window.addEventListener(WORKDAY_ENDED_STATE_CHANGED_EVENT, onStateChanged);
    return () => {
      window.removeEventListener('workday-ended', onEnded);
      window.removeEventListener(WORKDAY_ENDED_STATE_CHANGED_EVENT, onStateChanged);
    };
  }, [current]);

  // Resolve the start ISO. Server wins; cache is only used pre-first-response.
  const startIso = useMemo<string | null>(() => {
    if (current && !current.ended_at) return current.started_at;
    if (current && current.ended_at) return null;
    // current === null → either still loading, or genuinely no open workday.
    // Use cache as a pre-resolve hint.
    if (cache && !cache.endedAt) return cache.startedAt;
    return null;
  }, [current, cache]);

  // Tick once per second to refresh the displayed elapsed time.
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [startIso]);

  const elapsedSeconds = startIso
    ? Math.max(0, differenceInSeconds(new Date(), parseISO(startIso)))
    : 0;

  /**
   * UI hint only — clears local cache and broadcasts the legacy event.
   * The actual server-side end happens via `workday.end` in the EOD
   * pipeline (GlobalActiveTimerBanner → syncWorkDayEnd).
   */
  const endWorkDay = useCallback(() => {
    writeCache(null);
    setCache(null);
    window.dispatchEvent(new CustomEvent('workday-ended'));
  }, []);

  return {
    isActive: !!startIso,
    startIso,
    elapsedSeconds,
    endWorkDay,
  };
}

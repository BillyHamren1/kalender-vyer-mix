import { useEffect, useState, useCallback, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';

export interface ArrivalState {
  should_prompt: boolean;
  arrived_at: string | null;
  location_id: string | null;
  location_name: string | null;
  prompts_sent: number;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls the server for "should I show an arrival prompt?".
 * Same source-of-truth used by the push-cron job, so logic is identical
 * regardless of whether the user opens the app via push or manually.
 *
 * Returns the current state and a `markResolved()` to flag the prompt
 * as handled (e.g. after timer is started or user dismissed).
 */
export function useArrivalPrompt(staffAuthenticated: boolean) {
  const [state, setState] = useState<ArrivalState | null>(null);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const fetchState = useCallback(async () => {
    if (!staffAuthenticated) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await mobileApi.getArrivalState();
      setState(result);
    } catch (err) {
      // Network errors are non-fatal — we'll retry on next interval
      console.warn('[useArrivalPrompt] fetch failed:', err);
    } finally {
      inFlightRef.current = false;
    }
  }, [staffAuthenticated]);

  useEffect(() => {
    if (!staffAuthenticated) {
      setState(null);
      return;
    }

    // Initial fetch
    fetchState();

    // Poll every 60s
    intervalRef.current = window.setInterval(fetchState, POLL_INTERVAL_MS);

    // Re-fetch when the app becomes visible (push-tap, tab focus)
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchState();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [staffAuthenticated, fetchState]);

  const markResolved = useCallback(async (locationId: string, arrivedAt: string) => {
    try {
      await mobileApi.markArrivalResolved({ location_id: locationId, arrived_at: arrivedAt });
    } catch (err) {
      console.warn('[useArrivalPrompt] markResolved failed:', err);
    }
    setState((prev) => (prev ? { ...prev, should_prompt: false } : prev));
  }, []);

  return { state, refresh: fetchState, markResolved };
}

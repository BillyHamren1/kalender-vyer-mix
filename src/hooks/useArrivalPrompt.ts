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
 * `pausePolling` should be true while the user is interacting with the
 * arrival dialog so polling doesn't yank state from under them.
 */
export function useArrivalPrompt(staffAuthenticated: boolean, pausePolling = false) {
  const [state, setState] = useState<ArrivalState | null>(null);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pauseRef = useRef(pausePolling);

  useEffect(() => { pauseRef.current = pausePolling; }, [pausePolling]);

  const fetchState = useCallback(async (force = false) => {
    if (!staffAuthenticated) return;
    if (!force && pauseRef.current) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await mobileApi.getArrivalState();
      setState(result);
    } catch (err) {
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

    fetchState(true);

    intervalRef.current = window.setInterval(() => fetchState(false), POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchState(false);
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

  return { state, refresh: () => fetchState(true), markResolved };
}

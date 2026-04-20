import { useEffect, useState, useCallback, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import type { ArrivalState, ArrivalTarget } from '@/types/arrivalTarget';

export type { ArrivalState, ArrivalTarget } from '@/types/arrivalTarget';

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls the server for "should I show an arrival prompt?".
 *
 * UNIFIED: works identically for fixed locations, large projects and
 * plain bookings. Always read `state.target` — the legacy `location_*`
 * fields are kept only so older code paths keep compiling and now mirror
 * `target` when `target.kind === 'location'`.
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
      // Normalize: ensure `target` is present even on legacy responses.
      const target: ArrivalTarget | null = result.target
        ? (result.target as ArrivalTarget)
        : (result.location_id && result.arrived_at)
          ? {
              kind: 'location',
              target_id: result.location_id,
              label: result.location_name || 'Arbetsplats',
              arrived_at: result.arrived_at,
            }
          : null;
      setState({
        should_prompt: !!result.should_prompt,
        target,
        prompts_sent: result.prompts_sent ?? 0,
        arrived_at: result.arrived_at ?? null,
        location_id: result.location_id ?? null,
        location_name: result.location_name ?? null,
      });
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

  /**
   * Resolve an arrival prompt server-side. Accepts the unified target.
   * Falls back to the legacy location-only API when target.kind === 'location'
   * for backward compatibility with older server builds.
   */
  const markResolved = useCallback(async (target: ArrivalTarget) => {
    try {
      await mobileApi.markArrivalResolved({
        target_type: target.kind,
        target_id: target.target_id,
        arrived_at: target.arrived_at,
      });
    } catch (err) {
      console.warn('[useArrivalPrompt] markResolved failed:', err);
    }
    setState((prev) => (prev ? { ...prev, should_prompt: false } : prev));
  }, []);

  return { state, refresh: () => fetchState(true), markResolved };
}

// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
/**
 * useActiveDayState — server-driven snapshot of the current workday + any
 * open location_time_entries for the logged-in mobile staff. Used by the
 * mobile shell to guarantee that an open server row is NEVER invisible
 * just because localStorage is missing it, and to surface stale-ping /
 * pending-sync hints distinctly from the workday itself.
 *
 * Polled every 30s and on focus. Cheap (≤200 ms server round-trip).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export type ActiveDayOpenEntry = {
  id: string;
  target_kind: 'location' | 'booking' | 'large_project' | 'unknown';
  target_id: string | null;
  target_label: string;
  entered_at: string;
  source: string | null;
  metadata?: Record<string, any>;
  auto_started?: boolean;
  auto_start_source?: string | null;
  confidence?: string | null;
  latest_ping_at?: string | null;
  latest_ping_age_ms?: number | null;
  stale_ping?: boolean;
  last_known_arrival_at?: string | null;
  last_known_departure_at?: string | null;
  departure_detected?: boolean;
  suggested_stop_at?: string | null;
  status?: 'active_on_site' | 'active_but_left_site' | 'active_signal_lost' | 'active_unknown';
  correction_actions?: Array<'stop_now' | 'stop_from_departure' | 'change_target' | 'mark_not_work'>;
};

export interface ActiveDayState {
  workday: { id: string; started_at: string; ended_at: string | null; review_status: string | null } | null;
  open_entries: ActiveDayOpenEntry[];
  latest_ping: { latitude: number | null; longitude: number | null; accuracy: number | null; updated_at: string } | null;
  latest_ping_age_ms: number | null;
  stale_ping: boolean;
  anomalies: any[];
  server_time: string;
}

interface UseActiveDayStateResult {
  state: ActiveDayState | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 30 * 1000;

export function useActiveDayState(): UseActiveDayStateResult {
  const { staff } = useMobileAuth();
  const staffId = staff?.id ?? null;
  const [state, setState] = useState<ActiveDayState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!staffId) { setState(null); return; }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const res = await mobileApi.getActiveDayStateLegacy();
      setState(res as ActiveDayState);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load active day state');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId]);

  useEffect(() => {
    if (!staffId) return;
    void refresh();
    const interval = window.setInterval(refresh, POLL_MS);
    const onFocus = () => { void refresh(); };
    const onTimerChange = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('timer-state-changed', onTimerChange);
    window.addEventListener('workday-started', onTimerChange);
    window.addEventListener('workday-ended', onTimerChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('timer-state-changed', onTimerChange);
      window.removeEventListener('workday-started', onTimerChange);
      window.removeEventListener('workday-ended', onTimerChange);
    };
  }, [staffId, refresh]);

  return { state, isLoading, error, refresh };
}

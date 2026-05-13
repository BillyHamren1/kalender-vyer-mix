// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
/**
 * useWorkDay — React hook for the server-anchored workday.
 *
 * UNIFIED MODEL (Tidappen):
 *   1. Dagtimer (workday) = HUVUDSPÅR.
 *      Startas av:
 *        - manuell "Starta dagen" (start())
 *        - eller riktig geofence/start-action via central startkedja
 *          (useTimerStartFlow → ensureActive())
 *      App-open ska ALDRIG implicit starta arbetsdag.
 *   2. Aktivitetstid (projekt/plats/bokning) = INUTI dagen.
 *      Att starta/stoppa en aktivitet skapar/avslutar inte själva dagen.
 *   3. "Avsluta dagen" = SEPARAT, explicit handling (end()).
 *   4. Geofence = SIGNAL.
 *      Central start/stop-logik = ACTION.
 *
 * Pairs with `workday` edge function. Provides:
 *   - current        the open WorkdayRecord (or null)
 *   - start()        idempotent — explicit start (manuell eller via central action)
 *   - end()          idempotent — explicit end (separat handling)
 *   - ensureActive() Awaitable. Returns the open workday (existing or
 *                    freshly created). De-dupes concurrent calls so a burst
 *                    of activity-starts via the central start chain can all
 *                    `await ensureActive()` safely.
 *                    NOTE: Får anropas BARA från central startkedja eller
 *                    explicit user-action — aldrig från app-open/bootstrap.
 *   - restore()      explicit alias for refresh — used at app mount to read
 *                    existing day from server. Skapar ALDRIG ny workday.
 *   - isLoading
 *
 * Architectural rule:
 *   The workday is the PRIMARY signal. Activity timers (project/travel/
 *   warehouse/location) are SECONDARY segments on top of the workday.
 *   The frontend MUST NOT derive the workday from active timers, and
 *   stopping an activity MUST NOT end the workday.
 *
 * Realtime: subscribes to postgres_changes on the `workdays` table for
 * the current staff so other tabs / devices see updates immediately.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import {
  workdayApi,
  type WorkdayRecord,
  type StartWorkdayInput,
  type EndWorkdayInput,
} from '@/services/workdayApi';
import { setWorkdayActive } from '@/lib/workday/workdayActiveSignal';

export interface UseWorkDayResult {
  current: WorkdayRecord | null;
  isLoading: boolean;
  error: string | null;
  start: (input?: StartWorkdayInput) => Promise<WorkdayRecord | null>;
  end: (input?: EndWorkdayInput) => Promise<WorkdayRecord | null>;
  /**
   * Workday-first guarantee. Returns the active workday, creating one if
   * none exists. Idempotent on the server. De-duped locally so callers
   * can `await` it from inside burst-y start flows.
   */
  ensureActive: (startedAtIso?: string) => Promise<WorkdayRecord | null>;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useWorkDay(): UseWorkDayResult {
  const { staff } = useMobileAuth();
  const staffId = staff?.id ?? null;

  const [current, setCurrent] = useState<WorkdayRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightStart = useRef<Promise<WorkdayRecord | null> | null>(null);
  const inFlightEnsure = useRef<Promise<WorkdayRecord | null> | null>(null);
  const currentRef = useRef<WorkdayRecord | null>(null);

  useEffect(() => {
    currentRef.current = current;
    setWorkdayActive(!!current && !current.ended_at);
  }, [current]);

  const refresh = useCallback(async () => {
    if (!staffId) {
      setCurrent(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await workdayApi.current();
      setCurrent(res.workday);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load workday');
    } finally {
      setIsLoading(false);
    }
  }, [staffId]);

  // Initial load + react to staff changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Optimistic end: when endWorkdayFlow / syncWorkDayEnd succeeds it
  // dispatches 'workday-ended'. Realtime catches up eventually but can
  // lag a few seconds; clearing locally here gives instant UI feedback
  // (header timer disappears, "Avsluta dagen" → "Starta dagen") so the
  // user sees that the press worked.
  useEffect(() => {
    const onEnded = () => setCurrent(null);
    window.addEventListener('workday-ended', onEnded);
    return () => window.removeEventListener('workday-ended', onEnded);
  }, []);

  // Optimistic start: multiple components (header clock, bottom CTA, etc.)
  // each call useWorkDay() separately. A local setCurrent() inside one hook
  // instance does NOT update the others until realtime arrives. Broadcast the
  // freshly started workday so every mounted consumer flips to active
  // immediately and the day clock appears without requiring an app restart.
  useEffect(() => {
    const onStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ workday?: WorkdayRecord | null }>).detail;
      if (detail?.workday && !detail.workday.ended_at) {
        setCurrent(detail.workday);
      }
    };
    window.addEventListener('workday-started', onStarted as EventListener);
    return () => window.removeEventListener('workday-started', onStarted as EventListener);
  }, []);

  // Realtime subscription — listen for workdays for this staff.
  useEffect(() => {
    if (!staffId) return;
    const channel = supabase
      .channel(`workdays:${staffId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workdays', filter: `staff_id=eq.${staffId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as WorkdayRecord | null;
          if (!row) return;
          // If a row gets ended → clear current. If a new open row arrives → set.
          if (payload.eventType === 'DELETE') {
            setCurrent((c) => (c?.id === row.id ? null : c));
            return;
          }
          if (row.ended_at) {
            setCurrent((c) => (c?.id === row.id ? null : c));
            // Server-side close (e.g. AI auto-stop or nightly watchdog) →
            // mirror the same event the explicit end-flow dispatches so the
            // header day-clock pill can clear its localStorage and the rest
            // of the UI flips to "Starta dagen".
            window.dispatchEvent(
              new CustomEvent('workday-ended', { detail: { endedAtIso: row.ended_at } })
            );
          } else {
            setCurrent(row);
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffId]);

  const start = useCallback(
    async (input: StartWorkdayInput = {}): Promise<WorkdayRecord | null> => {
      if (!staffId) return null;
      // De-dupe concurrent start calls (timer-start storm at app boot).
      if (inFlightStart.current) return inFlightStart.current;
      const p = (async () => {
        try {
          const res = await workdayApi.start(input);
          if (res.workday) {
            setCurrent(res.workday);
            window.dispatchEvent(new CustomEvent('workday-started', { detail: { workday: res.workday } }));
          }
          setError(null);
          return res.workday;
        } catch (err: any) {
          setError(err?.message || 'Failed to start workday');
          return null;
        } finally {
          inFlightStart.current = null;
        }
      })();
      inFlightStart.current = p;
      return p;
    },
    [staffId]
  );

  const end = useCallback(
    async (input: EndWorkdayInput = {}): Promise<WorkdayRecord | null> => {
      if (!staffId) return null;
      try {
        const res = await workdayApi.end(input);
        setCurrent(null);
        setError(null);
        return res.workday;
      } catch (err: any) {
        setError(err?.message || 'Failed to end workday');
        return null;
      }
    },
    [staffId]
  );

  /**
   * Workday-first guarantee. Returns the active workday, creating one if
   * none is open. The server is idempotent; we additionally short-circuit
   * locally if we already know about an open workday so the happy path
   * (workday already running) costs zero network.
   */
  const ensureActive = useCallback(
    async (startedAtIso?: string): Promise<WorkdayRecord | null> => {
      if (!staffId) return null;
      // Fast path — local cache already shows an open workday.
      if (currentRef.current && !currentRef.current.ended_at) {
        return currentRef.current;
      }
      // De-dupe concurrent ensure-calls.
      if (inFlightEnsure.current) return inFlightEnsure.current;
      const p = (async () => {
        try {
          const res = await workdayApi.start(
            startedAtIso ? { startedAtIso } : {}
          );
          if (res.workday) {
            setCurrent(res.workday);
            window.dispatchEvent(new CustomEvent('workday-started', { detail: { workday: res.workday } }));
          }
          setError(null);
          return res.workday;
        } catch (err: any) {
          setError(err?.message || 'Failed to ensure workday');
          return null;
        } finally {
          inFlightEnsure.current = null;
        }
      })();
      inFlightEnsure.current = p;
      return p;
    },
    [staffId]
  );

  return {
    current,
    isLoading,
    error,
    start,
    end,
    ensureActive,
    restore: refresh,
    refresh,
  };
}

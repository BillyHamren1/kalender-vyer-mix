/**
 * useWorkDay — React hook for the server-anchored workday.
 *
 * Pairs with `workday` edge function. Provides:
 *   - current   the open WorkdayRecord (or null)
 *   - start()   idempotent — safe to call on every timer-start
 *   - end()     idempotent — safe to call after EOD-queue drains
 *   - isLoading
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

export interface UseWorkDayResult {
  current: WorkdayRecord | null;
  isLoading: boolean;
  error: string | null;
  start: (input?: StartWorkdayInput) => Promise<WorkdayRecord | null>;
  end: (input?: EndWorkdayInput) => Promise<WorkdayRecord | null>;
  refresh: () => Promise<void>;
}

export function useWorkDay(): UseWorkDayResult {
  const { staff } = useMobileAuth();
  const staffId = staff?.id ?? null;

  const [current, setCurrent] = useState<WorkdayRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightStart = useRef<Promise<WorkdayRecord | null> | null>(null);

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
          if (res.workday) setCurrent(res.workday);
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

  return { current, isLoading, error, start, end, refresh };
}

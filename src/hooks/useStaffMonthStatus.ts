/**
 * useStaffMonthStatus(month)
 * ==========================
 * Single official entrypoint the Time-page calendar tab uses for **per-day
 * status across a month**. The mobile app must not aggregate workdays /
 * time_reports / travel_logs itself — backend (`get-staff-month-status`
 * Edge Function) owns the truth. Until that endpoint exists this hook is a
 * **forward-compatible stub**: it returns a stable empty result so the UI
 * can already render the structure (calendar grid, day badges, totals)
 * without any local recombination.
 *
 * When the backend lands, switch the body to call
 * `supabase.functions.invoke('get-staff-month-status', { body: { staffId, month } })`
 * and emit the same `StaffMonthStatus` shape — no UI changes required.
 *
 * Realtime: same pattern as `useStaffDaySnapshot` — subscribe to the
 * underlying tables and trigger a refetch only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export interface StaffMonthDayStatus {
  /** yyyy-MM-dd */
  date: string;
  workdayMinutes: number;
  allocatedProjectMinutes: number;
  travelMinutes: number;
  unallocatedMinutes: number;
  isWorkdayOpen: boolean;
  hasFlags: boolean;
  reviewStatus: string | null;
}

export interface StaffMonthStatus {
  /** yyyy-MM (the month bucket the data describes) */
  month: string;
  staffId: string;
  days: StaffMonthDayStatus[];
  totals: {
    workdayMinutes: number;
    allocatedProjectMinutes: number;
    travelMinutes: number;
    unallocatedMinutes: number;
  };
  lastUpdatedAt: string;
}

interface Result {
  status: StaffMonthStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 60_000;

export function useStaffMonthStatus(month?: Date | string): Result {
  const { staff } = useMobileAuth();
  const staffId = staff?.id ?? null;
  const monthKey = useMemo(() => {
    const d =
      typeof month === 'string' ? new Date(`${month}-01`) : month ?? new Date();
    return format(startOfMonth(d), 'yyyy-MM');
  }, [month]);

  const [status, setStatus] = useState<StaffMonthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!staffId) {
      setStatus(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      // Backend endpoint not yet implemented — emit a stable empty
      // structure so the UI renders without local aggregation.
      // When `get-staff-month-status` ships, replace this block with:
      //
      //   const { data, error: invokeErr } = await supabase.functions.invoke(
      //     'get-staff-month-status', { body: { staffId, month: monthKey } }
      //   );
      //   if (invokeErr) throw invokeErr;
      //   setStatus(data as StaffMonthStatus);
      setStatus({
        month: monthKey,
        staffId,
        days: [],
        totals: {
          workdayMinutes: 0,
          allocatedProjectMinutes: 0,
          travelMinutes: 0,
          unallocatedMinutes: 0,
        },
        lastUpdatedAt: new Date().toISOString(),
      });
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda månadsstatus');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId, monthKey]);

  useEffect(() => {
    if (!staffId) return;
    void refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [staffId, refresh]);

  // Realtime — when backend lands, refetch on changes to the raw tables.
  useEffect(() => {
    if (!staffId) return;
    const channel = supabase.channel(`staff-month-status:${staffId}:${monthKey}`);
    for (const table of [
      'workdays',
      'time_reports',
      'travel_time_logs',
      'workday_flags',
    ] as const) {
      (channel as any).on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `staff_id=eq.${staffId}` },
        () => {
          void refresh();
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffId, monthKey, refresh]);

  return { status, isLoading, error, refresh };
}

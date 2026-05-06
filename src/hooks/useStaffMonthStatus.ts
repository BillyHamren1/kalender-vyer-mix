/**
 * useStaffMonthStatus(month)
 * ==========================
 * Backend-owned per-day status across a calendar month. Calls the
 * `get-staff-month-status` Edge Function — the mobile app must NOT
 * aggregate workdays / time_reports / travel_logs itself.
 *
 * Realtime: subscribes to the underlying tables (staff-scoped) and uses
 * the events purely as triggers to refetch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export type StaffMonthDayKind =
  | 'open'
  | 'approved'
  | 'review_required'
  | 'closed'
  | 'missing'
  | 'off'
  | 'locked';

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
  approved: boolean;
  status: StaffMonthDayKind;
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
    approvedMinutes: number;
    pendingReviewMinutes: number;
    daysWithFlags: number;
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
const REALTIME_TABLES = [
  'workdays',
  'time_reports',
  'travel_time_logs',
  'location_time_entries',
  'workday_flags',
  'assistant_events',
] as const;

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
  const debounce = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!staffId) {
      setStatus(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'get-staff-month-status',
        { body: { staffId, month: monthKey } },
      );
      if (invokeErr) throw invokeErr;
      if (data?.error) throw new Error(data.error);
      setStatus(data as StaffMonthStatus);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda månadsstatus');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId, monthKey]);

  const scheduleRefresh = useCallback(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => { void refresh(); }, 400);
  }, [refresh]);

  useEffect(() => {
    if (!staffId) return;
    void refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [staffId, refresh]);

  useEffect(() => {
    if (!staffId) return;
    const channel = supabase.channel(`staff-month-status:${staffId}:${monthKey}`);
    for (const table of REALTIME_TABLES) {
      (channel as any).on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `staff_id=eq.${staffId}` },
        scheduleRefresh,
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [staffId, monthKey, scheduleRefresh]);

  return { status, isLoading, error, refresh };
}

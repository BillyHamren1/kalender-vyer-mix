/**
 * useStaffMonthStatus(month)
 * ==========================
 * Backend-owned per-day status across a calendar month. Calls the
 * `get-staff-month-status` Edge Function — the mobile app must NOT
 * aggregate workdays / time_reports / travel_logs itself.
 *
 * The shapes mirror `DaySummary` and `SummarizedTotals` from
 * `supabase/functions/_shared/day-snapshot-range.ts` so backend is the
 * single source of truth.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export type StaffMonthDayKind =
  | 'empty'
  | 'open'
  | 'needs_attest'
  | 'needs_action'
  | 'attested'
  | 'approved';

export interface StaffMonthDayStatus {
  /** yyyy-MM-dd */
  date: string;
  weekday: number;
  grossWorkdayMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  projectMinutes: number;
  warehouseMinutes: number;
  transportMinutes: number;
  otherPlaceMinutes: number;
  isWorkdayOpen: boolean;
  approved: boolean;
  attested: boolean;
  actionsCount: number;
  status: StaffMonthDayKind;
}

export interface StaffMonthTotals {
  grossWorkdayMinutes: number;
  breakMinutes: number;
  manualDeductionMinutes: number;
  payableMinutes: number;
  approvedPayableMinutes: number;
  /** Inskickat av användare men ej godkänt av admin. */
  submittedPayableMinutes: number;
  /** Ej inskickat av användare. */
  awaitingUserAttestPayableMinutes: number;
  /** Alias/fallback (deprecated) — speglar awaitingUserAttestPayableMinutes. */
  awaitingAttestPayableMinutes: number;
  daysWithActions: number;
  daysWithWork: number;
  projectMinutes: number;
  warehouseMinutes: number;
  transportMinutes: number;
  otherPlaceMinutes: number;
}

export interface StaffMonthStatus {
  /** yyyy-MM */
  month: string;
  staffId: string;
  days: StaffMonthDayStatus[];
  totals: StaffMonthTotals;
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
  'staff_day_report_cache',
  'staff_day_submissions',
] as const;

export function useStaffMonthStatus(month?: Date | string): Result {
  const { effectiveStaffId } = useMobileAuth();
  const staffId = effectiveStaffId;
  const monthKey = useMemo(() => {
    const d =
      typeof month === 'string' ? new Date(`${month}-01`) : month ?? new Date();
    return format(startOfMonth(d), 'yyyy-MM');
  }, [month]);
  const bounds = useMemo(() => {
    const d =
      typeof month === 'string' ? new Date(`${month}-01`) : month ?? new Date();
    return {
      startDate: format(startOfMonth(d), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(d), 'yyyy-MM-dd'),
    };
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
      const data = await callStaffSnapshotFunction<StaffMonthStatus>(
        'get-staff-month-status',
        { staffId, month: monthKey },
      );
      setStatus(data);
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
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('timer-state-changed', scheduleRefresh);
    window.addEventListener('workday-started', scheduleRefresh);
    window.addEventListener('workday-ended', scheduleRefresh);
    window.addEventListener('staff-day-attested', scheduleRefresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('timer-state-changed', scheduleRefresh);
      window.removeEventListener('workday-started', scheduleRefresh);
      window.removeEventListener('workday-ended', scheduleRefresh);
      window.removeEventListener('staff-day-attested', scheduleRefresh);
    };
  }, [staffId, refresh, scheduleRefresh]);

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

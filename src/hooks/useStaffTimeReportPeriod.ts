/**
 * useStaffTimeReportPeriod(period)
 * ================================
 * Single official entrypoint the Time-page "Tidrapport" tab uses for the
 * **per-period summary** (week or month) the user submits / reviews. Truth
 * is owned by backend (`get-staff-time-report-period` Edge Function).
 *
 * Until that endpoint exists this hook is a **forward-compatible stub**:
 * it exposes the shape (totals, status, rows) that the UI binds to, but
 * returns an empty stable result. UI must NOT recombine raw tables.
 *
 * When backend lands, swap the implementation to call the function — no
 * UI changes needed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export type StaffPeriodKind = 'week' | 'month';

export interface StaffTimeReportPeriodInput {
  kind: StaffPeriodKind;
  /** Any date inside the desired period; the hook normalizes the bounds. */
  anchor: Date | string;
}

export interface StaffTimeReportPeriodTotals {
  workMinutes: number;
  overtimeMinutes: number;
  travelMinutes: number;
  unallocatedMinutes: number;
}

export interface StaffTimeReportRow {
  /** Stable backend id — never rebuilt client-side. */
  id: string;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  hoursWorked: number;
  overtimeHours: number;
  breakHours: number;
  approved: boolean;
  jobLabel: string;
  jobKind: 'booking' | 'project' | 'location' | 'unknown';
  bookingId: string | null;
  largeProjectId: string | null;
  description: string | null;
}

export interface StaffTimeReportPeriod {
  kind: StaffPeriodKind;
  /** yyyy-MM-dd inclusive */
  startDate: string;
  /** yyyy-MM-dd inclusive */
  endDate: string;
  staffId: string;
  status: 'draft' | 'submitted' | 'approved' | 'mixed' | 'empty';
  totals: StaffTimeReportPeriodTotals;
  rows: StaffTimeReportRow[];
  /** Per-day list from backend snapshot. UI binds, never recomputes. */
  days?: Array<Record<string, unknown>>;
  /** Reasons the period is not yet ready to submit. */
  blockers?: Array<{ date: string; type: string; message: string }>;
  lastUpdatedAt: string;
}

interface Result {
  period: StaffTimeReportPeriod | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 60_000;

function periodBounds(input: StaffTimeReportPeriodInput): {
  startDate: string;
  endDate: string;
} {
  const anchor =
    typeof input.anchor === 'string' ? new Date(input.anchor) : input.anchor;
  if (input.kind === 'week') {
    return {
      startDate: format(startOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      endDate: format(endOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
  }
  return {
    startDate: format(startOfMonth(anchor), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(anchor), 'yyyy-MM-dd'),
  };
}

export function useStaffTimeReportPeriod(
  input: StaffTimeReportPeriodInput,
): Result {
  const { staff } = useMobileAuth();
  const staffId = staff?.id ?? null;
  const { startDate, endDate } = useMemo(() => periodBounds(input), [input]);

  const [period, setPeriod] = useState<StaffTimeReportPeriod | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const debounce = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!staffId) {
      setPeriod(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'get-staff-time-report-period',
        { body: { staffId, kind: input.kind, startDate, endDate } },
      );
      if (invokeErr) throw invokeErr;
      if (data?.error) throw new Error(data.error);
      // Backend returns { period:{kind,startDate,endDate}, staffId, totals, days, blockers, status, lastUpdatedAt }.
      // Flatten into the consumer shape — UI must NOT recompute totals.
      setPeriod({
        kind: data?.period?.kind ?? input.kind,
        startDate: data?.period?.startDate ?? startDate,
        endDate: data?.period?.endDate ?? endDate,
        staffId,
        status: data?.status ?? 'empty',
        totals: {
          workMinutes: data?.totals?.workMinutes ?? 0,
          overtimeMinutes: data?.totals?.overtimeMinutes ?? 0,
          travelMinutes: data?.totals?.travelMinutes ?? 0,
          unallocatedMinutes: data?.totals?.unallocatedMinutes ?? 0,
        },
        rows: [],
        days: data?.days ?? [],
        blockers: data?.blockers ?? [],
        lastUpdatedAt: data?.lastUpdatedAt ?? new Date().toISOString(),
      } as StaffTimeReportPeriod);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda perioden');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId, input.kind, startDate, endDate]);

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
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('timer-state-changed', scheduleRefresh);
      window.removeEventListener('workday-started', scheduleRefresh);
      window.removeEventListener('workday-ended', scheduleRefresh);
    };
  }, [staffId, refresh, scheduleRefresh]);

  useEffect(() => {
    if (!staffId) return;
    const channel = supabase.channel(
      `staff-period:${staffId}:${input.kind}:${startDate}`,
    );
    for (const table of [
      'workdays',
      'time_reports',
      'travel_time_logs',
      'location_time_entries',
      'workday_flags',
      'assistant_events',
    ] as const) {
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
  }, [staffId, input.kind, startDate, scheduleRefresh]);

  return { period, isLoading, error, refresh };
}

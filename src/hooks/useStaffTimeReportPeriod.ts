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

  const refresh = useCallback(async () => {
    if (!staffId) {
      setPeriod(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      // Backend endpoint not yet implemented. Emit a stable empty
      // structure so the UI binds without local aggregation. When
      // `get-staff-time-report-period` ships, replace with:
      //
      //   const { data, error: invokeErr } = await supabase.functions.invoke(
      //     'get-staff-time-report-period',
      //     { body: { staffId, kind: input.kind, startDate, endDate } },
      //   );
      //   if (invokeErr) throw invokeErr;
      //   setPeriod(data as StaffTimeReportPeriod);
      setPeriod({
        kind: input.kind,
        startDate,
        endDate,
        staffId,
        status: 'empty',
        totals: {
          workMinutes: 0,
          overtimeMinutes: 0,
          travelMinutes: 0,
          unallocatedMinutes: 0,
        },
        rows: [],
        lastUpdatedAt: new Date().toISOString(),
      });
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda perioden');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId, input.kind, startDate, endDate]);

  useEffect(() => {
    if (!staffId) return;
    void refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [staffId, refresh]);

  useEffect(() => {
    if (!staffId) return;
    const channel = supabase.channel(
      `staff-period:${staffId}:${input.kind}:${startDate}`,
    );
    for (const table of [
      'time_reports',
      'travel_time_logs',
      'workdays',
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
  }, [staffId, input.kind, startDate, refresh]);

  return { period, isLoading, error, refresh };
}

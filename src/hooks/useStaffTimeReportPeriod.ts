/**
 * useStaffTimeReportPeriod(period)
 * ================================
 * Single official entrypoint the Time-page "Tidrapport" tab uses for the
 * **per-period summary** (week or month). Truth is owned by backend
 * (`get-staff-time-report-period` Edge Function — same engine as
 * `get-staff-day-status`). UI must NEVER recompute totals from raw tables.
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
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export type StaffPeriodKind = 'week' | 'month';

export interface StaffTimeReportPeriodInput {
  kind: StaffPeriodKind;
  /** Any date inside the desired period; the hook normalizes the bounds. */
  anchor: Date | string;
}

/**
 * Canonical period totals — matches `SummarizedTotals` from
 * `supabase/functions/_shared/day-snapshot-range.ts`.
 */
export interface StaffTimeReportPeriodTotals {
  grossWorkdayMinutes: number;
  breakMinutes: number;
  manualDeductionMinutes: number;
  payableMinutes: number;
  approvedPayableMinutes: number;
  /**
   * Inskickat av användare men ej godkänt av admin.
   */
  submittedPayableMinutes: number;
  /**
   * Ej inskickat av användare (brutto > 0, ingen day_attestation).
   */
  awaitingUserAttestPayableMinutes: number;
  /**
   * Alias/fallback (deprecated) — speglar awaitingUserAttestPayableMinutes.
   */
  awaitingAttestPayableMinutes: number;
  daysWithActions: number;
  daysWithWork: number;
  projectMinutes: number;
  warehouseMinutes: number;
  transportMinutes: number;
  otherPlaceMinutes: number;
}

/**
 * Per-day summary — matches backend `DaySummary` from `day-snapshot-range.ts`.
 */
export interface StaffPeriodDaySummary {
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
  status:
    | 'empty'
    | 'open'
    | 'needs_attest'
    | 'needs_action'
    | 'attested'
    | 'approved';
}

export interface StaffTimeReportPeriod {
  kind: StaffPeriodKind;
  /** yyyy-MM-dd inclusive */
  startDate: string;
  /** yyyy-MM-dd inclusive */
  endDate: string;
  staffId: string;
  status: 'draft' | 'submitted' | 'approved' | 'empty';
  totals: StaffTimeReportPeriodTotals;
  /** Per-day list from backend snapshot. UI binds, never recomputes. */
  days: StaffPeriodDaySummary[];
  /** Reasons the period is not yet ready to submit. */
  blockers: Array<{ date: string; type: string; message: string }>;
  lastUpdatedAt: string;
}

interface Result {
  period: StaffTimeReportPeriod | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 60_000;

const EMPTY_TOTALS: StaffTimeReportPeriodTotals = {
  grossWorkdayMinutes: 0,
  breakMinutes: 0,
  manualDeductionMinutes: 0,
  payableMinutes: 0,
  approvedPayableMinutes: 0,
  submittedPayableMinutes: 0,
  awaitingUserAttestPayableMinutes: 0,
  awaitingAttestPayableMinutes: 0,
  daysWithActions: 0,
  daysWithWork: 0,
  projectMinutes: 0,
  warehouseMinutes: 0,
  transportMinutes: 0,
  otherPlaceMinutes: 0,
};

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

const REALTIME_TABLES = [
  'staff_day_report_cache',
  'staff_day_submissions',
] as const;

export function useStaffTimeReportPeriod(
  input: StaffTimeReportPeriodInput,
): Result {
  const { effectiveStaffId } = useMobileAuth();
  const staffId = effectiveStaffId;
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
      const data: any = await callStaffSnapshotFunction(
        'get-mobile-staff-time-report-period',
        { staffId, kind: input.kind, startDate, endDate },
      );
      const t = data?.totals ?? {};
      setPeriod({
        kind: data?.period?.kind ?? input.kind,
        startDate: data?.period?.startDate ?? startDate,
        endDate: data?.period?.endDate ?? endDate,
        staffId,
        status: data?.status ?? 'empty',
        totals: {
          grossWorkdayMinutes: t.grossWorkdayMinutes ?? 0,
          breakMinutes: t.breakMinutes ?? 0,
          manualDeductionMinutes: t.manualDeductionMinutes ?? 0,
          payableMinutes: t.payableMinutes ?? 0,
          approvedPayableMinutes: t.approvedPayableMinutes ?? 0,
          submittedPayableMinutes: t.submittedPayableMinutes ?? 0,
          awaitingUserAttestPayableMinutes:
            t.awaitingUserAttestPayableMinutes ??
            t.awaitingAttestPayableMinutes ??
            0,
          awaitingAttestPayableMinutes:
            t.awaitingAttestPayableMinutes ??
            t.awaitingUserAttestPayableMinutes ??
            0,
          daysWithActions: t.daysWithActions ?? 0,
          daysWithWork: t.daysWithWork ?? 0,
          projectMinutes: t.projectMinutes ?? 0,
          warehouseMinutes: t.warehouseMinutes ?? 0,
          transportMinutes: t.transportMinutes ?? 0,
          otherPlaceMinutes: t.otherPlaceMinutes ?? 0,
        },
        days: (data?.days ?? []) as StaffPeriodDaySummary[],
        blockers: data?.blockers ?? [],
        lastUpdatedAt: data?.lastUpdatedAt ?? new Date().toISOString(),
      });
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
    const channel = supabase.channel(
      `staff-period:${staffId}:${input.kind}:${startDate}`,
    );
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
  }, [staffId, input.kind, startDate, scheduleRefresh]);

  return { period, isLoading, error, refresh };
}

export const _EMPTY_PERIOD_TOTALS = EMPTY_TOTALS;

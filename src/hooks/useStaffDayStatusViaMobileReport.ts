/**
 * useStaffDayStatusViaMobileReport — drop-in replacement for
 * `useStaffDayStatus` in the mobile Time-app.
 *
 * Reads from `get-mobile-staff-day-report` (Time Engine cache via
 * staff_day_report_cache) and adapts it to the legacy StaffDaySnapshot
 * shape consumed by TodayTab / TimeReportTab / StaffDayDetailSheet.
 *
 * NOTE: this keeps the legacy `useStaffDayStatus` available for any
 * remaining callers, but the mobile day-view tabs go through this hook.
 */
import { useMemo } from 'react';
import { useMobileStaffDayReport } from './useMobileStaffDayReport';
import { mobileReportToDaySnapshot } from '@/lib/staff/mobileReportToDaySnapshot';
import type { StaffDaySnapshot } from './useStaffDaySnapshot';

interface Result {
  snapshot: StaffDaySnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStaffDayStatusViaMobileReport(date?: string): Result {
  const { report, isLoading, error, refresh } = useMobileStaffDayReport(date);
  const snapshot = useMemo(
    () => (report ? mobileReportToDaySnapshot(report) : null),
    [report],
  );
  return { snapshot, isLoading, error, refresh };
}

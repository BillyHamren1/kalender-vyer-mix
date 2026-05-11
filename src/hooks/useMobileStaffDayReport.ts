/**
 * useMobileStaffDayReport — single-source mobile day report.
 *
 * Reads the same Time Engine cache that admin web uses, via the new
 * `get-mobile-staff-day-report` edge function. Replaces useStaffDayStatus
 * for the mobile Time-app rapportvy.
 *
 * Realtime: subscribes to staff_day_report_cache + staff_day_submissions
 * (filtered by staff_id) and uses changes purely as refetch triggers.
 * Does NOT subscribe to legacy time_reports/location_time_entries/travel_time_logs
 * as report sources.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import type { MobileDayReport } from '@/types/mobileDayReport';

interface Result {
  report: MobileDayReport | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 30_000;

export function useMobileStaffDayReport(date?: string): Result {
  const { staff } = useMobileAuth();
  const staffId = staff?.id ?? null;
  const targetDate = date ?? format(new Date(), 'yyyy-MM-dd');
  const [report, setReport] = useState<MobileDayReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const debounce = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!staffId) { setReport(null); return; }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const data = await callStaffSnapshotFunction<MobileDayReport>(
        'get-mobile-staff-day-report',
        { staffId, date: targetDate },
      );
      setReport(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda dagsrapport');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId, targetDate]);

  const scheduleRefresh = useCallback(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => { void refresh(); }, 350);
  }, [refresh]);

  // Initial + interval + focus
  useEffect(() => {
    if (!staffId) return;
    void refresh();
    const interval = window.setInterval(refresh, POLL_MS);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('workday-started', scheduleRefresh);
    window.addEventListener('workday-ended', scheduleRefresh);
    window.addEventListener('staff-day-submitted', scheduleRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('workday-started', scheduleRefresh);
      window.removeEventListener('workday-ended', scheduleRefresh);
      window.removeEventListener('staff-day-submitted', scheduleRefresh);
    };
  }, [staffId, refresh, scheduleRefresh]);

  // Realtime — only the new authoritative tables.
  useEffect(() => {
    if (!staffId) return;
    const channel = supabase.channel(`mobile-day-report:${staffId}:${targetDate}`);
    (channel as any).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'staff_day_report_cache', filter: `staff_id=eq.${staffId}` },
      scheduleRefresh,
    );
    (channel as any).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'staff_day_submissions', filter: `staff_id=eq.${staffId}` },
      scheduleRefresh,
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [staffId, targetDate, scheduleRefresh]);

  return { report, isLoading, error, refresh };
}

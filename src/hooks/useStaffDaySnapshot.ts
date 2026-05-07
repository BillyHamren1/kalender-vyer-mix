/**
 * useStaffDaySnapshot — single source of truth for the mobile app's day view.
 *
 * Calls the `get-staff-day-status` Edge Function which builds a normalized
 * snapshot of {workday, totals, segments, active, flags} from workdays +
 * time_reports + travel_time_logs + location_time_entries + workday_flags
 * + assistant_events. The mobile app must NOT recombine these tables itself.
 *
 * Realtime: we subscribe to the same tables (filtered by staff_id) and use
 * the events purely as triggers to refetch the snapshot. Server stays the
 * authority on what's active/allocated/approved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export type StaffDaySegmentKind =
  | 'project'
  | 'booking'
  | 'travel'
  | 'location'
  | 'warehouse'
  | 'other_place'
  | 'break'
  | 'manual_adjustment'
  | 'unknown'
  | 'active';

export interface StaffDaySegment {
  kind: StaffDaySegmentKind;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  isActive: boolean;
  label: string;
  source: string;
  /** Optional backend-provided status badge (e.g. "Bekräftad arbetsplats"). */
  statusLabel?: string | null;
  refs: {
    timeReportId?: string;
    travelLogId?: string;
    locationEntryId?: string;
    bookingId?: string | null;
    largeProjectId?: string | null;
    locationId?: string | null;
    taskId?: string | null;
  };
  approved?: boolean | null;
}

export interface StaffDayActive {
  kind: 'location' | 'booking' | 'project';
  startedAt: string;
  durationMinutes: number;
  label: string;
  /** Optional backend-provided status text (e.g. "Bekräftad arbetsplats"). */
  statusLabel?: string | null;
  /** Optional backend confidence (0..1). UI must NOT compute this. */
  confidence?: number | null;
  locationEntryId: string;
  bookingId: string | null;
  largeProjectId: string | null;
  locationId: string | null;
}

export interface StaffDayTotals {
  workdayMinutes: number;
  allocatedProjectMinutes: number;
  travelMinutes: number;
  unallocatedMinutes: number;
  liveMinutes: number;
  isWorkdayOpen: boolean;
  /** Optional new totals that backend may send. UI never derives them. */
  breakMinutes?: number | null;
  payableMinutes?: number | null;
  otherPlaceMinutes?: number | null;
  warehouseMinutes?: number | null;
}

export interface StaffDayFlag {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string | null;
  needsUserInput: boolean;
  resolved: boolean;
  source: 'workday_flag' | 'computed';
}

/**
 * Backend-provided action card. UI must NOT invent or hide actions based on
 * its own logic — render exactly what the snapshot says.
 */
export interface StaffDayActionNeeded {
  id: string;
  title: string;
  description?: string | null;
  severity?: 'info' | 'warning' | 'error';
}

/**
 * Optional tracking metadata. Used to show a discreet "Senaste signal HH:MM"
 * — never to render scary "glapp" warnings for missing pings.
 */
export interface StaffDayTrackingPolicy {
  lastSignalAt?: string | null;
  isSignalStale?: boolean;
  signalStaleSinceMin?: number | null;
}

export interface StaffDaySnapshot {
  date: string;
  staffId: string;
  workday: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    isOpen: boolean;
    /** Optional backend status string ("Arbetsdag igång" / "Avslutad" / etc). */
    statusLabel?: string | null;
    reviewStatus: string | null;
    reviewReasons: string[];
    approved: boolean;
    adminNote: string | null;
    durationMinutes: number;
  } | null;
  active: StaffDayActive | null;
  totals: StaffDayTotals;
  segments: StaffDaySegment[];
  flags: StaffDayFlag[];
  /** New: backend tells us what the user must do. UI must not invent. */
  actionsNeeded?: StaffDayActionNeeded[];
  /** New: optional tracking/signal policy. */
  trackingPolicy?: StaffDayTrackingPolicy | null;
  assistantEvents: Array<{
    id: string;
    type: string;
    happenedAt: string;
    label: string | null;
    targetType: string | null;
    targetId: string | null;
    resolutionStatus: string | null;
    stale: boolean;
  }>;
  lastUpdatedAt: string;
}

interface Result {
  snapshot: StaffDaySnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 30_000;
const REALTIME_TABLES = [
  'workdays',
  'time_reports',
  'travel_time_logs',
  'location_time_entries',
  'workday_flags',
  'assistant_events',
] as const;

export function useStaffDaySnapshot(date?: string): Result {
  const { staff } = useMobileAuth();
  const staffId = staff?.id ?? null;
  const targetDate = date ?? format(new Date(), 'yyyy-MM-dd');
  const [snapshot, setSnapshot] = useState<StaffDaySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const debounce = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!staffId) { setSnapshot(null); return; }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const data = await callStaffSnapshotFunction<StaffDaySnapshot>('get-staff-day-status', {
        staffId, date: targetDate,
      });
      setSnapshot(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda dagsstatus');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId, targetDate]);

  // Debounced refetch trigger so realtime bursts don't spam.
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
    window.addEventListener('timer-state-changed', scheduleRefresh);
    window.addEventListener('workday-started', scheduleRefresh);
    window.addEventListener('workday-ended', scheduleRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('timer-state-changed', scheduleRefresh);
      window.removeEventListener('workday-started', scheduleRefresh);
      window.removeEventListener('workday-ended', scheduleRefresh);
    };
  }, [staffId, refresh, scheduleRefresh]);

  // Realtime subscriptions — refetch snapshot when any underlying row changes.
  useEffect(() => {
    if (!staffId) return;
    const channel = supabase.channel(`staff-day-snapshot:${staffId}:${targetDate}`);
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
  }, [staffId, targetDate, scheduleRefresh]);

  return { snapshot, isLoading, error, refresh };
}

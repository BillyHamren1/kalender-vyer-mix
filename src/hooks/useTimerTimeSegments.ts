import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export type TimerTimeSegmentKind =
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'transport'
  | 'unknown_place'
  | 'gps_uncertain';

export interface TimerTimeSegment {
  startTs: string;
  endTs: string;
  durationMin: number;
  kind: TimerTimeSegmentKind;
  label: string;
  matchedSiteId: string | null;
  matchedSiteType: 'project' | 'booking' | 'location' | null;
  confidence: number;
  reason: string;
  pingCount: number;
  distanceMeters: number;
  avgKmh: number | null;
  source: 'gps_classifier';
}

export interface TimerTimeSegmentsResponse {
  timerActive: boolean;
  timerId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  boundTarget?: {
    bookingId: string | null;
    largeProjectId: string | null;
    locationId: string | null;
    source: string | null;
  };
  segments: TimerTimeSegment[];
  summary: { totalMinutes: number; byKind: Record<string, number> };
}

/**
 * useTimerTimeSegments — GPS-only segments clipped to the timer window.
 * Auto-refreshes while a timer is active. Pass an explicit timerId to inspect
 * a finished timer's segments (used by attest/time-report views).
 */
export function useTimerTimeSegments(timerId?: string | null) {
  const query = useQuery<TimerTimeSegmentsResponse>({
    queryKey: ['timer-time-segments', timerId ?? 'active'],
    queryFn: () =>
      callStaffSnapshotFunction<TimerTimeSegmentsResponse>(
        'get-timer-time-segments',
        timerId ? { timerId } : {},
      ),
    refetchInterval: (q) => (q.state.data?.timerActive ? 60_000 : false),
    staleTime: 30_000,
  });

  useEffect(() => {
    const onChange = () => query.refetch();
    window.addEventListener('timer-state-changed', onChange);
    return () => window.removeEventListener('timer-state-changed', onChange);
  }, [query]);

  return query;
}

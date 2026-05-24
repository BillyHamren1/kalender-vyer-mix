/**
 * useStaffGpsWeekSummaryBatch — ett enda anrop hämtar dag-summary för
 * N personer × hela veckan via edge function get-staff-gps-week-summary.
 *
 * Ersätter N × 7 individuella anrop till get-mobile-staff-day-pings när
 * admin tittar på vecko-listan i /staff-management/gps-satellite-map.
 *
 * Aggressiv cache: queryKey inkluderar sorterade staffIds + fromDate/toDate
 * så React Query återanvänder mellan komponenter. staleTime 5 min eftersom
 * historiska pings aldrig ändras och dagens pings inte är tidskritiska i
 * vecko-listan.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export interface StaffGpsWeekDaySummary {
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  placeNames: string[];
}

export interface StaffGpsWeekSummaryBatch {
  summaries: Record<string, Record<string, StaffGpsWeekDaySummary>>;
  generatedAt: string;
}

interface UseBatchResult {
  summaries: Record<string, Record<string, StaffGpsWeekDaySummary>>;
  isLoading: boolean;
  isError: boolean;
}

export function useStaffGpsWeekSummaryBatch(
  staffIds: string[],
  weekDays: Date[],
): UseBatchResult {
  const sortedIds = useMemo(() => [...staffIds].sort(), [staffIds]);
  const fromDate = weekDays[0] ? format(weekDays[0], 'yyyy-MM-dd') : '';
  const toDate = weekDays[weekDays.length - 1]
    ? format(weekDays[weekDays.length - 1], 'yyyy-MM-dd')
    : '';

  const enabled = sortedIds.length > 0 && !!fromDate && !!toDate;

  const query = useQuery({
    queryKey: ['staff-gps-week-summary-batch', sortedIds, fromDate, toDate] as const,
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async (): Promise<StaffGpsWeekSummaryBatch> => {
      // Cast: ny endpoint som inte finns i StaffSnapshotFunctionName-typen ännu.
      return await callStaffSnapshotFunction<StaffGpsWeekSummaryBatch>(
        'get-staff-gps-week-summary' as any,
        { staffIds: sortedIds, fromDate, toDate },
      );
    },
  });

  return {
    summaries: query.data?.summaries ?? {},
    isLoading: !!query.isLoading && enabled,
    isError: !!query.isError,
  };
}

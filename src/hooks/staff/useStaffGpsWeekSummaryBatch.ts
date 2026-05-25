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
import { useQueries, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
import type { StaffGpsDaySnapshot, StaffGpsSnapshotVisit } from '@/types/staffGpsSnapshot';

export interface StaffGpsWeekDayVisit {
  knownSiteId: string | null;
  name: string;
  /** 'location' | 'project' | 'large_project' | 'unknown' */
  type: string;
  inIso: string;
  outIso: string;
  durationMin: number;
}

export interface StaffGpsWeekDaySummary {
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  placeNames: string[];
  visits?: StaffGpsWeekDayVisit[];
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

function visitTypeFromId(id: string | null | undefined): string {
  if (!id) return 'unknown';
  if (id.startsWith('loc:')) return 'location';
  if (id.startsWith('project:')) return 'project';
  if (id.startsWith('large:')) return 'large_project';
  if (id.startsWith('booking:')) return 'project';
  return 'unknown';
}

function summarizeSnapshot(
  snapshot: StaffGpsDaySnapshot | undefined,
  privateIds: Set<string>,
): StaffGpsWeekDaySummary {
  const visits = (snapshot?.visits ?? [])
    .filter((visit: StaffGpsSnapshotVisit) => !(visit.knownSite && privateIds.has(visit.knownSite.id)))
    .sort((a, b) => a.start.localeCompare(b.start));

  const placeNames: string[] = [];
  const seen = new Set<string>();
  const mappedVisits: StaffGpsWeekDayVisit[] = visits.map((visit) => {
    const name = visit.knownSite?.name ?? 'Okänd plats';
    if (visit.knownSite?.name && !seen.has(visit.knownSite.name)) {
      seen.add(visit.knownSite.name);
      placeNames.push(visit.knownSite.name);
    }
    return {
      knownSiteId: visit.knownSite?.id ?? null,
      name,
      type: visitTypeFromId(visit.knownSite?.id),
      inIso: visit.start,
      outIso: visit.end,
      durationMin: Math.max(0, visit.durationMin || 0),
    };
  });

  return {
    pingsCount: snapshot?.pings?.length ?? 0,
    firstIso: mappedVisits[0]?.inIso ?? null,
    lastIso: mappedVisits.length ? mappedVisits[mappedVisits.length - 1].outIso : null,
    durationMin: mappedVisits.reduce((sum, visit) => sum + visit.durationMin, 0),
    placeNames,
    visits: mappedVisits,
  };
}

export function useStaffGpsWeekSummaryBatch(
  staffIds: string[],
  weekDays: Date[],
): UseBatchResult {
  const sortedIds = useMemo(() => [...staffIds].sort(), [staffIds]);
  const dateKeys = useMemo(() => weekDays.map((day) => format(day, 'yyyy-MM-dd')), [weekDays]);
  const fromDate = weekDays[0] ? format(weekDays[0], 'yyyy-MM-dd') : '';
  const toDate = weekDays[weekDays.length - 1]
    ? format(weekDays[weekDays.length - 1], 'yyyy-MM-dd')
    : '';

  const enabled = sortedIds.length > 0 && !!fromDate && !!toDate;
  const { data: orgLocations = [] } = useOrganizationLocations();
  const privateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const location of orgLocations) {
      if (location.isPrivate) ids.add(`loc:${location.id}`);
    }
    return ids;
  }, [orgLocations]);

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

  const shouldFallback = enabled && !!query.isError;
  const fallbackQueries = useQueries({
    queries: shouldFallback
      ? sortedIds.flatMap((staffId) => dateKeys.map((date) => ({
          queryKey: ['mobile-staff-day-pings', staffId, date] as const,
          queryFn: () => callStaffSnapshotFunction<StaffGpsDaySnapshot>('get-mobile-staff-day-pings', { staffId, date }),
          staleTime: 5 * 60_000,
          gcTime: 30 * 60_000,
          retry: false,
        })))
      : [],
  });

  const fallbackSummaries = useMemo<Record<string, Record<string, StaffGpsWeekDaySummary>>>(() => {
    if (!shouldFallback) return {};
    const mapped: Record<string, Record<string, StaffGpsWeekDaySummary>> = {};
    let index = 0;
    for (const staffId of sortedIds) {
      if (!mapped[staffId]) mapped[staffId] = {};
      for (const date of dateKeys) {
        const snapshot = fallbackQueries[index]?.data as StaffGpsDaySnapshot | undefined;
        mapped[staffId][date] = summarizeSnapshot(snapshot, privateIds);
        index += 1;
      }
    }
    return mapped;
  }, [dateKeys, fallbackQueries, privateIds, shouldFallback, sortedIds]);

  const fallbackLoading = shouldFallback && fallbackQueries.some((q) => q.isLoading);
  const fallbackFailed = shouldFallback && fallbackQueries.some((q) => q.isError);

  return {
    summaries: query.data?.summaries ?? fallbackSummaries,
    isLoading: (query.isLoading || fallbackLoading) && enabled,
    isError: shouldFallback ? fallbackFailed : !!query.isError,
  };
}

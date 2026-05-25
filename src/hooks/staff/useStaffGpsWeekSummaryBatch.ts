/**
 * useStaffGpsWeekSummaryBatch — ett enda anrop hämtar FULLA dagssnapshots för
 * N personer × hela veckan via edge function get-staff-gps-week-summary.
 *
 * Batchen returnerar exakt samma snapshot-form som get-mobile-staff-day-pings
 * (pings + geofences + visits). Vi summerar lokalt med EN delad funktion
 * (`summarizeSnapshot`) — samma kod som detaljvyns inline-karta och
 * fallback-vägen använder. Det gör lista och detaljvy byte-identiska:
 * samma platsnamn, samma tider, samma matchning.
 *
 * Som bonus pumpar vi in varje snapshot i React Query-cachen under nyckeln
 * `['mobile-staff-day-pings', staffId, date]` så inline-kartan i listan
 * öppnas utan extra nätanrop och med exakt samma data.
 */
import { useEffect, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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

interface StaffGpsWeekSnapshotBatch {
  snapshots: Record<string, Record<string, StaffGpsDaySnapshot>>;
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

/**
 * ENDA stället där snapshots → summary översätts. Identisk logik körs i båda
 * batch- och fallback-vägen, så list-rader och inline-karta får samma siffror.
 */
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
  const fromDate = dateKeys[0] ?? '';
  const toDate = dateKeys[dateKeys.length - 1] ?? '';

  const enabled = sortedIds.length > 0 && !!fromDate && !!toDate;
  const { data: orgLocations = [] } = useOrganizationLocations();
  const privateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const location of orgLocations) {
      if (location.isPrivate) ids.add(`loc:${location.id}`);
    }
    return ids;
  }, [orgLocations]);

  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['staff-gps-week-snapshot-batch', sortedIds, fromDate, toDate] as const,
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async (): Promise<StaffGpsWeekSnapshotBatch> => {
      return await callStaffSnapshotFunction<StaffGpsWeekSnapshotBatch>(
        'get-staff-gps-week-summary' as any,
        { staffIds: sortedIds, fromDate, toDate },
      );
    },
  });

  // Hydrate inline-mapens cache så detaljvyn återanvänder EXAKT samma snapshot.
  useEffect(() => {
    const snapshots = query.data?.snapshots;
    if (!snapshots) return;
    for (const staffId of Object.keys(snapshots)) {
      const byDate = snapshots[staffId] ?? {};
      for (const date of Object.keys(byDate)) {
        queryClient.setQueryData(['mobile-staff-day-pings', staffId, date], byDate[date]);
      }
    }
  }, [query.data, queryClient]);

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

  const summaries = useMemo<Record<string, Record<string, StaffGpsWeekDaySummary>>>(() => {
    const mapped: Record<string, Record<string, StaffGpsWeekDaySummary>> = {};
    if (shouldFallback) {
      let idx = 0;
      for (const staffId of sortedIds) {
        if (!mapped[staffId]) mapped[staffId] = {};
        for (const date of dateKeys) {
          const snap = fallbackQueries[idx]?.data as StaffGpsDaySnapshot | undefined;
          mapped[staffId][date] = summarizeSnapshot(snap, privateIds);
          idx += 1;
        }
      }
      return mapped;
    }
    const snapshots = query.data?.snapshots;
    if (!snapshots) return mapped;
    for (const staffId of sortedIds) {
      mapped[staffId] = {};
      const byDate = snapshots[staffId] ?? {};
      for (const date of dateKeys) {
        mapped[staffId][date] = summarizeSnapshot(byDate[date], privateIds);
      }
    }
    return mapped;
  }, [shouldFallback, sortedIds, dateKeys, fallbackQueries, privateIds, query.data]);

  const fallbackLoading = shouldFallback && fallbackQueries.some((q) => q.isLoading);
  const fallbackFailed = shouldFallback && fallbackQueries.some((q) => q.isError);

  return {
    summaries,
    isLoading: (query.isLoading || fallbackLoading) && enabled,
    isError: shouldFallback ? fallbackFailed : !!query.isError,
  };
}

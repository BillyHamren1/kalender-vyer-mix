/**
 * useStaffGpsWeekSummary — bygger en veckas dag-sammanfattningar baserat på
 * EXAKT samma snapshot som dag-vyn använder (`get-mobile-staff-day-pings`).
 *
 * Tidigare räknade veckan på egen hand med lokala builders + ett separat
 * geofence-set, vilket gav en annan sanning än "Geofence-besök"-tabellen
 * under kartan. Det är borttaget — veckan och tabellen läser nu samma källa.
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { format } from 'date-fns';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
import { buildDayTimeline, type PlaceVisit, type TravelGap } from '@/lib/staff/pingPlaceSegments';
import type {
  StaffGpsDaySnapshot,
  StaffGpsSnapshotVisit,
} from '@/types/staffGpsSnapshot';

export interface StaffGpsPlaceTime {
  name: string;
  minutes: number;
}

export interface StaffGpsDaySummary {
  date: string;
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  /** Summa av besökens varaktighet (minuter) — INTE first→last-spannet. */
  durationMin: number;
  /** Geofence-besök för dagen (privata boenden bortfiltrerade). Samma lista som dag-tabellen. */
  visits: PlaceVisit[];
  /** Förflyttningar mellan synliga besök. */
  travels: TravelGap[];
  placeNames: string[];
  places: StaffGpsPlaceTime[];
  isLoading: boolean;
}

function snapshotVisitToPlaceVisit(v: StaffGpsSnapshotVisit): PlaceVisit {
  return {
    placeKey: v.placeKey,
    knownSite: v.knownSite,
    centre: v.centre,
    start: v.start,
    end: v.end,
    durationMin: v.durationMin,
    pingCount: v.pingCount,
    pings: v.pings.map((p) => ({
      recorded_at: p.recorded_at,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
    })),
    subKind: v.subKind,
  };
}

export function useStaffGpsWeekSummary(staffId: string | null, weekDates: Date[]) {
  const dateStrs = useMemo(() => weekDates.map((d) => format(d, 'yyyy-MM-dd')), [weekDates]);

  const { data: orgLocations = [] } = useOrganizationLocations();
  const privateIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of orgLocations) {
      if (l.isPrivate) s.add(`loc:${l.id}`);
    }
    return s;
  }, [orgLocations]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const results = useQueries({
    queries: dateStrs.map((date) => {
      const isPast = date < todayStr;
      const cacheKey = `gps-day-snap:${staffId}:${date}`;
      const readCache = (): StaffGpsDaySnapshot | undefined => {
        if (!staffId || typeof sessionStorage === 'undefined') return undefined;
        try {
          const raw = sessionStorage.getItem(cacheKey);
          if (!raw) return undefined;
          return JSON.parse(raw) as StaffGpsDaySnapshot;
        } catch {
          return undefined;
        }
      };
      return {
        queryKey: ['mobile-staff-day-pings', staffId, date] as const,
        enabled: !!staffId,
        // Past days are immutable — cache aggressively. Today refetches every 2 min.
        staleTime: isPast ? 24 * 60 * 60_000 : 2 * 60_000,
        gcTime: 24 * 60 * 60_000,
        initialData: readCache,
        initialDataUpdatedAt: () => {
          if (!staffId || typeof sessionStorage === 'undefined') return undefined;
          const t = sessionStorage.getItem(`${cacheKey}:t`);
          return t ? Number(t) : undefined;
        },
        queryFn: async () => {
          if (!staffId) throw new Error('no staff');
          const snap = await callStaffSnapshotFunction<StaffGpsDaySnapshot>(
            'get-mobile-staff-day-pings',
            { staffId, date },
          );
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(snap));
            sessionStorage.setItem(`${cacheKey}:t`, String(Date.now()));
          } catch {
            /* quota — ignorera */
          }
          return snap;
        },
      };
    }),
  });

  return useMemo<StaffGpsDaySummary[]>(() => {
    return dateStrs.map((date, i) => {
      const q = results[i];
      const snap = q?.data as StaffGpsDaySnapshot | undefined;
      const allVisits = (snap?.visits ?? []).map(snapshotVisitToPlaceVisit);
      const visibleVisits = allVisits.filter(
        (v) => !(v.knownSite && privateIds.has(v.knownSite.id)),
      );
      const sortedVisits = [...visibleVisits].sort((a, b) =>
        a.start.localeCompare(b.start),
      );
      const pingsCount = snap?.pings?.length ?? 0;

      // first/last = första visit-start / sista visit-end (synliga besök).
      const firstIso = sortedVisits[0]?.start ?? null;
      const lastIso = sortedVisits.length
        ? sortedVisits[sortedVisits.length - 1].end
        : null;

      const durationMin = sortedVisits.reduce(
        (acc, v) => acc + Math.max(0, v.durationMin || 0),
        0,
      );

      const minutesByName = new Map<string, number>();
      const placeNames: string[] = [];
      const seen = new Set<string>();
      for (const v of sortedVisits) {
        const name = v.knownSite?.name;
        if (!name) continue;
        if (!seen.has(name)) {
          seen.add(name);
          placeNames.push(name);
        }
        minutesByName.set(
          name,
          (minutesByName.get(name) ?? 0) + Math.max(0, v.durationMin || 0),
        );
      }
      const places: StaffGpsPlaceTime[] = Array.from(minutesByName.entries())
        .map(([name, minutes]) => ({ name, minutes }))
        .sort((a, b) => b.minutes - a.minutes);

      const rawPings = (snap?.pings ?? []).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        recorded_at: p.recorded_at,
        accuracy: p.accuracy,
      }));
      const travels = buildDayTimeline(rawPings, sortedVisits).travels;

      return {
        date,
        pingsCount,
        firstIso,
        lastIso,
        durationMin,
        visits: sortedVisits,
        travels,
        placeNames,
        places,
        isLoading: !!q?.isLoading,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStrs, privateIds, results.map((r) => r.dataUpdatedAt).join('|'), results.map((r) => r.isLoading ? 1 : 0).join('')]);
}

import { useMemo } from 'react';
import { useStaffPingsForDay } from './useStaffPingsForDay';
import { useOrganizationLocations } from './useOrganizationLocations';
import {
  buildPlaceVisits,
  buildDayTimeline,
  resolvePlaceAt,
  type KnownSite,
  type PlaceVisit,
  type TravelGap,
  type DayTimelineHit,
} from '@/lib/staff/pingPlaceSegments';
import type { Ping } from '@/lib/staff/movementDetection';

/**
 * En källa till sanning för "var var personen?" på en given dag.
 *
 * Returnerar både:
 *   - `visits` (vistelser)
 *   - `travels` (förflyttningar mellan vistelser, baserade på råpings)
 *   - `resolveAt(iso)` strikt: 'visit' | 'travel' | 'unknown' (ingen tolerans)
 *   - `resolveVisitLoose(iso)` legacy med 15 min tolerans
 */
export function useDayPlaceVisits(staffId: string, date: string, enabled = true) {
  const { data: pings = [], isLoading } = useStaffPingsForDay(staffId, date, enabled);
  const { data: orgLocations = [] } = useOrganizationLocations();

  const knownSites: KnownSite[] = useMemo(
    () => orgLocations.map(l => ({
      id: l.id, name: l.name, lat: l.lat, lng: l.lng, radiusMeters: l.radiusMeters,
    })),
    [orgLocations],
  );

  const visits: PlaceVisit[] = useMemo(
    () => buildPlaceVisits(pings, knownSites),
    [pings, knownSites],
  );

  const timeline = useMemo(() => buildDayTimeline(pings, visits), [pings, visits]);

  const resolveAt = useMemo(
    () => (iso: string | null): DayTimelineHit => timeline.resolveAt(iso),
    [timeline],
  );

  const resolveVisitLoose = useMemo(
    () => (iso: string | null) => resolvePlaceAt(visits, iso),
    [visits],
  );

  return {
    visits,
    travels: timeline.travels,
    resolveAt,
    resolveVisitLoose,
    isLoading,
    hasPings: pings.length > 0,
    pings: pings as Ping[],
  };
}

export type { PlaceVisit, TravelGap, DayTimelineHit };

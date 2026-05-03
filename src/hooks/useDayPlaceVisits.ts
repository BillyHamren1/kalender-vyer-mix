import { useMemo } from 'react';
import { useStaffPingsForDay } from './useStaffPingsForDay';
import { useDayKnownSites } from './useDayKnownSites';
import {
  buildPlaceVisits,
  buildDayTimeline,
  resolvePlaceAt,
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
 *   - `resolveAt(iso)` med liten ±90s tolerans (täcker rundningsdiff)
 *   - `resolveVisitLoose(iso)` legacy med 15 min tolerans
 *
 * Kända platser inkluderar nu BÅDE org-locations OCH dagens bokningar/
 * stora projekt — så Westers/Craft etc. matchas med rätt namn istället
 * för att degraderas till "okänd plats" och senare till "Resa".
 */
export function useDayPlaceVisits(staffId: string, date: string, enabled = true) {
  const { data: pings = [], isLoading: pingsLoading } = useStaffPingsForDay(staffId, date, enabled);
  const { knownSites, isLoading: sitesLoading } = useDayKnownSites(staffId, date, enabled);

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
    isLoading: pingsLoading || sitesLoading,
    hasPings: pings.length > 0,
    pings: pings as Ping[],
    knownSites,
  };
}

export type { PlaceVisit, TravelGap, DayTimelineHit };

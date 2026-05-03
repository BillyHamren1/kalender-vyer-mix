import { useMemo } from 'react';
import { useStaffPingsForDay } from './useStaffPingsForDay';
import { useOrganizationLocations } from './useOrganizationLocations';
import {
  buildPlaceVisits,
  resolvePlaceAt,
  type KnownSite,
  type PlaceVisit,
} from '@/lib/staff/pingPlaceSegments';

/**
 * En källa till sanning för "var var personen?" på en given dag.
 *
 * Driver både huvudraderna (ARBETSDAG / sessions / Resa) i tidrapporten
 * och underraden "Faktiska besök". På så vis säger båda alltid samma sak
 * om samma koordinat — Mapbox-text används bara som fallback för okända
 * platser, aldrig för att gissa namnet på en känd anläggning.
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

  const resolveAt = useMemo(
    () => (iso: string | null) => resolvePlaceAt(visits, iso),
    [visits],
  );

  return { visits, resolveAt, isLoading, hasPings: pings.length > 0 };
}

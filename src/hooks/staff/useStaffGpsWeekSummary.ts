import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { staffGpsRawQueryKey, type RawStaffGpsPing } from './useStaffGpsPingsForDay';
import { useAllActiveProjectGeofences } from '@/hooks/useAllActiveProjectGeofences';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
import { buildExactGeofenceVisits } from '@/lib/staff/buildExactGeofenceVisits';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import type { PlaceVisit } from '@/lib/staff/pingPlaceSegments';

/**
 * Veckosummering per dag — bygger ovanpå SAMMA data som
 * /staff-management/gps-satellite-map redan visar:
 *   - rå pings från staff_location_history
 *   - geofences = organization_locations + alla aktiva projektgeofences
 *   - visits = buildExactGeofenceVisits (samma som kartans GeofenceVisitsTable)
 *
 * Ingen ny tolkning. start/slut = första/sista ping. duration = span.
 */
export interface StaffGpsPlaceTime {
  name: string;
  minutes: number;
}
export interface StaffGpsDaySummary {
  date: string; // yyyy-MM-dd
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  visits: PlaceVisit[];
  /** Distinkta platsnamn i kronologisk ordning. */
  placeNames: string[];
  /** Tid per plats (minuter), sorterad desc. */
  places: StaffGpsPlaceTime[];
  isLoading: boolean;
}

async function fetchPingsForDay(staffId: string, date: string): Promise<RawStaffGpsPing[]> {
  const startIso = `${date}T00:00:00.000Z`;
  const endIso = `${date}T23:59:59.999Z`;
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  for (let i = 0; i < 60; i++) {
    const { data, error } = await supabase
      .from('staff_location_history')
      .select('id, recorded_at, lat, lng, accuracy')
      .eq('staff_id', staffId)
      .gte('recorded_at', startIso)
      .lte('recorded_at', endIso)
      .order('recorded_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all.map((r: any) => ({
    id: String(r.id),
    recorded_at: String(r.recorded_at),
    lat: Number(r.lat),
    lng: Number(r.lng),
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    speed: null,
    source: null,
    battery_percent: null,
    is_charging: null,
    app_version: null,
    app_build: null,
    platform: null,
    os_version: null,
    device_model: null,
    app_id: null,
  }));
}

export function useStaffGpsWeekSummary(staffId: string | null, weekDates: Date[]) {
  const dateStrs = useMemo(() => weekDates.map(d => format(d, 'yyyy-MM-dd')), [weekDates]);
  const middleDate = dateStrs[Math.floor(dateStrs.length / 2)] ?? dateStrs[0] ?? '';

  const { data: orgLocations = [] } = useOrganizationLocations();
  const { data: projectSites = [] } = useAllActiveProjectGeofences(middleDate, !!middleDate);

  const privateIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of orgLocations) {
      if (l.isPrivate) s.add(`loc:${l.id}`);
    }
    return s;
  }, [orgLocations]);

  const geofences = useMemo<GeofenceSite[]>(() => {
    const out: GeofenceSite[] = [];
    for (const l of orgLocations) {
      out.push({ id: `loc:${l.id}`, name: l.name, lat: l.lat, lng: l.lng, radiusMeters: l.radiusMeters, polygon: l.polygon });
    }
    for (const s of projectSites) {
      out.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, radiusMeters: s.radiusMeters, polygon: s.polygon });
    }
    return out;
  }, [orgLocations, projectSites]);

  const results = useQueries({
    queries: dateStrs.map((date) => ({
      queryKey: staffId ? staffGpsRawQueryKey(staffId, date) : ['staff-gps-raw', 'noop', date],
      enabled: !!staffId,
      staleTime: 60_000,
      queryFn: () => fetchPingsForDay(staffId!, date),
    })),
  });

  return useMemo<StaffGpsDaySummary[]>(() => {
    return dateStrs.map((date, i) => {
      const q = results[i];
      const pings = (q?.data ?? []) as RawStaffGpsPing[];
      if (!pings.length) {
        return {
          date,
          pingsCount: 0,
          firstIso: null,
          lastIso: null,
          durationMin: 0,
          visits: [],
          placeNames: [],
          isLoading: !!q?.isLoading,
        };
      }
      const allVisits = geofences.length
        ? buildExactGeofenceVisits(
            pings.map(p => ({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at, accuracy: p.accuracy ?? null })),
            geofences,
          )
        : [];
      const privateVisits = allVisits.filter(v => v.knownSite && privateIds.has(v.knownSite.id));
      const workVisits = allVisits.filter(v => !(v.knownSite && privateIds.has(v.knownSite.id)));

      // Hitta första/sista ping som INTE ligger i ett Boende-besök.
      const inPrivate = (iso: string) => {
        const t = new Date(iso).getTime();
        return privateVisits.some(v => {
          const s = new Date(v.start).getTime();
          const e = new Date(v.end).getTime();
          return t >= s && t <= e;
        });
      };
      let firstIso: string | null = null;
      let lastIso: string | null = null;
      for (const p of pings) {
        if (!inPrivate(p.recorded_at)) { firstIso = p.recorded_at; break; }
      }
      for (let j = pings.length - 1; j >= 0; j--) {
        if (!inPrivate(pings[j].recorded_at)) { lastIso = pings[j].recorded_at; break; }
      }
      const durationMin = firstIso && lastIso
        ? Math.max(0, Math.round((new Date(lastIso).getTime() - new Date(firstIso).getTime()) / 60_000))
        : 0;

      const placeNames: string[] = [];
      const seen = new Set<string>();
      for (const v of [...workVisits].sort((a, b) => a.start.localeCompare(b.start))) {
        const name = v.knownSite?.name;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        placeNames.push(name);
      }
      return {
        date,
        pingsCount: pings.length,
        firstIso,
        lastIso,
        durationMin,
        visits: workVisits,
        placeNames,
        isLoading: !!q?.isLoading,
      };
    });
  }, [dateStrs, results, geofences, privateIds]);
}

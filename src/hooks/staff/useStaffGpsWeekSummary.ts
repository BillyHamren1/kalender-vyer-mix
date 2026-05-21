import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { staffGpsRawQueryKey, type RawStaffGpsPing } from './useStaffGpsPingsForDay';
import { useAllActiveProjectGeofences } from '@/hooks/useAllActiveProjectGeofences';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
import { buildExactGeofenceVisits } from '@/lib/staff/buildExactGeofenceVisits';
import { buildPlaceVisits, type PlaceVisit } from '@/lib/staff/pingPlaceSegments';
import { haversineMeters } from '@/lib/staff/movementDetection';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';

export interface StaffGpsPlaceTime {
  name: string;
  minutes: number;
}

export type GpsTimelineEntry =
  | {
      kind: 'stay';
      name: string | null;
      known: boolean;
      isPrivate: boolean;
      lat: number;
      lng: number;
      start: string;
      end: string;
      minutes: number;
    }
  | {
      kind: 'move';
      start: string;
      end: string;
      minutes: number;
      distanceKm: number;
    };

export interface StaffGpsDaySummary {
  date: string;
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  visits: PlaceVisit[];
  placeNames: string[];
  places: StaffGpsPlaceTime[];
  /** Komplett kronologisk dag-tidslinje (stays + moves, inkl. okända stopp). */
  timeline: GpsTimelineEntry[];
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
          places: [],
          timeline: [],
          isLoading: !!q?.isLoading,
        };
      }
      const pingsLite = pings.map(p => ({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at, accuracy: p.accuracy ?? null }));
      const knownGeofenceVisits = geofences.length ? buildExactGeofenceVisits(pingsLite, geofences) : [];
      // Full timeline incl. unknown stops between geofences.
      const allPlaceVisits = buildPlaceVisits(
        pingsLite,
        geofences.map(g => ({ id: g.id, name: g.name, lat: g.lat, lng: g.lng, radiusMeters: g.radiusMeters })),
        { minDurationMin: 8 },
      );

      const privateVisits = knownGeofenceVisits.filter(v => v.knownSite && privateIds.has(v.knownSite.id));
      const workVisits = knownGeofenceVisits.filter(v => !(v.knownSite && privateIds.has(v.knownSite.id)));

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
      const minutesByName = new Map<string, number>();
      for (const v of [...workVisits].sort((a, b) => a.start.localeCompare(b.start))) {
        const name = v.knownSite?.name;
        if (!name) continue;
        if (!seen.has(name)) { seen.add(name); placeNames.push(name); }
        const mins = Math.max(0, Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60_000));
        minutesByName.set(name, (minutesByName.get(name) ?? 0) + mins);
      }
      const places: StaffGpsPlaceTime[] = Array.from(minutesByName.entries())
        .map(([name, minutes]) => ({ name, minutes }))
        .sort((a, b) => b.minutes - a.minutes);

      // Build full timeline (stays + interleaved moves).
      const stays = [...allPlaceVisits].sort((a, b) => a.start.localeCompare(b.start));
      const timeline: GpsTimelineEntry[] = [];
      for (let k = 0; k < stays.length; k++) {
        const v = stays[k];
        const name = v.knownSite?.name ?? null;
        const isPrivate = !!(v.knownSite && privateIds.has(v.knownSite.id));
        timeline.push({
          kind: 'stay',
          name,
          known: !!v.knownSite,
          isPrivate,
          lat: v.centre.lat,
          lng: v.centre.lng,
          start: v.start,
          end: v.end,
          minutes: v.durationMin,
        });
        const next = stays[k + 1];
        if (next) {
          const moveMin = Math.max(0, Math.round((new Date(next.start).getTime() - new Date(v.end).getTime()) / 60_000));
          if (moveMin >= 2) {
            const distM = haversineMeters(
              { lat: v.centre.lat, lng: v.centre.lng },
              { lat: next.centre.lat, lng: next.centre.lng },
            );
            timeline.push({
              kind: 'move',
              start: v.end,
              end: next.start,
              minutes: moveMin,
              distanceKm: Math.round(distM / 100) / 10,
            });
          }
        }
      }

      return {
        date,
        pingsCount: pings.length,
        firstIso,
        lastIso,
        durationMin,
        visits: workVisits,
        placeNames,
        places,
        timeline,
        isLoading: !!q?.isLoading,
      };
    });
  }, [dateStrs, results, geofences, privateIds]);
}

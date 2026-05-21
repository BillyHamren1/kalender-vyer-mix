import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { staffGpsRawQueryKey, type RawStaffGpsPing } from './useStaffGpsPingsForDay';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
import { buildExactGeofenceVisits } from '@/lib/staff/buildExactGeofenceVisits';
import { buildPlaceVisits, type PlaceVisit } from '@/lib/staff/pingPlaceSegments';
import { haversineMeters } from '@/lib/staff/movementDetection';
import { filterProjectGeofences, type RawProjectRow, type RawLargeProjectRow } from '@/lib/staff/filterProjectGeofences';
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
    }
  | {
      kind: 'gap';
      start: string;
      end: string;
      minutes: number;
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

  const { data: orgLocations = [] } = useOrganizationLocations();

  // Hämta råa projekt-rader ENBART en gång och filtrera sedan per dag — så
  // att en bokning vars aktiva fönster bara täcker t.ex. fredagen ändå räknas
  // som geofence på just den dagen (inte bara veckans mittendag).
  const { data: rawProjects } = useQuery({
    queryKey: ['week-summary-raw-projects', 'v1'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [projectsRes, largeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, status, planning_status, deleted_at, created_at, booking_id, rigdaydate, rigdowndate, eventdate')
          .is('deleted_at', null)
          .not('delivery_latitude', 'is', null)
          .not('delivery_longitude', 'is', null)
          .limit(5000),
        supabase
          .from('large_projects')
          .select('id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, created_at, start_date, end_date, event_date')
          .not('address_latitude', 'is', null)
          .not('address_longitude', 'is', null)
          .limit(5000),
      ]);
      return {
        projects: ((projectsRes as any).data || []) as RawProjectRow[],
        large: ((largeRes as any).data || []) as RawLargeProjectRow[],
      };
    },
  });

  const privateIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of orgLocations) {
      if (l.isPrivate) s.add(`loc:${l.id}`);
    }
    return s;
  }, [orgLocations]);

  const geofencesByDate = useMemo<Record<string, GeofenceSite[]>>(() => {
    const map: Record<string, GeofenceSite[]> = {};
    const projects = rawProjects?.projects ?? [];
    const large = rawProjects?.large ?? [];
    for (const date of dateStrs) {
      const out: GeofenceSite[] = [];
      for (const l of orgLocations) {
        out.push({ id: `loc:${l.id}`, name: l.name, lat: l.lat, lng: l.lng, radiusMeters: l.radiusMeters, polygon: l.polygon });
      }
      for (const s of filterProjectGeofences(projects, large, date)) {
        out.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, radiusMeters: s.radiusMeters, polygon: s.polygon });
      }
      map[date] = out;
    }
    return map;
  }, [orgLocations, rawProjects, dateStrs]);

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
      const geofences = geofencesByDate[date] ?? [];
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

      // Build full timeline (stays + interleaved moves + gaps).
      // En "lucka" = mellantid där ingen ping fanns på > 20 min OCH avståndet
      // mellan stays inte rättfärdigar restid (dvs vi har inte täckning).
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
          const distM = haversineMeters(
            { lat: v.centre.lat, lng: v.centre.lng },
            { lat: next.centre.lat, lng: next.centre.lng },
          );
          // Avgör om mellantiden är rörelse eller gap genom att titta på
          // verkliga pings i mellanrummet.
          const gapPings = pings.filter(p =>
            p.recorded_at > v.end && p.recorded_at < next.start,
          );
          const expectedKmh = distM > 0 && moveMin > 0 ? (distM / 1000) / (moveMin / 60) : 0;
          // Heuristik: < 3 pings i intervallet OCH > 20 min mellanrum = GPS-lucka.
          // Annars: behandla som rörelse om det finns mätbart avstånd.
          if (moveMin >= 2 && gapPings.length < 3 && moveMin > 20 && expectedKmh < 5) {
            timeline.push({ kind: 'gap', start: v.end, end: next.start, minutes: moveMin });
          } else if (moveMin >= 2 && distM > 50) {
            timeline.push({
              kind: 'move',
              start: v.end,
              end: next.start,
              minutes: moveMin,
              distanceKm: Math.round(distM / 100) / 10,
            });
          } else if (moveMin >= 30) {
            // Lång mellantid utan distans = stillastående utan känd plats → gap
            timeline.push({ kind: 'gap', start: v.end, end: next.start, minutes: moveMin });
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
  }, [dateStrs, results, geofencesByDate, privateIds]);
}

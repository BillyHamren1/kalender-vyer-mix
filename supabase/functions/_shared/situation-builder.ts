/**
 * situation-builder.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Builds a compact "what's happening right now" snapshot for one staff member,
 * combining workday/travel/location-entries with recent GPS pings + nearby
 * geofences. Consumed by the reality-reconciler to feed the AI gateway.
 */
import { isInsideGeofence, type GeofenceTarget } from "./geofenceEval.ts";

export interface OrgLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  geofence_mode: 'circle' | 'polygon' | null;
  geofence_polygon: { type: 'Polygon'; coordinates: number[][][] } | null;
}

export interface GpsPing {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface OpenWorkday {
  id: string;
  started_at: string;
}

export interface OpenTravel {
  id: string;
  start_time: string;
  destination_booking_id: string | null;
  from_address: string | null;
  to_address: string | null;
}

export interface OpenLocationEntry {
  id: string;
  entered_at: string;
  location_id: string | null;
  source: string | null;
}

export interface GeofenceHit {
  location_id: string;
  location_name: string;
  first_inside_at: string | null;
  last_inside_at: string | null;
  pings_inside: number;
  total_pings: number;
  pct_inside: number;
}

export interface StaffSituation {
  staff_id: string;
  staff_name: string;
  organization_id: string;
  now_iso: string;
  open_workday: OpenWorkday | null;
  open_travel: OpenTravel | null;
  open_location_entries: OpenLocationEntry[];
  recent_pings_count: number;
  latest_ping: GpsPing | null;
  geofence_hits: GeofenceHit[];
  todays_workday_exists: boolean;
  has_changed_since_last_check: boolean;
}

const RECENT_WINDOW_MIN = 120; // last 2h of GPS

export async function buildSituation(
  supabase: any,
  params: {
    staffId: string;
    staffName: string;
    organizationId: string;
    locations: OrgLocation[];
    nowIso: string;
    lastCheckIso?: string | null;
  },
): Promise<StaffSituation> {
  const { staffId, staffName, organizationId, locations, nowIso } = params;
  const now = new Date(nowIso);
  const sinceIso = new Date(now.getTime() - RECENT_WINDOW_MIN * 60 * 1000).toISOString();
  const todayStartIso = new Date(`${nowIso.slice(0, 10)}T00:00:00Z`).toISOString();

  // Open workday (no ended_at)
  const { data: workdays } = await supabase
    .from('workdays')
    .select('id, started_at, ended_at')
    .eq('staff_id', staffId)
    .gte('started_at', todayStartIso)
    .order('started_at', { ascending: false })
    .limit(5);

  const openWorkday = (workdays || []).find((w: any) => !w.ended_at) || null;
  const todaysWorkdayExists = (workdays || []).length > 0;

  // Open travel
  const { data: travels } = await supabase
    .from('travel_time_logs')
    .select('id, start_time, end_time, destination_booking_id, from_address, to_address')
    .eq('staff_id', staffId)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(3);
  const openTravel = (travels || [])[0]
    ? {
        id: travels[0].id,
        start_time: travels[0].start_time,
        destination_booking_id: travels[0].destination_booking_id,
        from_address: travels[0].from_address,
        to_address: travels[0].to_address,
      }
    : null;

  // Open location entries
  const { data: openEntries } = await supabase
    .from('location_time_entries')
    .select('id, entered_at, location_id, source')
    .eq('staff_id', staffId)
    .is('exited_at', null)
    .order('entered_at', { ascending: false })
    .limit(5);

  // Recent GPS pings
  const { data: pings } = await supabase
    .from('staff_location_history')
    .select('recorded_at, lat, lng, accuracy')
    .eq('staff_id', staffId)
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: true })
    .limit(500);

  const pingArr: GpsPing[] = (pings || []).map((p: any) => ({
    recorded_at: p.recorded_at,
    lat: Number(p.lat),
    lng: Number(p.lng),
    accuracy: p.accuracy != null ? Number(p.accuracy) : null,
  }));

  const latestPing = pingArr.length ? pingArr[pingArr.length - 1] : null;

  // Geofence hits — only count pings with reasonable accuracy
  const hits: GeofenceHit[] = [];
  for (const loc of locations) {
    const target: GeofenceTarget = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius_meters: loc.radius_meters || 100,
      geofence_mode: loc.geofence_mode,
      geofence_polygon: loc.geofence_polygon,
    };
    let firstInside: string | null = null;
    let lastInside: string | null = null;
    let count = 0;
    for (const p of pingArr) {
      if (p.accuracy != null && p.accuracy > 60) continue;
      if (isInsideGeofence(p.lat, p.lng, target)) {
        if (!firstInside) firstInside = p.recorded_at;
        lastInside = p.recorded_at;
        count++;
      }
    }
    if (count > 0) {
      hits.push({
        location_id: loc.id,
        location_name: loc.name,
        first_inside_at: firstInside,
        last_inside_at: lastInside,
        pings_inside: count,
        total_pings: pingArr.length,
        pct_inside: pingArr.length ? Math.round((count / pingArr.length) * 100) : 0,
      });
    }
  }
  hits.sort((a, b) => b.pings_inside - a.pings_inside);

  // Has anything changed since last check? Cheap pre-filter.
  let changedSince = true;
  if (params.lastCheckIso) {
    const last = new Date(params.lastCheckIso).getTime();
    const latestActivity = Math.max(
      latestPing ? new Date(latestPing.recorded_at).getTime() : 0,
      openWorkday ? new Date(openWorkday.started_at).getTime() : 0,
      openTravel ? new Date(openTravel.start_time).getTime() : 0,
      ...(openEntries || []).map((e: any) => new Date(e.entered_at).getTime()),
    );
    changedSince = latestActivity > last;
  }

  return {
    staff_id: staffId,
    staff_name: staffName,
    organization_id: organizationId,
    now_iso: nowIso,
    open_workday: openWorkday
      ? { id: openWorkday.id, started_at: openWorkday.started_at }
      : null,
    open_travel: openTravel,
    open_location_entries: (openEntries || []).map((e: any) => ({
      id: e.id,
      entered_at: e.entered_at,
      location_id: e.location_id,
      source: e.source,
    })),
    recent_pings_count: pingArr.length,
    latest_ping: latestPing,
    geofence_hits: hits,
    todays_workday_exists: todaysWorkdayExists,
    has_changed_since_last_check: changedSince,
  };
}

/**
 * Find active staff: anyone with an open workday/travel/location-entry, or
 * any GPS ping in the last 30 min. Returns one row per staff_id.
 */
export async function listActiveStaff(
  supabase: any,
  organizationId: string,
  nowIso: string,
): Promise<{ staff_id: string; staff_name: string }[]> {
  const sinceIso = new Date(new Date(nowIso).getTime() - 30 * 60 * 1000).toISOString();
  const ids = new Set<string>();

  const [w, t, l, p] = await Promise.all([
    supabase.from('workdays').select('staff_id').eq('organization_id', organizationId).is('ended_at', null),
    supabase.from('travel_time_logs').select('staff_id').eq('organization_id', organizationId).is('end_time', null),
    supabase.from('location_time_entries').select('staff_id').eq('organization_id', organizationId).is('exited_at', null),
    supabase.from('staff_location_history').select('staff_id').eq('organization_id', organizationId).gte('recorded_at', sinceIso).limit(2000),
  ]);

  for (const r of (w.data || [])) ids.add(r.staff_id);
  for (const r of (t.data || [])) ids.add(r.staff_id);
  for (const r of (l.data || [])) ids.add(r.staff_id);
  for (const r of (p.data || [])) ids.add(r.staff_id);

  if (ids.size === 0) return [];

  const { data: members } = await supabase
    .from('staff_members')
    .select('id, name')
    .in('id', Array.from(ids))
    .eq('is_active', true);

  return (members || []).map((m: any) => ({ staff_id: m.id, staff_name: m.name }));
}

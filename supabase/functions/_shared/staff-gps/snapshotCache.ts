// Persistent per-day GPS snapshot cache.
// Reuses staff_gps_day_snapshots so admin week view + mobile day view never
// re-paginate staff_location_history when nothing has changed.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadDayKnownSites } from "./dayKnownSites.ts";
import { stockholmDayWindowUtc } from "./dayWindow.ts";

export interface PingRow {
  id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface GeofenceRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  polygon?: unknown;
}

export interface VisitRow {
  placeKey: string;
  knownSite: { id: string; name: string } | null;
  centre: { lat: number; lng: number };
  start: string;
  end: string;
  durationMin: number;
  pingCount: number;
  pings: PingRow[];
  subKind: "inside";
}

export interface DaySnapshot {
  pings: PingRow[];
  geofences: GeofenceRow[];
  visits: VisitRow[];
  privateGeofenceIds: string[];
  builtAt: string;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
}

function pointInPolygon(lng: number, lat: number, polygon: any): boolean {
  const ring = polygon?.coordinates?.[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function containsPing(site: GeofenceRow, ping: PingRow): boolean {
  const polygon = site.polygon as any;
  if (polygon && polygon.type === "Polygon") {
    return pointInPolygon(ping.lng, ping.lat, polygon);
  }
  return (
    haversineMeters(
      { lat: site.lat, lng: site.lng },
      { lat: ping.lat, lng: ping.lng },
    ) <= Math.max(10, Number(site.radiusMeters) || 75)
  );
}

function resolveFence(ping: PingRow, sites: GeofenceRow[]): GeofenceRow | null {
  let best: { site: GeofenceRow; score: number } | null = null;
  for (const site of sites) {
    if (!containsPing(site, ping)) continue;
    const rawDistance = haversineMeters(
      { lat: site.lat, lng: site.lng },
      { lat: ping.lat, lng: ping.lng },
    );
    const score = site.polygon
      ? rawDistance
      : rawDistance / Math.max(1, Number(site.radiusMeters) || 1);
    if (!best || score < best.score) best = { site, score };
  }
  return best?.site ?? null;
}

function buildExactGeofenceVisits(rawPings: PingRow[], sites: GeofenceRow[]): VisitRow[] {
  if (!rawPings.length || !sites.length) return [];
  const sorted = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const visits: VisitRow[] = [];
  let open: { site: GeofenceRow; pings: PingRow[] } | null = null;
  const flush = (endOverride?: string) => {
    if (!open || open.pings.length === 0) { open = null; return; }
    const start = open.pings[0].recorded_at;
    const end = endOverride ?? open.pings[open.pings.length - 1].recorded_at;
    visits.push({
      placeKey: `site:${open.site.id}:${start}`,
      knownSite: { id: open.site.id, name: open.site.name },
      centre: { lat: open.site.lat, lng: open.site.lng },
      start,
      end,
      durationMin: Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)),
      pingCount: open.pings.length,
      pings: [...open.pings],
      subKind: "inside",
    });
    open = null;
  };
  for (const ping of sorted) {
    const fence = resolveFence(ping, sites);
    if (!open) {
      if (fence) open = { site: fence, pings: [ping] };
      continue;
    }
    if (!fence) {
      // Personen har lämnat geofencen. Stäng besöket på SISTA ping inne i
      // fencen — annars skulle vi felaktigt absorbera utomhus-pings och
      // skjuta UT-tiden framåt till nästa kända plats eller dagens slut.
      flush();
      continue;
    }
    if (fence.id !== open.site.id) {
      flush(ping.recorded_at);
      open = { site: fence, pings: [ping] };
      continue;
    }
    open.pings.push(ping);
  }
  flush();
  return visits;
}

async function loadAllPings(
  admin: SupabaseClient,
  staffId: string,
  startIso: string,
  endIso: string,
): Promise<PingRow[]> {
  const PAGE = 1000;
  const out: PingRow[] = [];
  let from = 0;
  for (let i = 0; i < 30; i++) {
    const { data, error } = await admin
      .from("staff_location_history")
      .select("id, recorded_at, lat, lng, accuracy")
      .eq("staff_id", staffId)
      .gte("recorded_at", startIso)
      .lte("recorded_at", endIso)
      .order("recorded_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`pings fetch failed: ${error.message}`);
    const rows = (data ?? []) as any[];
    out.push(...rows.map((r) => ({
      id: String(r.id),
      recorded_at: String(r.recorded_at),
      lat: Number(r.lat),
      lng: Number(r.lng),
      accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    })));
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// loadGeofences removed — replaced by date-bound loadDayKnownSites().
// See mem://constraints/known-sites-date-bound-v1: a server-wide org-wide
// projects scan caused unrelated/test projects to surface as "visits".

async function computeInputSignature(
  admin: SupabaseClient,
  staffId: string,
  startIso: string,
  endIso: string,
  geofenceCount: number,
  fenceSetHash: string,
): Promise<string> {
  // Cheap aggregate: count + max(recorded_at). PostgREST supports HEAD/count
  // and we can grab max via a tiny order+limit query.
  const { count, error: countErr } = await admin
    .from("staff_location_history")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staffId)
    .gte("recorded_at", startIso)
    .lte("recorded_at", endIso);
  if (countErr) throw new Error(`signature count failed: ${countErr.message}`);

  let maxIso = "";
  if ((count ?? 0) > 0) {
    const { data, error: maxErr } = await admin
      .from("staff_location_history")
      .select("recorded_at")
      .eq("staff_id", staffId)
      .gte("recorded_at", startIso)
      .lte("recorded_at", endIso)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw new Error(`signature max failed: ${maxErr.message}`);
    maxIso = data?.recorded_at ? String(data.recorded_at) : "";
  }
  return `${count ?? 0}|${maxIso}|gf:${geofenceCount}|fh:${fenceSetHash}`;
}

/**
 * Returns the canonical day snapshot — served from cache when input_signature
 * matches, otherwise recomputed and upserted. Same builder used by the admin
 * week summary and the mobile day-pings endpoint, so list and map agree byte
 * for byte.
 */
export async function getOrBuildDaySnapshot(
  admin: SupabaseClient,
  opts: { staffId: string; date: string; organizationId: string },
): Promise<DaySnapshot> {
  const { staffId, date, organizationId } = opts;
  const { startIso, endIso } = stockholmDayWindowUtc(date);


  const { geofences, privateGeofenceIds } = await loadDayKnownSites(admin, {
    staffId,
    date,
    organizationId,
  });

  // Signature includes a stable hash of the geofence-id set so any change in
  // dagens "kända platser" (project added/removed/cancelled, BSA edit, TR
  // mutation) forces a rebuild — not just count differences.
  const fenceSetHash = geofences.map((g) => g.id).sort().join(",");
  const signature = await computeInputSignature(
    admin,
    staffId,
    startIso,
    endIso,
    geofences.length,
    fenceSetHash,
  );

  const { data: cached, error: cacheErr } = await admin
    .from("staff_gps_day_snapshots")
    .select("snapshot, input_signature")
    .eq("staff_id", staffId)
    .eq("date", date)
    .maybeSingle();
  if (cacheErr) {
    console.warn("[snapshotCache] cache read failed", cacheErr.message);
  }
  if (cached && cached.input_signature === signature && cached.snapshot) {
    const snap = cached.snapshot as DaySnapshot;
    // Cache hit: pings + geofence-set unchanged, so visits are still valid.
    return {
      pings: snap.pings ?? [],
      geofences,
      visits: snap.visits ?? [],
      privateGeofenceIds,
      builtAt: snap.builtAt ?? new Date().toISOString(),
    };
  }

  const pings = await loadAllPings(admin, staffId, startIso, endIso);
  const visits = buildExactGeofenceVisits(pings, geofences);
  const snapshot: DaySnapshot = {
    pings,
    geofences,
    visits,
    privateGeofenceIds,
    builtAt: new Date().toISOString(),
  };

  const { error: upsertErr } = await admin
    .from("staff_gps_day_snapshots")
    .upsert(
      {
        staff_id: staffId,
        date,
        organization_id: organizationId,
        snapshot,
        input_signature: signature,
        built_at: snapshot.builtAt,
      },
      { onConflict: "staff_id,date" },
    );
  if (upsertErr) console.warn("[snapshotCache] upsert failed", upsertErr.message);

  return snapshot;
}

// Test-only exports. Inte avsedda för produktion — används av
// snapshotCache.visit.test.ts för att låsa besöksbyggarens beteende.
export const _testing = { buildExactGeofenceVisits };


// get-mobile-staff-day-pings
// ===========================
// Returns raw GPS pings + known-site geofences for a single staff+date so the
// mobile Time-app's mini-map can render exactly what the admin GPS-karta shows.
// READ-ONLY. Authenticated via shared staff-auth (mobile token or admin JWT).
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";

interface PingRow {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
}

interface GeofenceRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  polygon?: unknown;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
}

function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Polygon): boolean {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function containsPing(site: GeofenceRow, ping: PingRow): boolean {
  const polygon = site.polygon as GeoJSON.Polygon | undefined;
  if (polygon?.type === "Polygon") return pointInPolygon(ping.lng, ping.lat, polygon);
  return haversineMeters({ lat: site.lat, lng: site.lng }, { lat: ping.lat, lng: ping.lng }) <= Math.max(10, Number(site.radiusMeters) || 75);
}

function resolveFence(ping: PingRow, sites: GeofenceRow[]): GeofenceRow | null {
  let best: { site: GeofenceRow; score: number } | null = null;
  for (const site of sites) {
    if (!containsPing(site, ping)) continue;
    const rawDistance = haversineMeters({ lat: site.lat, lng: site.lng }, { lat: ping.lat, lng: ping.lng });
    const score = site.polygon ? rawDistance : rawDistance / Math.max(1, Number(site.radiusMeters) || 1);
    if (!best || score < best.score) best = { site, score };
  }
  return best?.site ?? null;
}

function buildExactGeofenceVisits(rawPings: PingRow[], sites: GeofenceRow[]) {
  if (!rawPings.length || !sites.length) return [];

  const sorted = [...rawPings].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  const visits: Array<{
    placeKey: string;
    knownSite: { id: string; name: string } | null;
    centre: { lat: number; lng: number };
    start: string;
    end: string;
    durationMin: number;
    pingCount: number;
    pings: PingRow[];
    subKind: "inside";
  }> = [];
  let open: { site: GeofenceRow; pings: PingRow[]; lastInsideIdx: number } | null = null;

  const flush = (trimTrailingOutside: boolean) => {
    if (!open) return;
    let visitPings = open.pings;
    if (trimTrailingOutside && open.lastInsideIdx >= 0) {
      visitPings = visitPings.slice(0, open.lastInsideIdx + 1);
    }
    if (visitPings.length > 0) {
      const start = visitPings[0].recorded_at;
      const end = visitPings[visitPings.length - 1].recorded_at;
      visits.push({
        placeKey: `site:${open.site.id}:${start}`,
        knownSite: { id: open.site.id, name: open.site.name },
        centre: { lat: open.site.lat, lng: open.site.lng },
        start,
        end,
        durationMin: Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)),
        pingCount: visitPings.length,
        pings: [...visitPings],
        subKind: "inside",
      });
    }
    open = null;
  };

  for (const ping of sorted) {
    const fence = resolveFence(ping, sites);
    if (!open) {
      if (fence) open = { site: fence, pings: [ping], lastInsideIdx: 0 };
      continue;
    }
    if (fence && fence.id !== open.site.id) {
      flush(true);
      open = { site: fence, pings: [ping], lastInsideIdx: 0 };
      continue;
    }
    open.pings.push(ping);
    if (fence && fence.id === open.site.id) open.lastInsideIdx = open.pings.length - 1;
  }

  flush(true);
  return visits;
}

interface RequestBody {
  staffId?: string;
  date?: string;
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: RequestBody;
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

  const staffId = (body.staffId ?? "").trim();
  const date = (body.date ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(400, "date must be YYYY-MM-DD");

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);
  const orgId = access.orgId;
  const admin = authResult.auth.admin;

  const startIso = `${date}T00:00:00.000Z`;
  const endIso = `${date}T23:59:59.999Z`;

  // Paginate pings (PostgREST cap 1000) — match admin behaviour.
  const PAGE = 1000;
  const pings: PingRow[] = [];
  let from = 0;
  for (let i = 0; i < 30; i++) {
    const { data, error } = await admin
      .from("staff_location_history")
      .select("recorded_at, lat, lng, accuracy")
      .eq("staff_id", staffId)
      .gte("recorded_at", startIso)
      .lte("recorded_at", endIso)
      .order("recorded_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return bad(500, "pings fetch failed", { details: error.message });
    const rows = (data ?? []) as PingRow[];
    pings.push(...rows.map((r) => ({
      recorded_at: String(r.recorded_at),
      lat: Number(r.lat),
      lng: Number(r.lng),
      accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    })));
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  // Geofences: org-locations + active projects + large projects (filtered by org).
  const [locsRes, projRes, largeRes] = await Promise.all([
    admin
      .from("organization_locations")
      .select("id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon")
      .eq("organization_id", orgId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000),
    admin
      .from("projects")
      .select("id, name, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, deleted_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .not("delivery_latitude", "is", null)
      .not("delivery_longitude", "is", null)
      .limit(5000),
    admin
      .from("large_projects")
      .select("id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon")
      .eq("organization_id", orgId)
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null)
      .limit(2000),
  ]);

  const geofences: GeofenceRow[] = [];
  for (const r of (locsRes.data ?? []) as any[]) {
    geofences.push({
      id: `loc:${r.id}`,
      name: String(r.name ?? "Plats"),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      radiusMeters: Number(r.radius_meters ?? 75),
      polygon: r.geofence_mode === "polygon" ? r.geofence_polygon : undefined,
    });
  }
  for (const r of (projRes.data ?? []) as any[]) {
    geofences.push({
      id: `project:${r.id}`,
      name: String(r.name ?? "Projekt"),
      lat: Number(r.delivery_latitude),
      lng: Number(r.delivery_longitude),
      radiusMeters: Number(r.address_radius_meters ?? 75),
      polygon: r.address_geofence_mode === "polygon" ? r.address_geofence_polygon : undefined,
    });
  }
  for (const r of (largeRes.data ?? []) as any[]) {
    geofences.push({
      id: `large:${r.id}`,
      name: String(r.name ?? "Stort projekt"),
      lat: Number(r.address_latitude),
      lng: Number(r.address_longitude),
      radiusMeters: Number(r.address_radius_meters ?? 100),
      polygon: r.address_geofence_mode === "polygon" ? r.address_geofence_polygon : undefined,
    });
  }

  const visits = buildExactGeofenceVisits(pings, geofences);

  return new Response(
    JSON.stringify({
      staffId,
      date,
      pings,
      geofences,
      visits,
      hasGps: pings.length > 0,
      lastUpdatedAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

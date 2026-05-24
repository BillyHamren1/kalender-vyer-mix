// Delas mellan get-mobile-staff-day-pings (1 person × 1 dag, full payload)
// och get-staff-gps-week-summary (N personer × N dagar, bara summary).
// Lyfter ut geofence-matchning + visit-grupperingen så båda funktionerna
// jobbar på exakt samma sätt.

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

export interface ExactVisit {
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

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
}

function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Polygon): boolean {
  const ring = polygon.coordinates[0];
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

export function containsPing(site: GeofenceRow, ping: PingRow): boolean {
  const polygon = site.polygon as GeoJSON.Polygon | undefined;
  if (polygon?.type === "Polygon") return pointInPolygon(ping.lng, ping.lat, polygon);
  return (
    haversineMeters(
      { lat: site.lat, lng: site.lng },
      { lat: ping.lat, lng: ping.lng },
    ) <= Math.max(10, Number(site.radiusMeters) || 75)
  );
}

export function resolveFence(ping: PingRow, sites: GeofenceRow[]): GeofenceRow | null {
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

export function buildExactGeofenceVisits(
  rawPings: PingRow[],
  sites: GeofenceRow[],
): ExactVisit[] {
  if (!rawPings.length || !sites.length) return [];

  const sorted = [...rawPings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const visits: ExactVisit[] = [];
  let open: { site: GeofenceRow; pings: PingRow[] } | null = null;

  const flush = (opts: { endOverride?: string } = {}) => {
    if (!open) return;
    const visitPings = open.pings;
    if (visitPings.length > 0) {
      const start = visitPings[0].recorded_at;
      const end = opts.endOverride ?? visitPings[visitPings.length - 1].recorded_at;
      visits.push({
        placeKey: `site:${open.site.id}:${start}`,
        knownSite: { id: open.site.id, name: open.site.name },
        centre: { lat: open.site.lat, lng: open.site.lng },
        start,
        end,
        durationMin: Math.max(
          0,
          Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
        ),
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
      if (fence) open = { site: fence, pings: [ping] };
      continue;
    }
    if (fence && fence.id !== open.site.id) {
      flush({ endOverride: ping.recorded_at });
      open = { site: fence, pings: [ping] };
      continue;
    }
    open.pings.push(ping);
  }

  flush();
  return visits;
}

export async function loadOrgGeofences(
  admin: any,
  orgId: string,
): Promise<{ geofences: GeofenceRow[]; privateIds: Set<string> }> {
  const [locsRes, projRes, largeRes] = await Promise.all([
    admin
      .from("organization_locations")
      .select(
        "id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon, is_private_residence",
      )
      .eq("organization_id", orgId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000),
    admin
      .from("projects")
      .select(
        "id, name, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, deleted_at",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .not("delivery_latitude", "is", null)
      .not("delivery_longitude", "is", null)
      .limit(5000),
    admin
      .from("large_projects")
      .select(
        "id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon",
      )
      .eq("organization_id", orgId)
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null)
      .limit(2000),
  ]);

  const geofences: GeofenceRow[] = [];
  const privateIds = new Set<string>();
  for (const r of (locsRes.data ?? []) as any[]) {
    const id = `loc:${r.id}`;
    geofences.push({
      id,
      name: String(r.name ?? "Plats"),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      radiusMeters: Number(r.radius_meters ?? 75),
      polygon: r.geofence_mode === "polygon" ? r.geofence_polygon : undefined,
    });
    if (r.is_private_residence === true) privateIds.add(id);
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
  return { geofences, privateIds };
}

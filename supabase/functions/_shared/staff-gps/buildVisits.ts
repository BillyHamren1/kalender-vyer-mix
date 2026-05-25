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

type PolygonGeo = { type: "Polygon"; coordinates: number[][][] };

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

function pointInPolygon(lng: number, lat: number, polygon: PolygonGeo): boolean {
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
  const polygon = site.polygon as PolygonGeo | undefined;
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
  opts: { dates?: string[] } = {},
): Promise<{
  /** Union av alla geofences över dates (för debug/karta). */
  geofences: GeofenceRow[];
  privateIds: Set<string>;
  /** Per-dag-uppsättning. Tom map om `dates` saknas. Använd i visit-matchning per dag. */
  geofencesByDate: Map<string, GeofenceRow[]>;
}> {
  const dates = (opts.dates ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const hasDateFilter = dates.length > 0;

  const [locsRes, projRes, largeBookingsRes, bookingsRes] = await Promise.all([
    admin
      .from("organization_locations")
      .select(
        "id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon, is_private_residence",
      )
      .eq("organization_id", orgId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000),
    // Projekt: datumbundna (eventdate/rigdaydate/rigdowndate) ELLER interna projekt.
    (hasDateFilter
      ? admin
          .from("projects")
          .select(
            "id, name, booking_id, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, deleted_at, eventdate, rigdaydate, rigdowndate, is_internal",
          )
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .not("delivery_latitude", "is", null)
          .not("delivery_longitude", "is", null)
          .or(
            [
              `is_internal.eq.true`,
              `eventdate.in.(${dates.join(",")})`,
              `rigdaydate.in.(${dates.join(",")})`,
              `rigdowndate.in.(${dates.join(",")})`,
            ].join(","),
          )
          .limit(5000)
      : admin
          .from("projects")
          .select(
            "id, name, booking_id, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, deleted_at, eventdate, rigdaydate, rigdowndate, is_internal",
          )
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .not("delivery_latitude", "is", null)
          .not("delivery_longitude", "is", null)
          .limit(5000)),
    // Stora projekt: matcha via BEKRÄFTADE bookings inom datum-spannet.
    hasDateFilter
      ? admin
          .from("bookings")
          .select("large_project_id, eventdate, rigdaydate, rigdowndate")
          .eq("organization_id", orgId)
          .eq("status", "CONFIRMED")
          .not("large_project_id", "is", null)
          .or(
            [
              `eventdate.in.(${dates.join(",")})`,
              `rigdaydate.in.(${dates.join(",")})`,
              `rigdowndate.in.(${dates.join(",")})`,
            ].join(","),
          )
          .limit(20000)
      : Promise.resolve({ data: [] as any[] }),
    // Bokningens EGNA pin (fallback när projekt saknas/inte datumvalid).
    // Endast BEKRÄFTADE bokningar räknas som känd plats.
    hasDateFilter
      ? admin
          .from("bookings")
          .select(
            "id, client, booking_number, delivery_latitude, delivery_longitude, large_project_id, eventdate, rigdaydate, rigdowndate",
          )
          .eq("organization_id", orgId)
          .eq("status", "CONFIRMED")
          .not("delivery_latitude", "is", null)
          .not("delivery_longitude", "is", null)
          .or(
            [
              `eventdate.in.(${dates.join(",")})`,
              `rigdaydate.in.(${dates.join(",")})`,
              `rigdowndate.in.(${dates.join(",")})`,
            ].join(","),
          )
          .limit(20000)
      : Promise.resolve({ data: [] as any[] }),
  ]);


  // Bygg en map över large_project_id → set av datum bokningen "tillhör".
  const largeDatesById = new Map<string, Set<string>>();
  for (const b of ((largeBookingsRes as any).data ?? []) as any[]) {
    const id = b.large_project_id ? String(b.large_project_id) : null;
    if (!id) continue;
    let set = largeDatesById.get(id);
    if (!set) { set = new Set(); largeDatesById.set(id, set); }
    for (const d of [b.eventdate, b.rigdaydate, b.rigdowndate]) {
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d);
    }
  }

  // Ladda matchande large_projects.
  const largeIds = [...largeDatesById.keys()];
  let largeRows: any[] = [];
  if (hasDateFilter && largeIds.length > 0) {
    const { data } = await admin
      .from("large_projects")
      .select(
        "id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon",
      )
      .eq("organization_id", orgId)
      .in("id", largeIds)
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null);
    largeRows = (data ?? []) as any[];
  } else if (!hasDateFilter) {
    const { data } = await admin
      .from("large_projects")
      .select(
        "id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon",
      )
      .eq("organization_id", orgId)
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null)
      .limit(2000);
    largeRows = (data ?? []) as any[];
  }

  const privateIds = new Set<string>();
  const locFences: GeofenceRow[] = [];
  for (const r of (locsRes.data ?? []) as any[]) {
    const id = `loc:${r.id}`;
    locFences.push({
      id,
      name: String(r.name ?? "Plats"),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      radiusMeters: Number(r.radius_meters ?? 75),
      polygon: r.geofence_mode === "polygon" ? r.geofence_polygon : undefined,
    });
    if (r.is_private_residence === true) privateIds.add(id);
  }

  // Per-projekt: bestäm vilka datum det "äger" (intern → alla; annars sina egna).
  interface ProjFence { row: GeofenceRow; dates: Set<string> | "ALL" }
  const projFences: ProjFence[] = [];
  for (const r of ((projRes as any).data ?? []) as any[]) {
    const fence: GeofenceRow = {
      id: `project:${r.id}`,
      name: String(r.name ?? "Projekt"),
      lat: Number(r.delivery_latitude),
      lng: Number(r.delivery_longitude),
      radiusMeters: Number(r.address_radius_meters ?? 75),
      polygon: r.address_geofence_mode === "polygon" ? r.address_geofence_polygon : undefined,
    };
    if (r.is_internal === true) {
      projFences.push({ row: fence, dates: "ALL" });
    } else {
      const own = new Set<string>();
      for (const d of [r.eventdate, r.rigdaydate, r.rigdowndate]) {
        if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) own.add(d);
      }
      projFences.push({ row: fence, dates: own });
    }
  }

  const largeFences: { row: GeofenceRow; dates: Set<string> | "ALL" }[] = [];
  for (const r of largeRows) {
    const own = hasDateFilter ? (largeDatesById.get(String(r.id)) ?? new Set()) : ("ALL" as const);
    largeFences.push({
      row: {
        id: `large:${r.id}`,
        name: String(r.name ?? "Stort projekt"),
        lat: Number(r.address_latitude),
        lng: Number(r.address_longitude),
        radiusMeters: Number(r.address_radius_meters ?? 100),
        polygon: r.address_geofence_mode === "polygon" ? r.address_geofence_polygon : undefined,
      },
      dates: own,
    });
  }

  // Bokningens egen pin: bara där projekt inte redan backar bokningen
  // (eller bokningen hör till ett large_project — då representeras platsen
  // av large-fencen). Speglar useDayKnownSites-policy.
  const projectBackedBookingIds = new Set<string>();
  for (const r of ((projRes as any).data ?? []) as any[]) {
    if (r.booking_id) projectBackedBookingIds.add(String(r.booking_id));
  }
  interface BookingFence { row: GeofenceRow; dates: Set<string> }
  const bookingFences: BookingFence[] = [];
  for (const b of ((bookingsRes as any).data ?? []) as any[]) {
    const bid = b.id ? String(b.id) : null;
    if (!bid) continue;
    if (projectBackedBookingIds.has(bid)) continue;
    if (b.large_project_id) continue;
    const own = new Set<string>();
    for (const d of [b.eventdate, b.rigdaydate, b.rigdowndate]) {
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) own.add(d);
    }
    if (own.size === 0) continue;
    const label = b.booking_number
      ? `${b.booking_number} · ${b.client ?? "Bokning"}`
      : (b.client ?? "Bokning");
    bookingFences.push({
      row: {
        id: `booking:${bid}`,
        name: label,
        lat: Number(b.delivery_latitude),
        lng: Number(b.delivery_longitude),
        radiusMeters: 200,
      },
      dates: own,
    });
  }

  const unionGeofences: GeofenceRow[] = [
    ...locFences,
    ...projFences.map((p) => p.row),
    ...largeFences.map((p) => p.row),
    ...bookingFences.map((p) => p.row),
  ];

  const geofencesByDate = new Map<string, GeofenceRow[]>();
  if (hasDateFilter) {
    for (const d of dates) {
      const arr: GeofenceRow[] = [...locFences];
      for (const p of projFences) {
        if (p.dates === "ALL" || p.dates.has(d)) arr.push(p.row);
      }
      for (const p of largeFences) {
        if (p.dates === "ALL" || p.dates.has(d)) arr.push(p.row);
      }
      for (const p of bookingFences) {
        if (p.dates.has(d)) arr.push(p.row);
      }
      geofencesByDate.set(d, arr);
    }
  }

  return { geofences: unionGeofences, privateIds, geofencesByDate };
}


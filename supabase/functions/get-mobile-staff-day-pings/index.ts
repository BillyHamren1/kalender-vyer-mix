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
  const pings: Array<{ recorded_at: string; lat: number; lng: number; accuracy: number | null }> = [];
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
    const rows = (data ?? []) as Array<{ recorded_at: string; lat: number; lng: number; accuracy: number | null }>;
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

  type Geo = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    polygon?: unknown;
  };
  const geofences: Geo[] = [];
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

  return new Response(
    JSON.stringify({
      staffId,
      date,
      pings,
      geofences,
      lastUpdatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// get-mobile-staff-day-pings
// ===========================
// Returns raw GPS pings + known-site geofences for a single staff+date so the
// mobile Time-app's mini-map can render exactly what the admin GPS-karta shows.
// READ-ONLY. Authenticated via shared staff-auth (mobile token or admin JWT).
//
// För batch-vyn (vecko-listan i admin), använd istället get-staff-gps-week-summary.
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  buildExactGeofenceVisits,
  loadOrgGeofences,
  type PingRow,
} from "../_shared/staff-gps/buildVisits.ts";

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

async function resolveRequestedStaff(
  admin: ReturnType<typeof authenticateStaffRequest> extends Promise<{ ok: true; auth: infer A } | { ok: false; err: unknown }>
    ? A extends { admin: infer C } ? C : never
    : never,
  staffId: string,
  orgId: string,
) {
  const { data, error } = await admin
    .from("staff_members")
    .select("id, organization_id")
    .eq("id", staffId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return { data, error };
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

  const { data: staffRow, error: staffErr } = await resolveRequestedStaff(admin, staffId, orgId);
  if (staffErr) return bad(500, "Staff lookup failed", { details: staffErr.message ?? "unknown error" });
  if (!staffRow) return bad(404, "Staff not found in your organization");

  const startIso = `${date}T00:00:00.000Z`;
  const endIso = `${date}T23:59:59.999Z`;

  // Paginate pings (PostgREST cap 1000) — match admin behaviour.
  const PAGE = 1000;
  const pings: PingRow[] = [];
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
    if (error) return bad(500, "pings fetch failed", { details: error.message });
    const rows = (data ?? []) as PingRow[];
    pings.push(...rows.map((r) => ({
      id: String(r.id),
      recorded_at: String(r.recorded_at),
      lat: Number(r.lat),
      lng: Number(r.lng),
      accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    })));
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const { geofences, geofencesByDate } = await loadOrgGeofences(admin, orgId, { dates: [date] });
  const dayFences = geofencesByDate.get(date) ?? geofences;
  const visits = buildExactGeofenceVisits(pings, dayFences);

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

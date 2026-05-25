// get-mobile-staff-day-pings
// ===========================
// Returns raw GPS pings + known-site geofences + exact-geofence visits for a
// single staff+date. Backed by staff_gps_day_snapshots cache so opening the
// mini-map after the week list is a no-op DB read.
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import { getOrBuildDaySnapshot } from "../_shared/staff-gps/snapshotCache.ts";

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

  try {
    const snapshot = await getOrBuildDaySnapshot(admin, {
      staffId,
      date,
      organizationId: orgId,
    });
    return new Response(
      JSON.stringify({
        staffId,
        date,
        pings: snapshot.pings,
        geofences: snapshot.geofences,
        visits: snapshot.visits,
        privateGeofenceIds: snapshot.privateGeofenceIds,
        hasGps: snapshot.pings.length > 0,
        lastUpdatedAt: snapshot.builtAt,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return bad(500, "snapshot failed", { details: (err as Error).message });
  }
});

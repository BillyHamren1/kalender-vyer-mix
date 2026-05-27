// get-staff-day-gps-result
// =============================================================================
// External API för CANONICAL GPS-dagsresultat. ENDA endpoint som ska kallas av
// nya konsumenter (mobil/admin/lön). Bygger ingen egen logik — delegerar till
// buildCanonicalStaffDayGpsResult.
//
// POST { staffId, date, forceRefresh? }   → CanonicalStaffDayGpsResult
//
// Skriver ALDRIG till time_reports/workdays/LTE/travel/staff_day_*. Endast
// snapshot-cachen (staff_gps_day_snapshots) som getOrBuildDaySnapshot redan
// underhåller.
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import { buildCanonicalStaffDayGpsResult } from "../_shared/staff-gps/canonicalStaffDayGpsResult.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface RequestBody {
  staffId?: string;
  date?: string;
  forceRefresh?: boolean;
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: RequestBody;
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

  const staffId = String(body.staffId ?? "").trim();
  const date = String(body.date ?? "").trim();
  if (!staffId) return bad(400, "staffId required");
  if (!ISO_DATE.test(date)) return bad(400, "date must be YYYY-MM-DD");
  const forceRefresh = body.forceRefresh === true;

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);

  const admin = authResult.auth.admin;
  const organizationId = access.orgId;

  try {
    const result = await buildCanonicalStaffDayGpsResult(admin, {
      organizationId,
      staffId,
      date,
      forceRefresh,
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[get-staff-day-gps-result] build failed", err);
    return bad(500, "canonical build failed", { details: (err as Error).message });
  }
});

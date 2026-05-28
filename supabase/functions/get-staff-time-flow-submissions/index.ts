// get-staff-time-flow-submissions
// ================================
// Dual-auth READ-ONLY endpoint för WeekFlow i mobil-/admin-vyn. Returnerar
// staff_day_submissions för en (staffId, from, to) — inget mer. Skriver inte
// till någon tabell. Rör inte time_reports/workdays/location_time_entries/
// travel_time_logs/day_attestations. Kör inte Time Engine.
//
// Accepterar både mobile token och Supabase JWT via _shared/staff-auth.ts.
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";

interface RequestBody {
  staffId?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const from = (body.from ?? "").trim();
  const to = (body.to ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return bad(400, "from/to must be YYYY-MM-DD");
  }
  if (from > to) return bad(400, "from must be <= to");

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);
  const orgId = access.orgId;
  const admin = authResult.auth.admin;

  try {
    // READ-ONLY: endast staff_day_submissions.
    const { data, error } = await admin
      .from("staff_day_submissions")
      .select(
        "id, organization_id, staff_id, date, status, start_time, end_time, requested_start_at, requested_end_at, break_minutes, comment, review_comment, reviewed_at, reviewed_by, submitted_at, updated_at, display_timeline_snapshot_json",
      )
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("date", from)
      .lte("date", to)
      .order("submitted_at", { ascending: false })
      .limit(200);

    if (error) return bad(500, "submissions query failed", { details: error.message });

    return new Response(
      JSON.stringify({
        staffId,
        from,
        to,
        submissions: data ?? [],
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return bad(500, "submissions failed", { details: (err as Error).message });
  }
});

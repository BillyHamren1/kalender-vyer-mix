// submit-staff-day-v3
// =====================
// New mobile submission write path. Replaces attest-staff-day for the Time app.
//
// Writes ONLY to staff_day_submissions. Never touches:
//   day_attestations / time_reports / workdays / location_time_entries / travel_time_logs.
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";

interface SubmitBody {
  staffId?: string;
  date?: string;
  requestedStartAt?: string | null;
  requestedEndAt?: string | null;
  breakMinutes?: number;
  comment?: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: SubmitBody;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const date = String(body.date ?? "").trim();
  const staffId = String(body.staffId ?? "").trim();
  if (!staffId) return jsonResponse({ error: "staffId required" }, 400);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: "Invalid date (YYYY-MM-DD required)" }, 400);
  }
  const breakMin = Math.max(0, Math.round(Number(body.breakMinutes ?? 0)));
  const reqStart = body.requestedStartAt ? String(body.requestedStartAt) : null;
  const reqEnd = body.requestedEndAt ? String(body.requestedEndAt) : null;
  const comment = body.comment ? String(body.comment).slice(0, 4000) : null;

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return jsonResponse({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return jsonResponse({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;

  // Snapshot the cache summary at submission time for traceability.
  let engineVersion: string | null = null;
  let sourceSummary: any = null;
  try {
    const { data } = await admin
      .from("staff_day_report_cache")
      .select("engine_version, summary_json")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .order("built_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      engineVersion = (data as any).engine_version ?? null;
      sourceSummary = (data as any).summary_json ?? null;
    }
  } catch (e) {
    console.error("[submit-staff-day-v3] cache snapshot failed", e);
  }

  const payload = {
    organization_id: orgId,
    staff_id: staffId,
    date,
    status: "submitted",
    requested_start_at: reqStart,
    requested_end_at: reqEnd,
    break_minutes: breakMin,
    comment,
    engine_version: engineVersion,
    source_summary_json: sourceSummary,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    review_comment: null,
  };

  const { data, error } = await admin
    .from("staff_day_submissions")
    .upsert(payload, { onConflict: "staff_id,date" })
    .select()
    .single();

  if (error) {
    console.error("[submit-staff-day-v3] upsert failed", error);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, submission: data });
});

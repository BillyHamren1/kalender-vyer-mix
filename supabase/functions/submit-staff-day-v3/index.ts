// submit-staff-day-v3
// =====================
// New mobile submission write path. Replaces attest-staff-day for the Time app.
//
// Writes ONLY to staff_day_submissions. Never touches:
//   day_attestations / time_reports / workdays / location_time_entries / travel_time_logs.
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import {
  applyUserEditsToDisplayTimeline,
  type DisplayBlockShape,
  type UserEdit,
} from "../_shared/time-engine/applyUserEditsToDisplayTimeline.ts";

interface SubmitBody {
  staffId?: string;
  date?: string;
  requestedStartAt?: string | null;
  requestedEndAt?: string | null;
  breakMinutes?: number;
  comment?: string | null;
  // Lager 5.3 — frivilliga fält. Saknas de beter sig endpointen som tidigare.
  userEdits?: UserEdit[];
  displayTimelineSnapshot?: DisplayBlockShape[];
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

  // Lager 5.3 — användarredigeringar. Påverkar ALDRIG GPS/evidence/time_reports.
  const incomingEdits = Array.isArray(body.userEdits) ? body.userEdits : [];
  const snapshotBlocks = Array.isArray(body.displayTimelineSnapshot)
    ? body.displayTimelineSnapshot
    : [];

  let userEditsResult: ReturnType<typeof applyUserEditsToDisplayTimeline> | null = null;
  let resolvedStatus = "submitted";
  if (incomingEdits.length > 0) {
    userEditsResult = applyUserEditsToDisplayTimeline(snapshotBlocks, incomingEdits);
    // Mappa Lager 5.3-statusen mjukt till submission-statusvokabulären.
    switch (userEditsResult.suggestedSubmissionStatus) {
      case "ai_flagged": resolvedStatus = "ai_flagged"; break;
      case "needs_user_attention": resolvedStatus = "needs_user_attention"; break;
      case "edited_by_user": resolvedStatus = "edited"; break;
      default: resolvedStatus = "submitted";
    }
  }

  const payload = {
    organization_id: orgId,
    staff_id: staffId,
    date,
    status: resolvedStatus,
    requested_start_at: reqStart,
    requested_end_at: reqEnd,
    break_minutes: breakMin,
    comment,
    engine_version: engineVersion,
    source_summary_json: sourceSummary,
    user_edits_json: userEditsResult
      ? {
          edits: incomingEdits,
          appliedEdits: userEditsResult.appliedEdits,
          dayLevelEdits: userEditsResult.dayLevelEdits,
          editedBlocks: userEditsResult.editedBlocks,
          diagnostics: userEditsResult.diagnostics,
        }
      : null,
    display_timeline_snapshot_json: snapshotBlocks.length > 0 ? snapshotBlocks : null,
    ai_validation_json: null, // sätts i Lager 5.4
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

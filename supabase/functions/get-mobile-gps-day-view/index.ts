// get-mobile-gps-day-view
// =============================================================================
// Time v2 — RENDERBAR GPS Day View per dag för mobilen.
// Appen är dum: tar emot vyn färdig och renderar.
//
// Returnerar ALDRIG: pings-array, time_reports, workdays, location_time_entries,
// travel_time_logs, staff_day_report_cache, report_candidate_blocks_json,
// display_blocks_json.
//
// Input:  { staffId, date }
// Output: { title, subtitle, segments, rows, totals, submission, messages, debug }

import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  fetchPingsForDayV2,
  loadKnownTargetsV2,
  loadMessages,
  loadSubmission,
  readManualOverridesFromSubmission,
} from "../_shared/time-v2/loaders.ts";
import { buildDayView } from "../_shared/time-v2/buildDayView.ts";
import { buildDayMap } from "../_shared/time-v2/buildDayMap.ts";
import { buildGpsDayTimelineOnly } from "../_shared/timeline/buildGpsDayTimelineOnly.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { staffId?: string; date?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const staffId = String(body.staffId ?? "").trim();
  const date = String(body.date ?? "").trim();
  if (!staffId) return json({ error: "staffId required" }, 400);
  if (!ISO_DATE.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return json({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return json({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;

  // Hämta staff name (best effort).
  let staffName: string | null = null;
  try {
    const { data } = await admin
      .from("staff")
      .select("first_name, last_name, name")
      .eq("id", staffId)
      .maybeSingle();
    if (data) {
      const full = `${(data as any).first_name ?? ""} ${(data as any).last_name ?? ""}`.trim();
      staffName = full || (data as any).name || null;
    }
  } catch (_e) { /* ignore */ }

  const submission = await loadSubmission(admin, orgId, staffId, date);

  // Manuella overrides hämtas från senaste inskickade payload (om sub finns)
  // så att en pågående dag eller en correction_requested-dag visar vad
  // användaren tidigare ändrade.
  let payload: any = null;
  if (submission.hasSubmission) {
    try {
      const { data } = await admin
        .from("staff_day_submissions")
        .select("submitted_payload_json")
        .eq("id", submission.id)
        .maybeSingle();
      payload = (data as any)?.submitted_payload_json ?? null;
    } catch (_e) { /* ignore */ }
  }
  const manualOverrides = readManualOverridesFromSubmission(submission, payload);

  let knownTargets: any[] = [];
  try {
    knownTargets = await loadKnownTargetsV2(admin, orgId);
  } catch (e) {
    console.error("[get-mobile-gps-day-view] target load failed", e);
    return json({ error: "target load failed" }, 500);
  }

  let pings: any[] = [];
  try {
    pings = await fetchPingsForDayV2(admin, staffId, date);
  } catch (e) {
    console.error("[get-mobile-gps-day-view] ping fetch failed", e);
    return json({ error: "ping fetch failed" }, 500);
  }

  const timeline = buildGpsDayTimelineOnly({
    staffId,
    organizationId: orgId,
    date,
    pings,
    knownTargets,
  });

  const view = buildDayView({
    staffId,
    organizationId: orgId,
    date,
    pings,
    knownTargets,
    manualOverrides,
    staffName,
    prebuiltTimeline: timeline,
  });

  const map = buildDayMap({
    pings,
    segments: timeline.segments,
    knownTargets,
  });

  // sourceSnapshotId = stabil hash av råinput → används av submit för traceability
  const sourceSnapshotId = `${date}:${staffId}:${view.rawPingCount}:${view.firstPingAt ?? "-"}:${view.lastPingAt ?? "-"}`;

  const messages = await loadMessages(admin, orgId, staffId, date, 20);

  // Härled reportMode för mobilen.
  const subStatus = String(submission.status ?? "not_submitted");
  const isLocked = subStatus === "approved" || subStatus === "payroll_approved";
  const hasSegs = (view.segments?.length ?? 0) > 0;
  const reportMode: "submitted" | "locked" | "gps_suggestion" | "manual_empty" =
    isLocked
      ? "locked"
      : submission.hasSubmission
        ? "submitted"
        : hasSegs
          ? "gps_suggestion"
          : "manual_empty";
  const canSubmitManual = reportMode === "manual_empty";

  return json({
    source: "mobile_gps_day_view_v2",
    staffId,
    date,
    sourceSnapshotId,
    title: view.title,
    subtitle: view.subtitle,
    reportMode,
    canSubmitManual,
    map,
    segments: view.segments,
    rows: view.rows,
    totals: view.totals,
    manualOverridesSummary: view.manualOverridesSummary,
    submission: {
      hasSubmission: submission.hasSubmission,
      status: submission.status,
      submittedAt: submission.submittedAt,
      submittedBy: submission.submittedBy,
      userComment: submission.userComment,
      reviewComment: submission.reviewComment,
      correctionRequestedAt: submission.correctionRequestedAt,
      correctionRequestedBy: submission.correctionRequestedBy,
      canEdit: submission.canEdit,
      canSubmit: submission.canSubmit,
      needsCorrection: submission.needsCorrection,
    },
    messages,
    debug: {
      rawPingCount: view.rawPingCount,
      firstPingAt: view.firstPingAt,
      lastPingAt: view.lastPingAt,
    },
    generatedAt: new Date().toISOString(),
  });
});

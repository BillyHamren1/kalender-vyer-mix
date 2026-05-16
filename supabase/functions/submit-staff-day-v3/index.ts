// submit-staff-day-v3
// =====================
// New mobile submission write path. Replaces attest-staff-day for the Time app.
//
// Writes ONLY to staff_day_submissions. Never touches:
//   day_attestations / time_reports / workdays / location_time_entries / travel_time_logs.
//
// Backend validation (last line of defense — frontend already enforces these):
//   - requestedStartAt + requestedEndAt required for manual reporting
//   - start strictly before end
//   - gross ≤ 16h (960 min)
//   - breakMinutes 0..600
//   - payable (gross - break) > 0
//   - payload `date` must match Stockholm-local date of requestedStartAt
//   - if existing submission.status === 'approved' → block unless caller is
//     privileged JWT (admin/projekt/lager). Vanlig användare kan inte ändra.
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
  userEdits?: UserEdit[];
  displayTimelineSnapshot?: DisplayBlockShape[];
}

const TZ = "Europe/Stockholm";
const MAX_GROSS_MIN = 16 * 60;
const MAX_BREAK_MIN = 600;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Stockholm-lokal YYYY-MM-DD från en ISO/UTC-tid. */
function stockholmDateOf(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(t));
  return /^\d{4}-\d{2}-\d{2}$/.test(parts) ? parts : null;
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

  // ── Hard validation ─────────────────────────────────────────────
  if (!reqStart || !reqEnd) {
    return jsonResponse({ error: "requestedStartAt och requestedEndAt krävs" }, 400);
  }
  const startMs = Date.parse(reqStart);
  const endMs = Date.parse(reqEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return jsonResponse({ error: "Ogiltig start- eller sluttid" }, 400);
  }
  if (startMs >= endMs) {
    return jsonResponse({ error: "Starttid måste vara före sluttid" }, 400);
  }
  const grossMin = Math.round((endMs - startMs) / 60000);
  if (grossMin > MAX_GROSS_MIN) {
    return jsonResponse({ error: `Brutto överstiger ${MAX_GROSS_MIN / 60} timmar` }, 400);
  }
  if (breakMin < 0 || breakMin > MAX_BREAK_MIN) {
    return jsonResponse({ error: `Rast måste vara 0–${MAX_BREAK_MIN} minuter` }, 400);
  }
  const payableMin = grossMin - breakMin;
  if (payableMin <= 0) {
    return jsonResponse({ error: "Lönegrundande tid måste vara större än 0" }, 400);
  }
  const stockholmStartDate = stockholmDateOf(reqStart);
  if (!stockholmStartDate || stockholmStartDate !== date) {
    return jsonResponse(
      { error: `Datumet matchar inte starttidens dag (${stockholmStartDate ?? "okänt"})` },
      400,
    );
  }

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return jsonResponse({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return jsonResponse({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;
  const isPrivilegedAdmin =
    authResult.auth.mode === "jwt" && authResult.auth.isPrivileged === true;

  // ── Approved-lock: only privileged JWT can change ───────────────
  try {
    const { data: existing } = await admin
      .from("staff_day_submissions")
      .select("status")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle();
    if (existing && (existing as any).status === "approved" && !isPrivilegedAdmin) {
      return jsonResponse(
        { error: "Dagen är redan godkänd och kan inte ändras" },
        409,
      );
    }
  } catch (e) {
    console.error("[submit-staff-day-v3] approved-lock check failed", e);
  }

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

  // Lager 5.3 — användarredigeringar.
  const incomingEdits = Array.isArray(body.userEdits) ? body.userEdits : [];
  const snapshotBlocks = Array.isArray(body.displayTimelineSnapshot)
    ? body.displayTimelineSnapshot
    : [];

  let userEditsResult: ReturnType<typeof applyUserEditsToDisplayTimeline> | null = null;
  let resolvedStatus = "submitted";
  if (incomingEdits.length > 0) {
    userEditsResult = applyUserEditsToDisplayTimeline(snapshotBlocks, incomingEdits);
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
    ai_validation_json: null,
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

// get-mobile-staff-day-report
// =============================
// Single READ endpoint for the mobile Time-app day view.
//
// PURE MIRROR of /staff-management/time-reports read model:
//   1. staff_day_report_cache  (Time Engine cache — same as admin web)
//   2. staff_day_submissions   (user inskick/attest)
//
// MUST NOT read:
//   - workdays
//   - time_reports
//   - location_time_entries
//   - travel_time_logs
//   - day_attestations
//   - active_time_registrations
// These remain legacy/debug. Liveness is derived from the cache only.
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import {
  buildMobileSnapshot,
  type CacheRow,
  type SubmissionRow,
} from "../_shared/mobile/buildMobileSnapshot.ts";

interface RequestBody {
  staffId?: string;
  date?: string;
  force?: boolean;
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

  let body: RequestBody;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const date = String(body.date ?? "").trim();
  const staffId = String(body.staffId ?? "").trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: "Invalid date (YYYY-MM-DD required)" }, 400);
  }
  if (!staffId) return jsonResponse({ error: "staffId required" }, 400);

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return jsonResponse({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return jsonResponse({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;

  // 1) Cache row — pick the row matching the latest engine_version for this staff/date.
  let cache: CacheRow | null = null;
  try {
    const { data, error } = await admin
      .from("staff_day_report_cache")
      .select(
        "engine_version, summary_json, report_candidate_blocks_json, display_blocks_json, diagnostics_json, built_at, stale, error",
      )
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .order("built_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[get-mobile-staff-day-report] cache fetch error", error);
    } else if (data) {
      cache = data as unknown as CacheRow;
    }
  } catch (e) {
    console.error("[get-mobile-staff-day-report] cache exception", e);
  }

  // 2) Submission row (if any).
  let submission: SubmissionRow | null = null;
  try {
    const { data } = await admin
      .from("staff_day_submissions")
      .select(
        "status, requested_start_at, requested_end_at, break_minutes, comment, submitted_at, reviewed_at, review_comment",
      )
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle();
    if (data) submission = data as unknown as SubmissionRow;
  } catch (e) {
    console.error("[get-mobile-staff-day-report] submission exception", e);
  }

  // 3) Workday liveness — purely for the "is the day open?" flag.
  let workday: WorkdayLivenessRow | null = null;
  try {
    const { data } = await admin
      .from("workdays")
      .select("start_time, end_time")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) workday = data as unknown as WorkdayLivenessRow;
  } catch (e) {
    console.error("[get-mobile-staff-day-report] workday exception", e);
  }

  const snapshot = buildMobileSnapshot({ date, staffId, cache, submission, workday });
  return jsonResponse(snapshot);
});

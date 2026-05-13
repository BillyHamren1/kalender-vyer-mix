// get-mobile-staff-day-report
// =============================
// Single READ endpoint for the mobile Time-app day view.
//
// PURE MIRROR of /staff-management/time-reports read model:
//   1. staff_day_report_cache  (Time Engine cache — same as admin web)
//   2. staff_day_submissions   (user inskick/attest)
//
// FALLBACK (Time App Mirror Fix 1):
//   If the cache for staff/date is missing / stale / errored / has 0 blocks,
//   we invoke `get-staff-presence-day` (the SAME live Time Engine call that
//   /staff-management/time-reports uses) and mirror its
//   `reportCandidateBlocks` + `reportCandidateSummary` 1:1.
//
//   This is NOT a separate mobile engine — it's the exact same server-side
//   Time Engine read the admin web uses. The mobile mirror just gets the
//   live result instead of silently returning 0h when the cache is cold.
//
// MUST NOT read:
//   - workdays
//   - time_reports
//   - location_time_entries
//   - travel_time_logs
//   - day_attestations
//   - active_time_registrations
// These remain legacy/debug. Liveness is derived from the cache/engine result only.
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import { buildTimerOwnershipDiagnostics } from "../_shared/diagnostics/buildTimerOwnershipDiagnostics.ts";
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

type DebugSource = "cache" | "live_engine" | "missing" | "missing_engine_result";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function blockArrayLength(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

/**
 * Mirror of `pickCacheBlocks` in _shared/mobile/mapReportBlocksToSegments.ts.
 * Centralises priority: display_blocks_json → report_candidate_blocks_json.
 * Used here only for the `cacheUnusable` decision; the actual mapping in
 * `buildMobileSnapshot` calls `pickCacheBlocks` directly.
 */
function effectiveCacheBlockCount(cache: CacheRow | null): number {
  if (!cache) return 0;
  const display = blockArrayLength(cache.display_blocks_json);
  if (display > 0) return display;
  return blockArrayLength(cache.report_candidate_blocks_json);
}

/**
 * Invoke the same live Time Engine read that admin web uses
 * (`/staff-management/time-reports` → `get-staff-presence-day`).
 * Returns a CacheRow-shaped object so it can be passed straight through
 * `buildMobileSnapshot` without changing the mapper.
 */
async function fetchLiveEngineAsCacheRow(
  staffId: string,
  organizationId: string,
  date: string,
): Promise<{ row: CacheRow | null; raw: any; error: string | null }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { row: null, raw: null, error: "missing_supabase_env" };
  }
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-staff-presence-day`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ staffId, organizationId, date }),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.ok === false) {
      return {
        row: null,
        raw: json,
        error: json?.error ?? `presence_day_http_${resp.status}`,
      };
    }
    const blocks = Array.isArray(json.reportCandidateBlocks)
      ? json.reportCandidateBlocks
      : [];
    const summary = json.reportCandidateSummary ?? null;
    const row: CacheRow = {
      engine_version: json?.reportCandidateDiagnostics?.engineVersion ?? "live",
      summary_json: summary ?? {},
      report_candidate_blocks_json: blocks,
      display_blocks_json: blocks,
      diagnostics_json: json.reportCandidateDiagnostics ?? null,
      built_at: new Date().toISOString(),
      stale: false,
      error: null,
    };
    return { row, raw: json, error: null };
  } catch (e) {
    return { row: null, raw: null, error: (e as Error)?.message ?? String(e) };
  }
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
  let cacheFetchError: string | null = null;
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
      cacheFetchError = error.message ?? String(error);
      console.error("[get-mobile-staff-day-report] cache fetch error", error);
    } else if (data) {
      cache = data as unknown as CacheRow;
    }
  } catch (e) {
    cacheFetchError = (e as Error)?.message ?? String(e);
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

  // 3) Decide whether to use cache or fall back to live engine.
  // The mobile mirror MUST NOT show 0h if admin web's live engine has data.
  // Priority: display_blocks_json → report_candidate_blocks_json → live engine.
  const cacheBlockCount = effectiveCacheBlockCount(cache);
  const cacheUnusable =
    !cache ||
    !!cache.error ||
    !!cache.stale ||
    cacheBlockCount === 0 ||
    body.force === true;

  let debugSource: DebugSource = cache ? "cache" : "missing";
  let liveEngineError: string | null = null;
  let effectiveCache: CacheRow | null = cache;

  if (cacheUnusable) {
    const live = await fetchLiveEngineAsCacheRow(staffId, orgId, date);
    if (live.row && effectiveCacheBlockCount(live.row) > 0) {
      effectiveCache = live.row;
      debugSource = "live_engine";
    } else if (!cache) {
      // Neither cache nor live engine produced anything.
      debugSource = live.error ? "missing_engine_result" : "missing";
      liveEngineError = live.error;
    } else {
      // Cache exists but empty/stale and live didn't help — keep cache as-is.
      debugSource = "cache";
      liveEngineError = live.error;
    }
  }

  // NOTE: workdays / active_time_registrations are intentionally NOT read here.
  const snapshot = buildMobileSnapshot({
    date,
    staffId,
    cache: effectiveCache,
    submission,
  });

  const debug = {
    debugSource,
    blockCount: snapshot.segments.length,
    summaryWorkMinutes: snapshot.summary.workMinutes,
    summaryTransportMinutes: snapshot.summary.travelMinutes,
    summaryReviewMinutes: snapshot.summary.reviewMinutes,
    engineVersion: effectiveCache?.engine_version ?? null,
    cacheBuiltAt: cache?.built_at ?? null,
    cacheStale: cache?.stale ?? null,
    cacheError: cache?.error ?? null,
    cacheFetchError,
    cacheBlockCount,
    liveEngineError,
  };

  console.info("[get-mobile-staff-day-report] mirror", {
    staffId, date, ...debug,
  });

  return jsonResponse({ ...snapshot, debug });
});

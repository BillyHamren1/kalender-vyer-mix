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
type DisplaySourceUsed =
  | "display_timeline_v2"
  | "report_candidate_legacy_fallback"
  | "empty_v2_decision"
  | "none";

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
 * V2-aware: when `display_blocks_json` is an Array (even empty) it counts as
 * the V2 decision and we DO NOT fall back to report_candidate_blocks_json.
 * Used here only for the `cacheUnusable` decision; the actual mapping in
 * `buildMobileSnapshot` calls `pickCacheBlocks` directly.
 */
function effectiveCacheBlockCount(cache: CacheRow | null): number {
  if (!cache) return 0;
  if (Array.isArray(cache.display_blocks_json)) {
    return cache.display_blocks_json.length;
  }
  return blockArrayLength(cache.report_candidate_blocks_json);
}

function describeDisplaySource(cache: CacheRow | null): DisplaySourceUsed {
  if (!cache) return "none";
  if (Array.isArray(cache.display_blocks_json)) {
    return cache.display_blocks_json.length > 0
      ? "display_timeline_v2"
      : "empty_v2_decision";
  }
  if (Array.isArray(cache.report_candidate_blocks_json) && cache.report_candidate_blocks_json.length > 0) {
    return "report_candidate_legacy_fallback";
  }
  return "none";
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
    // V2 PRIORITY (Time Reporting Fix 1):
    //   Mobilen MÅSTE använda displayTimelineBlocksV2 som primär källa –
    //   samma som admin-Gantt. reportCandidateBlocks är bara en
    //   legacy-fallback när V2-fältet saknas helt (äldre backend).
    //
    //   Om V2-fältet finns men är tomt = explicit V2-beslut → display
    //   förblir tomt (UI visar V2-tom evidence-status). Vi får ALDRIG
    //   fallbacka till reportCandidateBlocks i det läget.
    const hasV2Field = Array.isArray(json.displayTimelineBlocksV2);
    const displayBlocks = hasV2Field
      ? (json.displayTimelineBlocksV2 as any[])
      : (Array.isArray(json.reportCandidateBlocks) ? json.reportCandidateBlocks : []);
    const reportCandidateBlocks = Array.isArray(json.reportCandidateBlocks)
      ? json.reportCandidateBlocks
      : [];
    const workdayAllocationSegments = Array.isArray(json.workdayAllocationSegments)
      ? json.workdayAllocationSegments
      : [];
    const locationTruthSegments = Array.isArray(json.locationTruthV2Segments)
      ? json.locationTruthV2Segments
      : [];
    const sourceUsed: DisplaySourceUsed = hasV2Field
      ? (displayBlocks.length > 0 ? "display_timeline_v2" : "empty_v2_decision")
      : (reportCandidateBlocks.length > 0 ? "report_candidate_legacy_fallback" : "none");
    const summary = json.reportCandidateSummary ?? null;
    const row: CacheRow = {
      engine_version: json?.reportCandidateDiagnostics?.engineVersion ?? "live",
      summary_json: summary ?? {},
      report_candidate_blocks_json: reportCandidateBlocks,
      display_blocks_json: displayBlocks,
      diagnostics_json: {
        ...(json.reportCandidateDiagnostics ?? {}),
        unknownLocationDiagnostics: json.unknownLocationDiagnostics ?? null,
        displayTimelineDiagnosticsV2: json.displayTimelineDiagnosticsV2 ?? null,
        workdayAllocationDiagnostics: json.workdayAllocationDiagnostics ?? null,
        workdayAllocationSegmentsCount: workdayAllocationSegments.length,
        locationTruthV2SegmentsCount: locationTruthSegments.length,
        mobileDisplaySourceUsed: sourceUsed,
        v2FieldPresent: hasV2Field,
      },
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
  //
  // V2-aware (Time Reporting Fix 1):
  //   - Om cache har display_blocks_json som Array (även tom) = explicit V2-beslut.
  //     Då fetchar vi INTE live; tom är ett legitimt svar och får inte fyllas
  //     med reportCandidate-fallback.
  //   - Vi fetchar live ENDAST när cache helt saknas/har error/är stale eller
  //     när V2-fältet aldrig kommit in (display_blocks_json saknas) och inga
  //     candidate-blocks heller finns.
  const cacheHasV2Field = Array.isArray(cache?.display_blocks_json);
  const cacheBlockCount = effectiveCacheBlockCount(cache);
  const cacheUnusable =
    !cache ||
    !!cache.error ||
    !!cache.stale ||
    (!cacheHasV2Field && cacheBlockCount === 0) ||
    body.force === true;

  let debugSource: DebugSource = cache ? "cache" : "missing";
  let liveEngineError: string | null = null;
  let effectiveCache: CacheRow | null = cache;

  if (cacheUnusable) {
    const live = await fetchLiveEngineAsCacheRow(staffId, orgId, date);
    if (live.row) {
      // Adopt live row even when V2 is empty — that's an explicit V2 decision
      // that must reach the mobile UI (instead of legacy candidate fallback).
      effectiveCache = live.row;
      debugSource = "live_engine";
      liveEngineError = live.error;
    } else if (!cache) {
      debugSource = live.error ? "missing_engine_result" : "missing";
      liveEngineError = live.error;
    } else {
      debugSource = "cache";
      liveEngineError = live.error;
    }
  }

  const displaySourceUsed = describeDisplaySource(effectiveCache);

  // NOTE: workdays / active_time_registrations are intentionally NOT read here.
  const snapshot = buildMobileSnapshot({
    date,
    staffId,
    cache: effectiveCache,
    submission,
  });

  // Time Legacy Purge 4 — GPS evidence.
  // När mirror inte gav några segment (V2 tom / inga blocks alls) men staffen
  // har raw GPS-pings för dagen, exponera en separat evidence-rad så mobilen
  // kan visa "GPS finns HH:mm–HH:mm" i stället för tomt eller legacy-fallback.
  // Räknas ALDRIG som arbete, påverkar inte totals.
  let gpsEvidence: import("../_shared/mobile/types.ts").MobileGpsEvidence | null = null;
  try {
    if (snapshot.segments.length === 0) {
      // Stockholm day window via simple UTC bounds (dagen i Europe/Stockholm
      // ligger ca [date 00:00 +01/+02, date+1 00:00 +01/+02]). Vi padar med
      // ±2h för att täcka DST utan att blöda in i grannens dag.
      const dayStartUtc = new Date(`${date}T00:00:00+02:00`);
      const dayEndUtc = new Date(`${date}T23:59:59+01:00`);
      const startIso = new Date(dayStartUtc.getTime() - 2 * 3600 * 1000).toISOString();
      const endIso = new Date(dayEndUtc.getTime() + 2 * 3600 * 1000).toISOString();
      const { count, error: countErr } = await admin
        .from("staff_location_history")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("staff_id", staffId)
        .gte("recorded_at", startIso)
        .lte("recorded_at", endIso);
      const pingCount = countErr ? 0 : (count ?? 0);
      if (pingCount > 0) {
        const [{ data: firstRow }, { data: lastRow }] = await Promise.all([
          admin.from("staff_location_history")
            .select("recorded_at")
            .eq("organization_id", orgId).eq("staff_id", staffId)
            .gte("recorded_at", startIso).lte("recorded_at", endIso)
            .order("recorded_at", { ascending: true }).limit(1).maybeSingle(),
          admin.from("staff_location_history")
            .select("recorded_at")
            .eq("organization_id", orgId).eq("staff_id", staffId)
            .gte("recorded_at", startIso).lte("recorded_at", endIso)
            .order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        gpsEvidence = {
          hasGpsEvidenceButNoRenderedWork: true,
          gpsEvidenceStartAt: (firstRow as any)?.recorded_at ?? null,
          gpsEvidenceEndAt: (lastRow as any)?.recorded_at ?? null,
          rawPingCount: pingCount,
          reasonNoWorkRendered: effectiveCache
            ? (cacheHasV2Field ? "v2_present_but_empty" : "no_renderable_work_blocks")
            : "no_cache_no_engine_result",
        };
      } else {
        gpsEvidence = {
          hasGpsEvidenceButNoRenderedWork: false,
          gpsEvidenceStartAt: null,
          gpsEvidenceEndAt: null,
          rawPingCount: 0,
          reasonNoWorkRendered: null,
        };
      }
    }
  } catch (e) {
    console.warn("[get-mobile-staff-day-report] gpsEvidence fetch failed", e);
  }

  // READ-ONLY ownership diagnostics (Single Timer Policy verifier).
  // Gated on body.debug — opt-in only, never affects snapshot.
  // Display timeline comes from staff_day_report_cache (above).
  // Do not reintroduce project timers in mobile app.
  let timerOwnership = null;
  if (body?.debug === true) {
    try {
      timerOwnership = await buildTimerOwnershipDiagnostics({
        admin, organizationId: orgId, staffId, date,
      });
    } catch (e) {
      console.warn("[get-mobile-staff-day-report] diagnostics failed", e);
    }
  }

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
    cacheHasV2Field,
    displaySourceUsed,
    liveEngineError,
    timerOwnership,
    gpsEvidence,
  };

  console.info("[get-mobile-staff-day-report] mirror", {
    staffId, date, ...debug,
  });

  return jsonResponse({ ...snapshot, gpsEvidence, debug });
});

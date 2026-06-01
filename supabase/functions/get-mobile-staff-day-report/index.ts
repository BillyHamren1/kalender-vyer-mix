// get-mobile-staff-day-report
// =============================
// Mobilappens ENDA dagsläsning. Går EXKLUSIVT genom den centrala
// resolvern `resolveStaffDayReport` — exakt samma sanning som
// /staff-management/time-reports och Tid & Lön.
//
// PRIORITET (i resolvern):
//   1. staff_day_submissions
//   2. staff_day_report_cache
//   3. empty
//
// FÖRBJUDET här (locked by contract test):
//   - staff_location_history  (raw GPS — ägs av Time Engine)
//   - time_reports / workdays / location_time_entries / travel_time_logs
//   - day_attestations / active_time_registrations
//   - get-staff-presence-day (live engine — endast Time Engine får bygga)
//
// Output: MobileDayReport (oförändrat kontrakt) byggt via buildMobileSnapshot
// från resolverns rawCache + rawSubmission.
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import { buildTimerOwnershipDiagnostics } from "../_shared/diagnostics/buildTimerOwnershipDiagnostics.ts";
import {
  buildMobileSnapshot,
  type CacheRow,
  type SubmissionRow,
} from "../_shared/mobile/buildMobileSnapshot.ts";
import { resolveStaffDayReport } from "../_shared/staff-day-report/resolveStaffDayReport.ts";

interface RequestBody {
  staffId?: string;
  date?: string;
  debug?: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toSubmissionRow(raw: any): SubmissionRow | null {
  if (!raw) return null;
  return {
    status: String(raw.status ?? "submitted"),
    requested_start_at: raw.requested_start_at ?? null,
    requested_end_at: raw.requested_end_at ?? null,
    break_minutes: raw.break_minutes ?? null,
    comment: raw.comment ?? null,
    submitted_at: raw.submitted_at ?? new Date().toISOString(),
    reviewed_at: raw.reviewed_at ?? null,
    review_comment: raw.review_comment ?? null,
  };
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

  // Single source of truth: the central resolver.
  let resolved;
  try {
    resolved = await resolveStaffDayReport({
      admin,
      organizationId: orgId,
      staffId,
      date,
    });
  } catch (e) {
    console.error("[get-mobile-staff-day-report] resolver failed", e);
    return jsonResponse({ error: "resolver_failed", message: (e as Error)?.message ?? String(e) }, 500);
  }

  const cache: CacheRow | null = resolved.rawCache as CacheRow | null;
  const submission = toSubmissionRow(resolved.rawSubmission);

  const snapshot = buildMobileSnapshot({
    date,
    staffId,
    cache,
    submission,
  });

  // Opt-in read-only diagnostics. Never affects snapshot.
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
    resolverSource: resolved.source,         // 'submission' | 'cache' | 'empty'
    resolverStatus: resolved.status,
    blockCount: snapshot.segments.length,
    summaryWorkMinutes: snapshot.summary.workMinutes,
    summaryTransportMinutes: snapshot.summary.travelMinutes,
    summaryReviewMinutes: snapshot.summary.reviewMinutes,
    engineVersion: resolved.engineVersion,
    cacheBuiltAt: resolved.cacheBuiltAt,
    cacheError: cache?.error ?? null,
    cacheStale: cache?.stale ?? null,
    timerOwnership,
  };

  console.info("[get-mobile-staff-day-report] resolved", {
    staffId, date,
    source: resolved.source,
    status: resolved.status,
    blocks: snapshot.segments.length,
  });

  return jsonResponse({
    ...snapshot,
    // Provenance for klienter som vill veta varifrån dagen kom.
    resolverSource: resolved.source,
    resolverStatus: resolved.status,
    // Behåll kompatibilitet med tidigare consumers som tittade direkt på
    // cache-fältnamn. Hämtas från rawCache när den finns; aldrig från
    // någon live-engine längre.
    reportCandidateBlocks: cache?.report_candidate_blocks_json ?? null,
    displayTimelineBlocksV2: Array.isArray(cache?.display_blocks_json)
      ? cache?.display_blocks_json
      : null,
    workdayAllocationSegments: Array.isArray((cache as any)?.workday_allocation_segments_json)
      ? (cache as any).workday_allocation_segments_json
      : null,
    debug,
  });
});

// get-mobile-gps-day-view
// =============================================================================
// SINGLE-PIPELINE: denna endpoint är en TUNN projektion av resolveStaffDayReport
// (staff_day_submissions → staff_day_report_cache → empty). Den bygger inte
// längre någon dag från raw GPS.
//
// Får INTE läsa:
//   - staff_location_history (raw GPS)
//   - time_reports / workdays / location_time_entries / travel_time_logs
//   - day_attestations / active_time_registrations
//
// Får INTE skriva någonting.
//
// Output behåller v2-formen (segments / rows / totals / submission / manualTargets
// / anchors / map) så att DayReviewSheet, MobileDayReportPreview och
// ManualWorkSegmentsEditor kan fortsätta konsumera den utan UI-omskrivning.
// Kartan returneras som en tom shell — appens kartlager är dummad ut tills
// vi har en cache-driven karta.
//
// Input:  { staffId, date }
// Output: { title, subtitle, segments, rows, totals, submission, messages,
//           manualTargets, anchors, map, debug }
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  loadManualReportTargetsForDay,
  loadMessages,
  loadSubmission,
} from "../_shared/time-v2/loaders.ts";
import {
  buildAnchorsPayload,
  computeAnchorSuggestions,
  loadAnchorsForDay,
} from "../_shared/time-v2/anchors.ts";
import { resolveStaffDayReport } from "../_shared/staff-day-report/resolveStaffDayReport.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache-block → view-segment mapper
// (oförändrat format jämfört med tidigare v2 så att UI-shapen står kvar)
// ─────────────────────────────────────────────────────────────────────────────

const HIDDEN_KINDS = new Set([
  "signal_gap",
  "gps_gap",
  "uncertain_transition",
  "missing_transition_evidence",
  "micro_movement",
  "internal_transport",
]);

function pickStr(o: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickNum(o: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "number" && isFinite(v)) return v;
  }
  return null;
}

function mapEngineKind(raw: string | null, targetType: string | null): string {
  const k = (raw || "").toLowerCase();
  const tt = (targetType || "").toLowerCase();
  if (/transport|travel|resa/.test(k)) return "travel";
  if (/break|rast/.test(k)) return "break";
  if (k === "needs_review") return "needs_review";
  if (/unknown|okänd|okand|unknown_place/.test(k)) return "unknown";
  if (k === "project" || tt === "project") return "project";
  if (k === "booking" || tt === "booking") return "booking";
  if (k === "large_project" || tt === "large_project") return "large_project";
  if (k === "warehouse" || tt === "warehouse") return "warehouse";
  if (k === "location" || tt === "location") return "location";
  if (k === "work") {
    if (tt === "project") return "project";
    if (tt === "booking") return "booking";
    if (tt === "large_project") return "large_project";
    if (tt === "warehouse") return "warehouse";
    if (tt === "location") return "location";
  }
  return "unknown";
}

function mapConfidence(raw: any): "high" | "medium" | "low" {
  if (typeof raw === "string") {
    const v = raw.toLowerCase();
    if (v === "high") return "high";
    if (v === "low") return "low";
    return "medium";
  }
  if (typeof raw === "number") {
    if (raw >= 0.75) return "high";
    if (raw <= 0.4) return "low";
    return "medium";
  }
  return "medium";
}

function fmtHm(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

interface MappedSegment {
  segmentKey: string;
  kind: string;
  type: string;
  label: string;
  originalStartTime: string;
  originalEndTime: string;
  currentStartTime: string;
  currentEndTime: string;
  durationMinutes: number;
  durationLabel: string;
  matched: { kind: string | null; id: string | null; name: string | null };
  manualOverride: { hasOverride: boolean; reason: string | null };
  confidence: "high" | "medium" | "low";
}

function mapEngineBlocksToSegments(blocks: any[]): MappedSegment[] {
  const out: MappedSegment[] = [];
  for (const b of blocks ?? []) {
    if (!b || typeof b !== "object") continue;
    const rawKind = pickStr(b, ["kind", "classification", "type"]);
    if (rawKind && HIDDEN_KINDS.has(rawKind.toLowerCase())) continue;

    const start = pickStr(b, ["startAt", "start_at", "start", "startedAt", "started_at", "start_time", "startTime", "from"]);
    const end = pickStr(b, ["endAt", "end_at", "end", "endedAt", "ended_at", "end_time", "endTime", "to"]);
    if (!start || !end) continue;

    const label = pickStr(b, ["displayLabel", "display_label", "targetLabel", "target_label", "title", "label"]) || rawKind || "Okänd";
    const targetType = pickStr(b, ["targetType", "target_type"]);
    const kind = mapEngineKind(rawKind, targetType);

    let durMin = pickNum(b, ["durationMinutes", "duration_minutes", "minutes", "duration_min", "duration"]);
    if (durMin == null) {
      const d = (Date.parse(end) - Date.parse(start)) / 60000;
      durMin = isFinite(d) && d > 0 ? Math.round(d) : 0;
    }

    const matchedId = pickStr(b, ["targetId", "target_id", "matchedSiteId", "matched_site_id"]);
    const matchedName = pickStr(b, ["targetName", "target_name", "matchedSiteName", "matched_site_name"]) || label;
    const matchedKind = targetType || (kind !== "unknown" && kind !== "travel" && kind !== "break" ? kind : null);
    const id = pickStr(b, ["id", "blockId", "block_id"]) || `${start}-${end}`;

    out.push({
      segmentKey: id,
      kind,
      type: rawKind || kind,
      label,
      originalStartTime: start,
      originalEndTime: end,
      currentStartTime: start,
      currentEndTime: end,
      durationMinutes: durMin,
      durationLabel: fmtHm(durMin),
      matched: { kind: matchedKind, id: matchedId, name: matchedName },
      manualOverride: { hasOverride: false, reason: null },
      confidence: mapConfidence(b.confidence),
    });
  }
  return out;
}

function totalsAndRowsFromSegments(segments: MappedSegment[]) {
  let workMinutes = 0;
  let travelMinutes = 0;
  const gapMinutes = 0;
  const rowMap = new Map<string, {
    rowKey: string; label: string; kind: string; totalMinutes: number; segmentKeys: string[];
  }>();
  let unknownIdx = 0;
  for (const s of segments) {
    if (s.kind === "travel") travelMinutes += s.durationMinutes;
    else if (s.kind === "break" || s.kind === "unknown" || s.kind === "needs_review") {
      // not counted as work or travel
    } else workMinutes += s.durationMinutes;

    let rowKey: string;
    let label = s.label;
    const kind = s.kind;
    if (s.matched.id) {
      rowKey = `${s.matched.kind ?? kind}:${s.matched.id}`;
      label = s.matched.name || s.label;
    } else if (kind === "travel") {
      rowKey = "transport:all";
      label = "Förflyttning";
    } else if (kind === "break") {
      rowKey = "break:all";
      label = "Rast";
    } else {
      unknownIdx += 1;
      rowKey = `unknown:${unknownIdx}`;
    }
    const ex = rowMap.get(rowKey);
    if (ex) {
      ex.totalMinutes += s.durationMinutes;
      ex.segmentKeys.push(s.segmentKey);
    } else {
      rowMap.set(rowKey, { rowKey, label, kind, totalMinutes: s.durationMinutes, segmentKeys: [s.segmentKey] });
    }
  }
  const rows = Array.from(rowMap.values())
    .map((r) => ({ ...r, totalLabel: fmtHm(r.totalMinutes) }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const totalMinutes = workMinutes + travelMinutes;
  return {
    rows,
    totals: {
      totalDurationMinutes: totalMinutes,
      totalDurationLabel: fmtHm(totalMinutes),
      workMinutes,
      travelMinutes,
      gapMinutes,
    },
  };
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

  // Staff name (best effort).
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

  // ── Resolver: enda källan till sanning ───────────────────────────────────
  let resolved;
  try {
    resolved = await resolveStaffDayReport({
      admin,
      organizationId: orgId,
      staffId,
      date,
    });
  } catch (e) {
    console.error("[get-mobile-gps-day-view] resolver failed", e);
    return json({ error: "resolver failed" }, 500);
  }

  // Submission-status + canEdit/canSubmit (legacy shape) — vi behöver fler fält
  // än resolverns normaliserade form. Hämtas via loadSubmission (samma rad).
  const submission = await loadSubmission(admin, orgId, staffId, date);

  // Bygg segments från cachens display_blocks_json (eller candidate-blocks),
  // i samma form som UI:n förväntar sig.
  const cacheRow = resolved.rawCache as any;
  const displayBlocks = Array.isArray(cacheRow?.display_blocks_json) ? cacheRow.display_blocks_json : [];
  const candidateBlocks = Array.isArray(cacheRow?.report_candidate_blocks_json) ? cacheRow.report_candidate_blocks_json : [];

  let timelineSourceUsed: "display_blocks_json" | "report_candidate_blocks_json" | "submission_snapshot" | "none" = "none";
  let viewSegments: MappedSegment[] = [];

  if (resolved.source === "submission") {
    // För submission renderar UI ofta från cache som "underlag"; om submission
    // har en snapshot använder vi den, annars fallback till cachens display_blocks
    // om sådan finns kvar (för referens i preview).
    const snapBlocks = Array.isArray(resolved.rawSubmission?.display_timeline_snapshot_json)
      ? (resolved.rawSubmission?.display_timeline_snapshot_json as any[])
      : [];
    if (snapBlocks.length > 0) {
      viewSegments = mapEngineBlocksToSegments(snapBlocks);
      timelineSourceUsed = "submission_snapshot";
    } else if (displayBlocks.length > 0) {
      viewSegments = mapEngineBlocksToSegments(displayBlocks);
      timelineSourceUsed = viewSegments.length > 0 ? "display_blocks_json" : "none";
    } else if (candidateBlocks.length > 0) {
      viewSegments = mapEngineBlocksToSegments(candidateBlocks);
      if (viewSegments.length > 0) timelineSourceUsed = "report_candidate_blocks_json";
    }
  } else if (resolved.source === "cache") {
    if (displayBlocks.length > 0) {
      viewSegments = mapEngineBlocksToSegments(displayBlocks);
      timelineSourceUsed = viewSegments.length > 0 ? "display_blocks_json" : "none";
    }
    if (viewSegments.length === 0 && candidateBlocks.length > 0) {
      viewSegments = mapEngineBlocksToSegments(candidateBlocks);
      if (viewSegments.length > 0) timelineSourceUsed = "report_candidate_blocks_json";
    }
  }
  // resolved.source === "empty" → viewSegments stannar []

  const { rows: viewRows, totals: viewTotals } = totalsAndRowsFromSegments(viewSegments);
  const subtitleParts: string[] = [];
  if (viewTotals.workMinutes > 0) subtitleParts.push(`Arbete ${fmtHm(viewTotals.workMinutes)}`);
  if (viewTotals.travelMinutes > 0) subtitleParts.push(`Resa ${fmtHm(viewTotals.travelMinutes)}`);
  const viewSubtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Ingen aktivitet";
  const viewTitle = staffName ? `${staffName} · ${date}` : date;

  // Karta byggs INTE från råpings längre. UI har en placeholder tills
  // vi har en cache-/known-target-driven karta. Returnera tom shell.
  const map = { points: [] as any[], paths: [] as any[], knownSites: [] as any[] };

  const messages = await loadMessages(admin, orgId, staffId, date, 20);

  let manualTargets = { assignedTargets: [], locationTargets: [], searchableTargets: [] };
  try {
    manualTargets = await loadManualReportTargetsForDay(admin, orgId, staffId, date);
  } catch (e) {
    console.error("[get-mobile-gps-day-view] manual targets load failed", e);
  }

  const subStatus = String(submission.status ?? "not_submitted");
  const isLocked = subStatus === "approved" || subStatus === "payroll_approved";
  const hasSegs = viewSegments.length > 0;
  const reportMode: "submitted" | "locked" | "gps_suggestion" | "manual_empty" =
    isLocked
      ? "locked"
      : submission.hasSubmission
        ? "submitted"
        : hasSegs
          ? "gps_suggestion"
          : "manual_empty";
  const canSubmitManual = reportMode === "manual_empty";

  const anchorRows = await loadAnchorsForDay(admin, orgId, staffId, date);
  const { startSuggested, endSuggested } = computeAnchorSuggestions(viewSegments ?? []);
  const anchors = buildAnchorsPayload({
    rows: anchorRows, startSuggested, endSuggested, isLocked,
  });

  // sourceSnapshotId — stabil för cache-rad eller submission-rad.
  const sourceSnapshotId = resolved.source === "submission"
    ? `submission:${resolved.submissionId ?? ""}`
    : resolved.source === "cache"
      ? `cache:${resolved.cacheBuiltAt ?? ""}`
      : `empty:${date}:${staffId}`;

  return json({
    source: "mobile_gps_day_view_v2",
    staffId,
    date,
    sourceSnapshotId,
    title: viewTitle,
    subtitle: viewSubtitle,
    reportMode,
    canSubmitManual,
    map,
    segments: viewSegments,
    rows: viewRows,
    totals: viewTotals,
    manualOverridesSummary: { count: 0, appliedSegmentKeys: [] as string[] },
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
    manualTargets,
    anchors,
    debug: {
      resolvedSource: resolved.source,
      resolvedStatus: resolved.status,
      timelineSourceUsed,
      displayBlocksCount: displayBlocks.length,
      reportCandidateBlocksCount: candidateBlocks.length,
      returnedSegmentsCount: viewSegments.length,
      engineVersion: resolved.engineVersion,
      cacheBuiltAt: resolved.cacheBuiltAt,
    },
    generatedAt: new Date().toISOString(),
  });
});

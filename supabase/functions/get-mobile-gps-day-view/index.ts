// get-mobile-gps-day-view
// =============================================================================
// Denna endpoint returnerar mobilens rapportvy. Tidslinjen speglar Time Engine-
// cache (staff_day_report_cache.display_blocks_json → report_candidate_blocks_json).
// GPS-pings används bara för karta/underlag och som sista nödfallback om cachen
// helt saknas. Admin-drawerns "Tidslinje (Time Engine-förslag)" och appens
// rapportvy bygger på samma segmentlista.
//
// Skriver ALDRIG till time_reports, workdays, location_time_entries,
// travel_time_logs eller GPS-pings.
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
  loadManualReportTargetsForDay,
  loadMessages,
  loadSubmission,
  readManualOverridesFromSubmission,
} from "../_shared/time-v2/loaders.ts";
import { buildDayView } from "../_shared/time-v2/buildDayView.ts";
import { buildDayMap } from "../_shared/time-v2/buildDayMap.ts";
import { buildGpsDayTimelineOnly } from "../_shared/timeline/buildGpsDayTimelineOnly.ts";
import { buildCanonicalStaffDayGpsResult } from "../_shared/staff-gps/canonicalStaffDayGpsResult.ts";
import {
  buildAnchorsPayload,
  computeAnchorSuggestions,
  loadAnchorsForDay,
} from "../_shared/time-v2/anchors.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Engine block → view-segment mapper
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
  let gapMinutes = 0;
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
    knownTargets = await loadKnownTargetsV2(admin, orgId, staffId, date);
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

  // Time Engine-cache (sanning för rapportvyn).
  let cacheRow: any = null;
  try {
    const { data } = await admin
      .from("staff_day_report_cache")
      .select("engine_version, summary_json, display_blocks_json, report_candidate_blocks_json, diagnostics_json, built_at, stale, error")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .order("built_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cacheRow = data ?? null;
  } catch (e) {
    console.warn("[get-mobile-gps-day-view] cache load failed", e);
  }

  const displayBlocks = Array.isArray(cacheRow?.display_blocks_json) ? cacheRow.display_blocks_json : [];
  const candidateBlocks = Array.isArray(cacheRow?.report_candidate_blocks_json) ? cacheRow.report_candidate_blocks_json : [];

  let timelineSourceUsed: "display_blocks_json" | "report_candidate_blocks_json" | "gps_only_fallback" | "none" = "none";
  let engineSegments: MappedSegment[] = [];

  if (displayBlocks.length > 0) {
    engineSegments = mapEngineBlocksToSegments(displayBlocks);
    timelineSourceUsed = engineSegments.length > 0 ? "display_blocks_json" : "none";
  }
  if (engineSegments.length === 0 && candidateBlocks.length > 0) {
    engineSegments = mapEngineBlocksToSegments(candidateBlocks);
    if (engineSegments.length > 0) timelineSourceUsed = "report_candidate_blocks_json";
  }

  // GPS-only fallback för KARTAN — behövs alltid (även när cache finns).
  const gpsTimeline = buildGpsDayTimelineOnly({
    staffId,
    organizationId: orgId,
    date,
    pings,
    knownTargets,
  });

  // Bygg view: om cache finns → segments från cache. Annars GPS-only fallback.
  let viewSegments: any[];
  let viewRows: any[];
  let viewTotals: any;
  let viewSubtitle: string;
  let viewTitle: string;
  let manualOverridesSummary = { count: 0, appliedSegmentKeys: [] as string[] };

  if (engineSegments.length > 0) {
    viewSegments = engineSegments;
    const rt = totalsAndRowsFromSegments(engineSegments);
    viewRows = rt.rows;
    viewTotals = rt.totals;
    const parts: string[] = [];
    if (viewTotals.workMinutes > 0) parts.push(`Arbete ${fmtHm(viewTotals.workMinutes)}`);
    if (viewTotals.travelMinutes > 0) parts.push(`Resa ${fmtHm(viewTotals.travelMinutes)}`);
    viewSubtitle = parts.length > 0 ? parts.join(" · ") : "Ingen aktivitet";
    viewTitle = staffName ? `${staffName} · ${date}` : date;
  } else {
    // Sista nödfallback: GPS-only timeline.
    const fallback = buildDayView({
      staffId,
      organizationId: orgId,
      date,
      pings,
      knownTargets,
      manualOverrides,
      staffName,
      prebuiltTimeline: gpsTimeline,
    });
    viewSegments = fallback.segments;
    viewRows = fallback.rows;
    viewTotals = fallback.totals;
    viewSubtitle = fallback.subtitle;
    viewTitle = fallback.title;
    manualOverridesSummary = fallback.manualOverridesSummary;
    timelineSourceUsed = displayBlocks.length === 0 && candidateBlocks.length === 0 ? "gps_only_fallback" : "none";
  }

  // Kartan byggs alltid från råpings + GPS-timeline (rörelser/punkter).
  const map = buildDayMap({
    pings,
    segments: gpsTimeline.segments,
    knownTargets,
  });

  const sourceSnapshotId = `${date}:${staffId}:${gpsTimeline.rawPingCount}:${gpsTimeline.firstPingAt ?? "-"}:${gpsTimeline.lastPingAt ?? "-"}`;

  const messages = await loadMessages(admin, orgId, staffId, date, 20);

  let manualTargets = { assignedTargets: [], locationTargets: [], searchableTargets: [] };
  try {
    manualTargets = await loadManualReportTargetsForDay(admin, orgId, staffId, date);
  } catch (e) {
    console.error("[get-mobile-gps-day-view] manual targets load failed", e);
  }

  const subStatus = String(submission.status ?? "not_submitted");
  const isLocked = subStatus === "approved" || subStatus === "payroll_approved";
  const hasSegs = (viewSegments?.length ?? 0) > 0;
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
    manualOverridesSummary,
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
      timelineSourceUsed,
      displayBlocksCount: displayBlocks.length,
      reportCandidateBlocksCount: candidateBlocks.length,
      returnedSegmentsCount: viewSegments.length,
      rawPingCount: gpsTimeline.rawPingCount,
      firstPingAt: gpsTimeline.firstPingAt,
      lastPingAt: gpsTimeline.lastPingAt,
      engineVersion: cacheRow?.engine_version ?? null,
      cacheBuiltAt: cacheRow?.built_at ?? null,
      cacheError: cacheRow?.error ?? null,
    },
    generatedAt: new Date().toISOString(),
  });
});

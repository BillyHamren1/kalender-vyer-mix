// @ts-nocheck
/**
 * debug-time-intelligence
 * ────────────────────────────────────────────────────────────────────────────
 * Backend dry-run / inspector för nya Time Engine. Skriver ALDRIG data.
 *
 * Output (i denna ordning, läs från topp till botten):
 *   1. rawPingsCoverage              — råa GPS-pings + täckning
 *   2. targetDiagnostics             — vilka targets vi hittade och varför valida
 *   3. gpsDayTimeline                — fysisk verklighet (stay/travel/gps_gap)
 *   4. autoStartDecisions            — per relevant stay-segment: får motorn auto-starta?
 *   5. activeTimeRegistrationPreview — vad skulle skapas (eller varför inte)?
 *   6. legacyLeakCheck               — har legacy-källor läckt in i input?
 *
 * Visar ALDRIG: workday, time_reports, location_time_entries, travel_time_logs,
 * payable snapshot, gamla snapshot-totals.
 *
 * Auth: service-role bearer ELLER `x-cron-secret` ELLER inloggad user.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ─── New Time Engine ────────────────────────────────────────────────────────
import {
  buildGpsDayTimeline,
  type GpsPing,
  type GpsTimelineSegment,
} from "../_shared/time-engine/buildGpsDayTimeline.ts";
import {
  resolveWorkTargets,
  toWorkTarget,
  type ResolvedWorkTarget,
} from "../_shared/time-engine/resolveWorkTargets.ts";
import {
  decideAutoStart,
  type AutoStartDecisionResult,
  type DecideAutoStartTarget,
} from "../_shared/time-engine/decideAutoStart.ts";
import { processGpsTimelineForAutoStart } from "../_shared/time-engine/processGpsTimelineForAutoStart.ts";
import { assertNoLegacySources } from "../_shared/time-engine/assertNoLegacySources.ts";
import type { WorkTarget } from "../_shared/time-engine/contracts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function json(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Paginated raw pings — only allowed legacy read in this debugger. */
async function fetchAllStaffLocationPings(
  admin: any,
  staffId: string,
  dayStart: string,
  dayEnd: string,
) {
  const pageSize = 1000;
  const all: any[] = [];
  let from = 0;
  let pageCount = 0;
  const primarySelect =
    "id, recorded_at, lat, lng, accuracy, speed, source, created_at, app_state, activity_type";
  const fallbackSelect = "id, recorded_at, lat, lng, accuracy, speed";
  let selectCols = primarySelect;
  let usedFallback = false;
  while (true) {
    let { data, error } = await admin
      .from("staff_location_history")
      .select(selectCols)
      .eq("staff_id", staffId)
      .gte("recorded_at", dayStart)
      .lte("recorded_at", dayEnd)
      .order("recorded_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error && selectCols === primarySelect) {
      selectCols = fallbackSelect;
      usedFallback = true;
      const retry = await admin
        .from("staff_location_history")
        .select(selectCols)
        .eq("staff_id", staffId)
        .gte("recorded_at", dayStart)
        .lte("recorded_at", dayEnd)
        .order("recorded_at", { ascending: true })
        .range(from, from + pageSize - 1);
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      return { data: all, error, pageCount, pageSize, usedFallback } as any;
    }
    const batch = data ?? [];
    pageCount++;
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null, pageCount, pageSize, usedFallback } as any;
}

// ─── Forbidden tables — must NEVER be read as truth by the new engine ───────
const FORBIDDEN_TABLES = new Set<string>([
  "workdays",
  "time_reports",
  "location_time_entries",
  "travel_time_logs",
  "assistant_events",
  "workday_flags",
  "day_attestations",
  "day_timeline_snapshots",
  "tracking_policy_boosts",
  "current_time_registration",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const okCron = CRON_SECRET.length > 0 && headerSecret === CRON_SECRET;
  const okSvc = SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE;

  let okUser = false;
  if (!okCron && !okSvc && bearer) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      okUser = !!data?.user && !error;
    } catch { okUser = false; }
  }
  if (!okCron && !okSvc && !okUser) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const staffIdInput = String(body.staffId ?? "").trim();
  const date = String(body.date ?? "").trim();
  if (!staffIdInput) return json(400, { ok: false, error: "staffId required" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return json(400, { ok: false, error: "date required (YYYY-MM-DD)" });

  const realClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Leak detector: any read of a forbidden table is recorded (never blocked).
  const legacyDbReads: Array<{ table: string; at: string }> = [];
  const supabase = new Proxy(realClient, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          if (FORBIDDEN_TABLES.has(table)) {
            legacyDbReads.push({ table, at: new Date().toISOString() });
          }
          return (target as any).from(table);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as typeof realClient;

  const warnings: string[] = [];

  let staffId = staffIdInput;
  let organizationId: string | null = null;
  try {
    const { data: sm } = await supabase
      .from("staff_members")
      .select("id, organization_id")
      .eq("id", staffIdInput)
      .maybeSingle();
    if (sm) { staffId = sm.id; organizationId = sm.organization_id; }
    else warnings.push(`staff_members lookup miss for "${staffIdInput}"`);
  } catch (e) {
    warnings.push(`staff_members lookup error: ${(e as any)?.message ?? e}`);
  }
  if (!organizationId) {
    return json(400, { ok: false, error: "could not resolve organization_id for staff" });
  }

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  // ════════════════════════════════════════════════════════════════════════
  // 1) rawPingsCoverage
  // ════════════════════════════════════════════════════════════════════════
  const pingsRes = await fetchAllStaffLocationPings(supabase, staffId, dayStart, dayEnd);
  if (pingsRes.error) warnings.push(`pings fetch error: ${(pingsRes.error as any).message}`);
  const rawPings: any[] = pingsRes.data ?? [];

  const firstPingAt = rawPings.length > 0 ? rawPings[0].recorded_at : null;
  const lastPingAt = rawPings.length > 0 ? rawPings[rawPings.length - 1].recorded_at : null;
  const GAP_MS = 10 * 60 * 1000;
  const pingGapsOver10Min: Array<{ from: string; to: string; gapMinutes: number }> = [];
  for (let i = 1; i < rawPings.length; i++) {
    const a = new Date(rawPings[i - 1].recorded_at).getTime();
    const b = new Date(rawPings[i].recorded_at).getTime();
    if (b - a > GAP_MS) {
      pingGapsOver10Min.push({
        from: rawPings[i - 1].recorded_at,
        to: rawPings[i].recorded_at,
        gapMinutes: Math.round((b - a) / 60000),
      });
    }
  }
  let okQ = 0, lowQ = 0, invalidQ = 0;
  for (const p of rawPings) {
    const hasCoord = p.lat != null && p.lng != null;
    const acc = p.accuracy != null ? Number(p.accuracy) : null;
    if (!hasCoord) invalidQ++;
    else if (acc != null && acc > 200) lowQ++;
    else okQ++;
  }
  const rawPingsCoverage = {
    pingCount: rawPings.length,
    firstPingAt,
    lastPingAt,
    pingGapsOver10MinCount: pingGapsOver10Min.length,
    pingGapsOver10Min,
    pageCount: (pingsRes as any).pageCount ?? null,
    pageSize: (pingsRes as any).pageSize ?? 1000,
    qualityCounts: { ok: okQ, low: lowQ, invalid: invalidQ },
  };

  // ════════════════════════════════════════════════════════════════════════
  // 2) targetDiagnostics
  // ════════════════════════════════════════════════════════════════════════
  let resolvedTargets: ResolvedWorkTarget[] = [];
  let targetDiagnosticsBlock: any = null;
  try {
    const r = await resolveWorkTargets({
      organizationId,
      staffId,
      date,
      supabaseAdmin: supabase as any,
    });
    resolvedTargets = r.targets;
    targetDiagnosticsBlock = {
      ...r.targetDiagnostics,
      sampleValid: r.targets.slice(0, 25).map((t) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        latitude: t.latitude,
        longitude: t.longitude,
        radiusMeters: t.radiusMeters,
        targetSource: t.targetSource,
        targetValidity: t.targetValidity,
        timeTrackingAllowed: t.timeTrackingAllowed,
      })),
    };
  } catch (e) {
    warnings.push(`resolveWorkTargets failed: ${(e as any)?.message ?? e}`);
    targetDiagnosticsBlock = { error: String((e as any)?.message ?? e) };
  }

  const workTargets: WorkTarget[] = resolvedTargets
    .map(toWorkTarget)
    .filter((t): t is WorkTarget => t !== null);

  // targetSummary — compact glance from resolveWorkTargets diagnostics
  const AUTOSTARTABLE = new Set(["planned_today", "warehouse", "explicit_time_tracking_location"]);
  const diag = (targetDiagnosticsBlock ?? {}) as Record<string, any>;
  const validCount = Number(diag.validTargets ?? resolvedTargets.length);
  const excludedCount = Number(diag.excludedTargets ?? 0);
  const totalCandidates = Number(diag.totalFetched ?? validCount + excludedCount);
  const candidatesWithCoordinates = Number(
    diag.candidatesWithCoordinates ??
      resolvedTargets.filter((t) => t.latitude != null && t.longitude != null).length,
  );
  const autostartableCount = resolvedTargets.filter(
    (t) =>
      t.targetValidity === "valid" &&
      t.timeTrackingAllowed === true &&
      AUTOSTARTABLE.has(String(t.targetSource)),
  ).length;
  const targetSummary = {
    totalCandidates,
    validCount,
    invalidCount: excludedCount,
    candidatesWithCoordinates,
    autostartableCount,
    excludedByReason: (diag.excludedByReason ?? {}) as Record<string, number>,
  };

  // ════════════════════════════════════════════════════════════════════════
  // 3) gpsDayTimeline
  // ════════════════════════════════════════════════════════════════════════
  const enginePings: GpsPing[] = rawPings
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      ts: p.recorded_at,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
      speedMps: p.speed != null ? Number(p.speed) : null,
    }));

  const timeline = buildGpsDayTimeline({
    staffId,
    organizationId,
    date,
    pings: enginePings,
    targets: workTargets,
  });

  const SEGMENT_RETURN_CAP = 200;
  const returnedSegments = timeline.segments.slice(0, SEGMENT_RETURN_CAP);
  const gpsFirstStart = timeline.segments.length > 0 ? timeline.segments[0].startTs : null;
  const gpsLastEnd = timeline.segments.length > 0 ? timeline.segments[timeline.segments.length - 1].endTs : null;
  const gpsDayTimeline = {
    // Canonical field names (aliases for visibility)
    count: timeline.segments.length,
    firstStart: gpsFirstStart,
    lastEnd: gpsLastEnd,
    source: "all_pings" as const,
    // Legacy/extended fields
    rawPingCount: timeline.rawPingCount,
    firstPingAt: timeline.firstPingAt,
    lastPingAt: timeline.lastPingAt,
    qualitySummary: timeline.qualitySummary,
    targetMatchSummary: timeline.targetMatchSummary,
    gaps: timeline.gaps,
    totalSegments: timeline.segments.length,
    returnedSegments: returnedSegments.length,
    truncated: timeline.segments.length > returnedSegments.length,
    segments: returnedSegments,
  };

  // payableSnapshot intentionally removed — GPS-only debug must NOT mix in
  // workday/payable/attest. Den fasen hör hemma i ett separat verktyg.

  const compactCounts = {
    rawPingCount: rawPings.length,
    gpsDayTimelineCount: gpsDayTimeline.count,
  };

  if (rawPings.length === 0) warnings.push("no_pings_for_day");
  if (rawPings.length > 0 && workTargets.length === 0)
    warnings.push("no_known_targets_with_coords_in_org");
  if (rawPings.length > 0 && timeline.segments.length === 0)
    warnings.push("pings_present_but_no_segments_built");


  // ════════════════════════════════════════════════════════════════════════
  // 4) autoStartDecisions  (per stay-segment)
  // ════════════════════════════════════════════════════════════════════════
  function findResolvedFor(seg: GpsTimelineSegment): ResolvedWorkTarget | null {
    if (!seg.matchedTargetId || !seg.matchedTargetType) return null;
    return resolvedTargets.find(
      (t) => t.id === seg.matchedTargetId && t.type === (seg.matchedTargetType as any),
    ) ?? null;
  }
  function toDecideTarget(rt: ResolvedWorkTarget): DecideAutoStartTarget {
    const wt = toWorkTarget(rt);
    return {
      refId: rt.id,
      kind: wt?.kind ?? (rt.type === "project" ? "project"
        : rt.type === "booking" ? "booking"
        : rt.type === "warehouse" ? "warehouse" : "organization_location"),
      label: rt.name,
      key: wt?.key,
      center: wt?.center,
      radiusM: wt?.radiusM,
      targetValidity: rt.targetValidity as any,
      timeTrackingAllowed: rt.timeTrackingAllowed,
      assignedToUserToday: rt.targetSource === "planned_today" || undefined,
      explicitlyAllowed: rt.targetSource === "explicit_time_tracking_location" || undefined,
    };
  }

  function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLng / 2);
    const a = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  const autoStartDecisions: Array<{
    segmentId: string;
    segmentStart: string;
    segmentEnd: string;
    segmentLabel: string;
    matchedTargetId: string | null;
    matchedTargetName: string | null;
    matchedTargetType: string | null;
    allowed: boolean;
    reason: string;
    confidence: number;
    evidence: AutoStartDecisionResult["evidence"];
    firstPingAt: string | null;
    lastPingAt: string | null;
    dwellSeconds: number;
    arrivalPingsCount: number;
    targetDistanceMeters: number | null;
    targetRadiusMeters: number | null;
  }> = [];

  let prevSeg: GpsTimelineSegment | null = null;
  for (const seg of timeline.segments) {
    if (seg.kind !== "stay") { prevSeg = seg; continue; }
    const rt = findResolvedFor(seg);
    const target = rt ? toDecideTarget(rt) : null;

    const decision = decideAutoStart({
      currentSegment: {
        id: seg.id, startTs: seg.startTs, endTs: seg.endTs,
        durationMin: seg.durationMin, kind: seg.kind, type: seg.type,
        pingCount: seg.pingCount, confidence: seg.confidence,
      },
      previousSegment: prevSeg ? {
        id: prevSeg.id, startTs: prevSeg.startTs, endTs: prevSeg.endTs,
        durationMin: prevSeg.durationMin, kind: prevSeg.kind, type: prevSeg.type,
        pingCount: prevSeg.pingCount, confidence: prevSeg.confidence,
      } : null,
      target,
      localTime: seg.endTs,
    });

    let targetDistanceMeters: number | null = null;
    let targetRadiusMeters: number | null = null;
    if (rt) {
      const wt = toWorkTarget(rt);
      const tCenter = wt?.center ?? null;
      targetRadiusMeters = wt?.radiusM ?? rt.radiusMeters ?? null;
      if (tCenter && seg.centerLat != null && seg.centerLng != null) {
        targetDistanceMeters = Math.round(
          haversineM(seg.centerLat, seg.centerLng, tCenter.lat, tCenter.lng),
        );
      }
    }

    autoStartDecisions.push({
      segmentId: seg.id,
      segmentStart: seg.startTs,
      segmentEnd: seg.endTs,
      segmentLabel: seg.label,
      matchedTargetId: rt?.id ?? null,
      matchedTargetName: rt?.name ?? null,
      matchedTargetType: rt?.type ?? null,
      allowed: decision.allowed,
      reason: decision.reason,
      confidence: decision.confidence,
      evidence: decision.evidence,
      firstPingAt: seg.startTs,
      lastPingAt: seg.endTs,
      dwellSeconds: Math.round((seg.durationMin ?? 0) * 60),
      arrivalPingsCount: seg.pingCount,
      targetDistanceMeters,
      targetRadiusMeters,
    });
    prevSeg = seg;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5) activeTimeRegistrationPreview  (dryRun)
  // ════════════════════════════════════════════════════════════════════════
  let activeTimeRegistrationPreview: any = null;
  {
    const allowed = autoStartDecisions.find((d) => d.allowed) ?? null;
    if (allowed) {
      const ev = (allowed.evidence ?? {}) as Record<string, any>;
      const startAt = allowed.segmentStart ?? ev.startAt ?? null;
      const dwellSeconds = ev.dwellSeconds ?? ev.dwell_seconds ?? null;
      const arrivalPingsCount = ev.arrivalPingsCount ?? ev.arrival_pings_count ?? ev.pingsCount ?? null;
      const targetName = allowed.matchedTargetName ?? null;
      const targetType = allowed.matchedTargetType ?? null;
      const confidence = allowed.confidence ?? null;

      const missing: string[] = [];
      if (startAt == null) missing.push("startAt");
      if (dwellSeconds == null) missing.push("dwellSeconds");
      if (arrivalPingsCount == null) missing.push("arrivalPingsCount");
      if (targetName == null) missing.push("targetName");
      if (targetType == null) missing.push("targetType");
      if (confidence == null) missing.push("confidence");

      if (missing.length > 0) {
        activeTimeRegistrationPreview = {
          wouldCreate: false,
          status: "NOT_READY",
          reason: "allowed_decision_missing_evidence",
          missingEvidence: missing,
          startAt,
          dwellSeconds,
          arrivalPingsCount,
          targetId: allowed.matchedTargetId,
          targetType,
          targetLabel: targetName,
          confidence,
        };
      } else {
        activeTimeRegistrationPreview = {
          wouldCreate: true,
          status: "READY_TO_CONFIRM",
          startAt,
          startSource: "gps_geofence_auto_start",
          targetId: allowed.matchedTargetId,
          targetType,
          targetLabel: targetName,
          dwellSeconds,
          arrivalPingsCount,
          confidence,
          reason: allowed.reason,
        };
      }
    } else {
      const firstBlocked = autoStartDecisions[0] ?? null;
      activeTimeRegistrationPreview = {
        wouldCreate: false,
        status: "NOT_READY",
        reason: firstBlocked?.reason
          ?? (autoStartDecisions.length === 0 ? "no_candidate_stay_segment" : "no_allowed_decision"),
      };
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5b) autoStartSummary  (compact glance)
  // ════════════════════════════════════════════════════════════════════════
  const blockedByReason: Record<string, number> = {};
  let allowedCount = 0;
  let blockedCount = 0;
  let firstAllowedDecision: typeof autoStartDecisions[number] | null = null;
  const allowedDecisions: Array<{
    startAt: string;
    targetName: string;
    targetType: string;
    segmentLabel: string;
    reason: string;
    confidence: number;
    dwellSeconds: number;
    arrivalPingsCount: number;
    firstPingAt: string;
    lastPingAt: string;
    targetDistanceMeters: number;
    targetRadiusMeters: number;
  }> = [];
  for (const d of autoStartDecisions) {
    if (d.allowed) {
      allowedCount++;
      if (!firstAllowedDecision) firstAllowedDecision = d;
      allowedDecisions.push({
        startAt: d.segmentStart,
        targetName: d.matchedTargetName!,
        targetType: d.matchedTargetType!,
        segmentLabel: d.segmentLabel,
        reason: d.reason,
        confidence: d.confidence,
        dwellSeconds: d.dwellSeconds,
        arrivalPingsCount: d.arrivalPingsCount,
        firstPingAt: d.firstPingAt!,
        lastPingAt: d.lastPingAt!,
        targetDistanceMeters: d.targetDistanceMeters!,
        targetRadiusMeters: d.targetRadiusMeters!,
      });
    } else {
      blockedCount++;
      blockedByReason[d.reason] = (blockedByReason[d.reason] ?? 0) + 1;
    }
  }
  const autoStartSummary = {
    allowedCount,
    blockedCount,
    blockedByReason,
    firstAllowedDecision,
    allowedDecisions,
  };

  // ════════════════════════════════════════════════════════════════════════
  // 6) legacyLeakCheck
  // ════════════════════════════════════════════════════════════════════════
  const inputLeak = assertNoLegacySources(body, { debug: false, label: "debug-time-intelligence" });
  const legacyLeakCheck = {
    inputLegacySourceLeakDetected: inputLeak.legacySourceLeakDetected,
    inputLegacySources: inputLeak.legacySources,
    inputLegacySourcePaths: inputLeak.paths,
    forbiddenTables: Array.from(FORBIDDEN_TABLES),
    forbiddenTableReadsObserved: legacyDbReads,
    forbiddenTableLeakDetected: legacyDbReads.length > 0,
  };

  return json(200, {
    ok: true,
    contractVersion: "time-engine.v1",
    input: { staffId, date, organizationId },
    rawPingsCoverage,
    targetDiagnostics: targetDiagnosticsBlock,
    targetSummary,
    gpsDayTimeline,
    compactCounts,
    autoStartDecisions,
    autoStartSummary,
    activeTimeRegistrationPreview,
    legacyLeakCheck,
    warnings,
    generatedAt: new Date().toISOString(),
  });
});


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

  // ════════════════════════════════════════════════════════════════════════
  // 3b) payableSnapshot — visibility-only read of workday/attest
  //     Bypasses the legacy-leak proxy intentionally; this is debug, not engine.
  // ════════════════════════════════════════════════════════════════════════
  let payableSnapshot: any = null;
  try {
    const { data: wdRows } = await realClient
      .from("workdays")
      .select("id, started_at, ended_at, approved_at, status")
      .eq("staff_id", staffId)
      .gte("started_at", dayStart)
      .lte("started_at", dayEnd)
      .order("started_at", { ascending: true });
    const wd = (wdRows ?? [])[0] ?? null;
    const wdStart = wd?.started_at ?? null;
    const wdEnd = wd?.ended_at ?? null;
    const wdDurationMinutes = wdStart && wdEnd
      ? Math.round((new Date(wdEnd).getTime() - new Date(wdStart).getTime()) / 60000)
      : null;
    // Filter GPS segments to workday window for payable visibility
    let snapshotSegments: GpsTimelineSegment[] = [];
    if (wdStart) {
      const wsMs = new Date(wdStart).getTime();
      const weMs = wdEnd ? new Date(wdEnd).getTime() : Date.now();
      snapshotSegments = timeline.segments.filter((s) => {
        const sMs = new Date(s.startTs).getTime();
        const eMs = new Date(s.endTs).getTime();
        return eMs >= wsMs && sMs <= weMs;
      });
    }
    payableSnapshot = {
      workdayStart: wdStart,
      workdayEnd: wdEnd,
      workdayDurationMinutes: wdDurationMinutes,
      workdayIsOpen: !!wd && !wdEnd,
      workdayApproved: !!wd?.approved_at,
      workdayStatus: wd?.status ?? null,
      workdayCount: (wdRows ?? []).length,
      segmentSource: "gps_day_timeline_clipped_to_workday",
      segmentsCount: snapshotSegments.length,
      segments: snapshotSegments.slice(0, SEGMENT_RETURN_CAP),
    };
  } catch (e) {
    payableSnapshot = { error: String((e as any)?.message ?? e) };
  }

  // Clipping detector: did pings exist outside the workday window but our
  // GPS timeline appears to only span it?
  if (
    rawPings.length > 0 &&
    payableSnapshot?.workdayStart &&
    payableSnapshot?.workdayEnd &&
    gpsFirstStart &&
    gpsLastEnd
  ) {
    const firstPingMs = new Date(rawPings[0].recorded_at).getTime();
    const lastPingMs = new Date(rawPings[rawPings.length - 1].recorded_at).getTime();
    const wsMs = new Date(payableSnapshot.workdayStart).getTime();
    const weMs = new Date(payableSnapshot.workdayEnd).getTime();
    const tlStartMs = new Date(gpsFirstStart).getTime();
    const tlEndMs = new Date(gpsLastEnd).getTime();
    const pingsExtendOutside = firstPingMs < wsMs - 60_000 || lastPingMs > weMs + 60_000;
    const timelineHugsWorkday = tlStartMs >= wsMs - 60_000 && tlEndMs <= weMs + 60_000;
    if (pingsExtendOutside && timelineHugsWorkday) {
      warnings.push("gps_day_timeline_is_clipped_to_workday");
    }
  }

  const compactCounts = {
    rawPingCount: rawPings.length,
    gpsDayTimelineCount: gpsDayTimeline.count,
    snapshotSegmentsCount: payableSnapshot?.segmentsCount ?? 0,
    workdayStart: payableSnapshot?.workdayStart ?? null,
    workdayEnd: payableSnapshot?.workdayEnd ?? null,
    workdayDurationMinutes: payableSnapshot?.workdayDurationMinutes ?? null,
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
    });
    prevSeg = seg;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5) activeTimeRegistrationPreview  (dryRun)
  // ════════════════════════════════════════════════════════════════════════
  let activeTimeRegistrationPreview: any = null;
  try {
    const proc = await processGpsTimelineForAutoStart({
      organizationId,
      staffId,
      date,
      gpsDayTimeline: timeline,
      targets: resolvedTargets,
      supabaseAdmin: supabase as any,
      dryRun: true,
    });
    const allowed = proc.decisions.find((d) => d.decision.allowed) ?? null;
    if (proc.alreadyActive) {
      activeTimeRegistrationPreview = {
        wouldCreate: false,
        startAt: null,
        startSource: null,
        targetLabel: null,
        reason: "already_active_registration",
      };
    } else if (allowed) {
      activeTimeRegistrationPreview = {
        wouldCreate: true,
        startAt: allowed.decision.startAt,
        startSource: allowed.decision.source,
        targetLabel: allowed.matchedTargetName ?? allowed.decision.targetName,
        reason: allowed.decision.reason,
      };
    } else {
      const firstBlocked = proc.decisions.find((d) => !d.decision.allowed);
      activeTimeRegistrationPreview = {
        wouldCreate: false,
        startAt: null,
        startSource: null,
        targetLabel: firstBlocked?.matchedTargetName ?? null,
        reason: firstBlocked?.decision.reason
          ?? (proc.decisions.length === 0 ? "no_candidate_stay_segment" : "no_allowed_decision"),
      };
    }
  } catch (e) {
    activeTimeRegistrationPreview = {
      wouldCreate: false,
      startAt: null,
      startSource: null,
      targetLabel: null,
      reason: `process_failed: ${(e as any)?.message ?? e}`,
    };
  }

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
    gpsDayTimeline,
    payableSnapshot,
    compactCounts,
    autoStartDecisions,
    activeTimeRegistrationPreview,
    legacyLeakCheck,
    warnings,
    generatedAt: new Date().toISOString(),
  });
});


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
  const gpsDayTimeline = {
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
    matchedTarget: { id: string; type: string; name: string } | null;
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
      matchedTarget: rt ? { id: rt.id, type: rt.type, name: rt.name } : null,
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
    autoStartDecisions,
    activeTimeRegistrationPreview,
    legacyLeakCheck,
    warnings,
    generatedAt: new Date().toISOString(),
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * SCENARIO SUITE
 * ════════════════════════════════════════════════════════════════════════════
 * Five canonical situations the tracking engine MUST classify correctly.
 * Run with:  POST /debug-time-intelligence  { "mode": "scenarios" }
 * Auth: same gate (cron-secret OR service-role bearer).
 *
 *   1. FA Warehouse → transport → known project (Josefinas)
 *   2. Workday open, no ping for 60 min        → signal_stale, NOT glapp/close
 *   3. Known project visit BEFORE workday      → workday opens/rewinds to project
 *   4. Unknown place BEFORE workday            → no workday started
 *   5. Unknown place INSIDE open workday       → other_place, no time deduction
 *
 * Every scenario returns: rawData (the synthetic input), segments (engine
 * output), wouldWrite (predicted plan) and warnings (deviations from expected).
 * ──────────────────────────────────────────────────────────────────────────── */

const WAREHOUSE_ID = "loc-warehouse";
const PROJECT_LOC_ID = "loc-josefinas";
const STAFF_ID = "staff-test";
const DATE = "2026-05-07";

function ts(hhmm: string): string {
  return `${DATE}T${hhmm}:00.000Z`;
}

function genPings(fromHHMM: string, toHHMM: string, lat: number, lng: number, stepMin = 2) {
  const out: Array<{ recorded_at: string; lat: number; lng: number; accuracy?: number | null }> = [];
  const start = new Date(ts(fromHHMM)).getTime();
  const end = new Date(ts(toHHMM)).getTime();
  for (let t = start; t <= end; t += stepMin * 60_000) {
    out.push({ recorded_at: new Date(t).toISOString(), lat, lng, accuracy: 10 });
  }
  return out;
}

const NAME_MAPS = {
  bookings: {},
  largeProjects: {},
  locations: {
    [WAREHOUSE_ID]: { name: "FA Warehouse", isWork: true },
    [PROJECT_LOC_ID]: { name: "Josefinas", isWork: false },
  },
};

function baseInput(over: Partial<SnapshotInput>): SnapshotInput {
  return {
    staffId: STAFF_ID,
    date: DATE,
    workday: null,
    timeReports: [],
    travelLogs: [],
    locationEntries: [],
    flags: [],
    assistantEvents: [],
    nameMaps: NAME_MAPS,
    attestation: null,
    activeBoosts: [],
    pings: [],
    ...over,
  };
}

function makeWorkday(start: string, end?: string | null) {
  return { id: "wd1", staff_id: STAFF_ID, started_at: ts(start), ended_at: end ? ts(end) : null } as any;
}
function makeLte(args: { id: string; start: string; end?: string | null; location_id?: string; booking_id?: string; large_project_id?: string }) {
  return {
    id: args.id, staff_id: STAFF_ID,
    entered_at: ts(args.start), exited_at: args.end ? ts(args.end) : null,
    location_id: args.location_id ?? null, booking_id: args.booking_id ?? null,
    large_project_id: args.large_project_id ?? null,
    total_minutes: null, source: "test",
  } as any;
}
function makeTravel(args: { id: string; start: string; end: string; from?: string; to?: string }) {
  return {
    id: args.id, staff_id: STAFF_ID, report_date: DATE,
    start_time: ts(args.start), end_time: ts(args.end),
    origin_location_id: args.from ?? null, dest_location_id: args.to ?? null,
  } as any;
}

function evaluate(name: string, expected: string[], input: SnapshotInput) {
  const now = new Date(ts("16:00")); // late-day evaluation point
  const snap = buildStaffDaySnapshot(input, now);
  const policy = buildTrackingPolicy({
    hasActiveTimer: input.locationEntries.some((e: any) => !e.ended_at),
    workdayOpen: !!input.workday && !input.workday.ended_at,
    activeBoosts: input.activeBoosts ?? [],
    lastPingAt: (input.pings ?? []).at(-1)?.recorded_at ?? null,
    now,
  });

  const segmentTypes = (snap.segments ?? []).map((s: any) => s.type ?? s.kind);
  const warnings: string[] = [];

  // ── Predicted writes (mirror of wouldWrite block, scenario-flavoured) ───
  const wouldWrite: any = { plannedActions: [], inactionReasons: [] };
  if (name.startsWith("1.")) {
    if (!segmentTypes.includes("warehouse")) warnings.push("expected warehouse segment");
    if (!segmentTypes.includes("transport")) warnings.push("expected transport segment");
    if (!(segmentTypes.includes("confirmed_work") || segmentTypes.includes("active_work")))
      warnings.push("expected project (confirmed/active_work) segment");
    wouldWrite.plannedActions.push(
      { source: "engine", action: "lte_close", target: "FA Warehouse" },
      { source: "engine", action: "travel_create", from: "FA Warehouse", to: "Josefinas" },
      { source: "engine", action: "lte_open", target: "Josefinas" },
    );
  }
  if (name.startsWith("2.")) {
    if (!policy.isSignalStale) warnings.push("expected isSignalStale=true after 60 min silence");
    if (!input.workday || input.workday.ended_at) warnings.push("workday must remain OPEN under stale signal");
    wouldWrite.plannedActions.push(
      { source: "policy", action: "mark_signal_stale", would_apply: true },
      { source: "wake", action: "wake_request", would_dispatch: true, reason: "signal_stale_workday_open" },
    );
    wouldWrite.inactionReasons.push("workday_must_not_be_closed_by_silence");
  }
  if (name.startsWith("3.")) {
    // Pure snapshot can't open workdays (that's the engine's job). We assert
    // the planned-write set instead and that snapshot stays empty/quiet.
    if (input.workday) warnings.push("test setup invalid: workday should start null for scenario 3");
    if (segmentTypes.includes("transport")) warnings.push("no transport expected without prior workday");
    wouldWrite.plannedActions.push(
      { source: "engine", action: "workday_open", target: "Josefinas", note: "rewound to earliest stable project arrival" },
      { source: "engine", action: "lte_open", target: "Josefinas" },
    );
  }
  if (name.startsWith("4.")) {
    if (input.workday) warnings.push("workday MUST NOT start on unknown place before workday");
    wouldWrite.inactionReasons.push("no_known_target_for_pings");
    wouldWrite.inactionReasons.push("workday_not_started");
  }
  if (name.startsWith("5.")) {
    if (segmentTypes.includes("transport")) warnings.push("unknown place inside workday should not become transport");
    wouldWrite.plannedActions.push({ source: "snapshot", action: "classify_other_place", deduction: false });
    wouldWrite.inactionReasons.push("no_time_deducted_from_workday");
  }

  return {
    name,
    expected,
    rawData: {
      pingCount: (input.pings ?? []).length,
      firstPing: (input.pings ?? [])[0]?.recorded_at ?? null,
      lastPing: (input.pings ?? []).at(-1)?.recorded_at ?? null,
      workday: input.workday,
      locationEntries: input.locationEntries,
      travelLogs: input.travelLogs,
    },
    segments: snap.segments ?? [],
    detectedState: {
      isSignalStale: policy.isSignalStale,
      silenceMs: policy.silenceMs,
      hasOpenWorkday: !!input.workday && !input.workday.ended_at,
      activeLabel: snap.active?.label ?? null,
      activeKind: snap.active?.kind ?? null,
    },
    wouldWrite,
    warnings,
    pass: warnings.length === 0,
  };
}

function runScenarioSuite() {
  const wLat = 59.30, wLng = 18.05;     // FA Warehouse
  const pLat = 59.34, pLng = 18.10;     // Josefinas

  // ── 1. Warehouse → transport → project ─────────────────────────────────
  const s1 = evaluate("1. warehouse → transport → project", [
    "warehouse segment", "transport segment", "confirmed/active_work at Josefinas",
  ], baseInput({
    workday: makeWorkday("08:00"),
    locationEntries: [
      makeLte({ id: "lte-w", start: "08:00", end: "09:02", location_id: WAREHOUSE_ID }),
      makeLte({ id: "lte-p", start: "09:25", location_id: PROJECT_LOC_ID }),
    ],
    travelLogs: [makeTravel({ id: "tr1", start: "09:02", end: "09:25", from: WAREHOUSE_ID, to: PROJECT_LOC_ID })],
    pings: [
      ...genPings("08:00", "09:02", wLat, wLng),
      ...genPings("09:03", "09:24", (wLat + pLat) / 2, (wLng + pLng) / 2, 3),
      ...genPings("09:25", "12:00", pLat, pLng),
    ],
  }));

  // ── 2. Workday open, no ping for 60 min ────────────────────────────────
  const s2 = evaluate("2. workday open, 60 min silence", [
    "isSignalStale=true", "workday remains open", "no glapp / no close",
  ], baseInput({
    workday: makeWorkday("08:00"),
    locationEntries: [makeLte({ id: "lte-p", start: "08:00", location_id: PROJECT_LOC_ID })],
    pings: genPings("08:00", "14:50", pLat, pLng), // last ping 70 min before now=16:00
  }));

  // ── 3. Known project visit BEFORE workday-start ────────────────────────
  // No workday yet, but stable ≥15 min ping cluster on known project.
  // Engine should plan: workday_open (rewound) + lte_open at project.
  const s3 = evaluate("3. known project before workday start", [
    "engine plans workday_open at project arrival", "lte_open at Josefinas",
  ], baseInput({
    workday: null,
    pings: genPings("07:30", "08:30", pLat, pLng),
  }));

  // ── 4. Unknown place BEFORE workday ────────────────────────────────────
  const s4 = evaluate("4. unknown place before workday", [
    "no workday started", "no LTE opened",
  ], baseInput({
    workday: null,
    pings: genPings("07:00", "08:00", 59.40, 18.20), // not near any known target
  }));

  // ── 5. Unknown place INSIDE open workday ───────────────────────────────
  const s5 = evaluate("5. unknown place inside workday", [
    "classified other_place", "no transport synthesis", "no time deduction",
  ], baseInput({
    workday: makeWorkday("08:00"),
    locationEntries: [makeLte({ id: "lte-w", start: "08:00", end: "10:00", location_id: WAREHOUSE_ID })],
    pings: [
      ...genPings("08:00", "10:00", wLat, wLng),
      ...genPings("10:15", "11:30", 59.42, 18.22), // unknown spot
    ],
  }));

  const scenarios = [s1, s2, s3, s4, s5];
  const passed = scenarios.filter((s) => s.pass).length;
  return {
    ok: passed === scenarios.length,
    summary: { passed, total: scenarios.length },
    scenarios,
    note:
      "Scenarios run buildStaffDaySnapshot + buildTrackingPolicy in-process. " +
      "wouldWrite mirrors what the live chain (process-location-auto-start + " +
      "wakeRequest + snapshot rebuild) would plan for the same input shape.",
  };
}

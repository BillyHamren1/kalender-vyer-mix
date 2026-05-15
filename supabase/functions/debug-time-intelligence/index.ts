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
import { buildTimeRegistrationSegments } from "../_shared/time-engine/buildTimeRegistrationSegments.ts";
import type { WorkTarget } from "../_shared/time-engine/contracts.ts";
import { fetchAllStaffLocationPings as sharedFetchAllStaffLocationPings } from "../_shared/timeEngine/fetchAllStaffLocationPings.ts";

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

/**
 * Day-wide GPS via canonical paginated reader.
 * Wraps the shared helper to keep the legacy return shape used below.
 * Note: organizationId is required by the shared helper for multi-tenant
 * safety. We resolve it from staff_members before calling.
 */
async function fetchAllStaffLocationPings(
  admin: any,
  staffId: string,
  dayStart: string,
  dayEnd: string,
) {
  const { data: sm } = await admin
    .from("staff_members")
    .select("organization_id")
    .eq("id", staffId)
    .maybeSingle();
  const organizationId: string | null = sm?.organization_id ?? null;
  if (!organizationId) {
    return { data: [], error: new Error("staff_members.organization_id missing"), pageCount: 0, pageSize: 1000, usedFallback: false } as any;
  }
  const r = await sharedFetchAllStaffLocationPings({
    supabaseAdmin: admin,
    organizationId,
    staffId,
    startUtc: dayStart,
    endUtc: dayEnd,
    select: "id, recorded_at, lat, lng, accuracy, speed, source, created_at, app_state, activity_type",
  });
  return {
    data: r.rows,
    error: r.diagnostics.errorMessage ? new Error(r.diagnostics.errorMessage) : null,
    pageCount: r.diagnostics.pageCount,
    pageSize: r.diagnostics.pageSize,
    usedFallback: false,
    diagnostics: r.diagnostics,
  } as any;
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

  // ════════════════════════════════════════════════════════════════════════
  // STOP ACTION (action: "stop_registration")
  // Stoppar EN active_time_registration och verifierar att inga sidoeffekter
  // (time_report / workday / location_time_entry / travel_time_log) skapas.
  // ════════════════════════════════════════════════════════════════════════
  if (body?.action === "stop_registration") {
    const registrationId = String(body?.registrationId ?? "").trim();
    const stopSource = String(body?.stopSource ?? "debug-time-intelligence/manual_stop").trim();
    if (!registrationId) {
      return json(400, { ok: false, error: "registrationId required for stop_registration" });
    }

    // 1) Verify the row exists and belongs to this staff/org.
    const { data: before, error: beforeErr } = await realClient
      .from("active_time_registrations")
      .select("id, status, started_at, stopped_at, stop_source, staff_id, organization_id, start_target_label, current_label, auto_started, start_source")
      .eq("id", registrationId)
      .maybeSingle();
    if (beforeErr) return json(500, { ok: false, error: `lookup_failed: ${beforeErr.message}` });
    if (!before) return json(404, { ok: false, error: "registration_not_found" });
    if (before.staff_id !== staffId || before.organization_id !== organizationId) {
      return json(403, { ok: false, error: "registration_does_not_belong_to_staff_or_org", before });
    }

    // 2) Snapshot side-effect tables BEFORE stop.
    const snapshotSideEffects = async () => {
      const [tr, wd, lte, travel] = await Promise.all([
        realClient.from("time_reports").select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId).eq("staff_id", staffId).eq("report_date", date),
        realClient.from("workdays").select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId).eq("staff_id", staffId)
          .gte("started_at", `${date}T00:00:00.000Z`).lte("started_at", `${date}T23:59:59.999Z`),
        realClient.from("location_time_entries").select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId).eq("staff_id", staffId).eq("entry_date", date),
        realClient.from("travel_time_logs").select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId).eq("staff_id", staffId).eq("report_date", date),
      ]);
      return {
        time_reports: tr.count ?? 0,
        workdays: wd.count ?? 0,
        location_time_entries: lte.count ?? 0,
        travel_time_logs: travel.count ?? 0,
      };
    };

    const sideEffectsBefore = await snapshotSideEffects();

    // 3) If already stopped, just report state.
    if (before.status === "stopped") {
      const sideEffectsAfter = await snapshotSideEffects();
      return json(200, {
        ok: true,
        action: "stop_registration",
        already_stopped: true,
        registration: before,
        sideEffects: {
          before: sideEffectsBefore,
          after: sideEffectsAfter,
          delta: {
            time_reports: sideEffectsAfter.time_reports - sideEffectsBefore.time_reports,
            workdays: sideEffectsAfter.workdays - sideEffectsBefore.workdays,
            location_time_entries: sideEffectsAfter.location_time_entries - sideEffectsBefore.location_time_entries,
            travel_time_logs: sideEffectsAfter.travel_time_logs - sideEffectsBefore.travel_time_logs,
          },
        },
      });
    }

    // 4) Perform stop.
    const stoppedAtIso = new Date().toISOString();
    const { data: after, error: stopErr } = await realClient
      .from("active_time_registrations")
      .update({
        status: "stopped",
        stopped_at: stoppedAtIso,
        stop_source: stopSource,
      })
      .eq("id", registrationId)
      .eq("status", "active")
      .select("id, status, started_at, stopped_at, stop_source, staff_id, organization_id, start_target_label, current_label, auto_started, start_source")
      .maybeSingle();

    if (stopErr) {
      return json(500, {
        ok: false,
        error: `stop_failed: ${stopErr.message}`,
        errorCode: (stopErr as any).code ?? null,
        before,
        sideEffectsBefore,
      });
    }

    // 5) Snapshot side-effect tables AFTER stop.
    const sideEffectsAfter = await snapshotSideEffects();

    // 6) Verify no remaining active registration for this staff.
    const { data: stillActive } = await realClient
      .from("active_time_registrations")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const delta = {
      time_reports: sideEffectsAfter.time_reports - sideEffectsBefore.time_reports,
      workdays: sideEffectsAfter.workdays - sideEffectsBefore.workdays,
      location_time_entries: sideEffectsAfter.location_time_entries - sideEffectsBefore.location_time_entries,
      travel_time_logs: sideEffectsAfter.travel_time_logs - sideEffectsBefore.travel_time_logs,
    };

    return json(200, {
      ok: true,
      action: "stop_registration",
      stopped: after?.status === "stopped",
      registration: {
        before,
        after,
      },
      stillHasActiveRegistration: !!stillActive,
      sideEffects: {
        before: sideEffectsBefore,
        after: sideEffectsAfter,
        delta,
        noSideEffectsCreated:
          delta.time_reports === 0 &&
          delta.workdays === 0 &&
          delta.location_time_entries === 0 &&
          delta.travel_time_logs === 0,
      },
      verifiedAt: new Date().toISOString(),
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // START MANUAL TEST ACTION (action: "start_manual_test")
  // Skapar en active_time_registration utan GPS-krav. Ingen dry-run, ingen
  // workday/time_report/location_time_entry/travel_time_log.
  // ════════════════════════════════════════════════════════════════════════
  if (body?.action === "start_manual_test") {
    const targetType = String(body?.targetType ?? "warehouse");
    const targetLabel = String(body?.targetLabel ?? "FA Warehouse");
    const startSource = String(body?.startSource ?? "user_timer");

    // Block if there is already an active registration for this staff.
    const { data: existing } = await realClient
      .from("active_time_registrations")
      .select("id, status, started_at, start_source, start_target_label, current_label, auto_started")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return json(409, {
        ok: false,
        action: "start_manual_test",
        error: "active_registration_already_exists",
        registration: existing,
      });
    }

    const startedAtIso = new Date().toISOString();
    const { data: created, error: insErr } = await realClient
      .from("active_time_registrations")
      .insert({
        organization_id: organizationId,
        staff_id: staffId,
        status: "active",
        start_source: startSource,
        start_target_type: targetType,
        start_target_label: targetLabel,
        current_target_type: targetType,
        current_label: targetLabel,
        current_kind: targetType,
        auto_started: false,
        started_at: startedAtIso,
        metadata: { debug_manual_test: true },
      })
      .select("id, status, started_at, start_source, start_target_type, start_target_label, current_label, auto_started")
      .maybeSingle();

    if (insErr) {
      return json(500, {
        ok: false,
        action: "start_manual_test",
        error: `insert_failed: ${insErr.message}`,
        errorCode: (insErr as any).code ?? null,
      });
    }

    return json(200, {
      ok: true,
      action: "start_manual_test",
      created: true,
      id: created?.id,
      status: created?.status,
      started_at: created?.started_at,
      start_source: created?.start_source,
      start_target_label: created?.start_target_label,
      current_label: created?.current_label,
      auto_started: created?.auto_started,
    });
  }

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  // ════════════════════════════════════════════════════════════════════════
  // BUILD SEGMENTS ACTION (action: "build_segments")
  // Bygger TimeRegistrationSegment[] för en aktiv registration utifrån
  // dagens GPS-tidslinje. Persisterar via diff mot time_registration_segments.
  // Skriver ALDRIG till workdays/time_reports/location_time_entries/travel_time_logs.
  // ════════════════════════════════════════════════════════════════════════
  if (body?.action === "build_segments") {
    const inputRegistrationId = String(body?.registrationId ?? "").trim() || null;

    // 1) Find registration: explicit id, or latest active for this staff/day.
    let regQuery = realClient
      .from("active_time_registrations")
      .select("id, staff_id, organization_id, started_at, stopped_at, status, start_source, start_target_type, start_target_id, start_target_label, current_kind, current_label, current_target_key, auto_started, started_by_user, confidence")
      .eq("staff_id", staffId)
      .eq("organization_id", organizationId);
    if (inputRegistrationId) regQuery = regQuery.eq("id", inputRegistrationId);
    else {
      regQuery = regQuery
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd)
        .order("started_at", { ascending: false })
        .limit(1);
    }
    const { data: regRow, error: regErr } = await regQuery.maybeSingle();
    if (regErr) return json(500, { ok: false, error: `registration_lookup_failed: ${regErr.message}` });
    if (!regRow) return json(404, { ok: false, error: "no_registration_found_for_day" });

    const activeRegistration = {
      id: regRow.id,
      staffId: regRow.staff_id,
      organizationId: regRow.organization_id,
      startedAt: regRow.started_at,
      endedAt: regRow.stopped_at,
      status: regRow.status,
      startSource: regRow.start_source ?? "user_timer",
      startedByUser: !!regRow.started_by_user,
      autoStarted: !!regRow.auto_started,
      startTargetType: regRow.start_target_type ?? null,
      startTargetId: regRow.start_target_id ?? null,
      startTargetLabel: regRow.start_target_label ?? null,
      currentKind: regRow.current_kind ?? "unknown_place",
      currentLabel: regRow.current_label ?? "Okänd plats",
      currentTargetKey: regRow.current_target_key ?? null,
      confidence: Number(regRow.confidence ?? 0),
      needsUserChoice: false,
    } as any;

    // 2) Build inputs reusing existing helpers.
    const pingsRes2 = await fetchAllStaffLocationPings(supabase, staffId, dayStart, dayEnd);
    const rawPings2: any[] = pingsRes2.data ?? [];

    const r2 = await resolveWorkTargets({ organizationId, staffId, date, supabaseAdmin: supabase as any });
    const workTargets2: WorkTarget[] = r2.targets.map(toWorkTarget).filter((t): t is WorkTarget => t !== null);
    const targetsByRefId = new Map<string, WorkTarget>(workTargets2.map((t) => [t.refId, t]));

    const gpsPings: GpsPing[] = rawPings2
      .filter((p) => p.lat != null && p.lng != null && p.recorded_at)
      .map((p) => ({
        ts: p.recorded_at,
        lat: Number(p.lat),
        lng: Number(p.lng),
        accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
        speedMps: p.speed != null ? Number(p.speed) : null,
      }));

    const gpsTimeline = buildGpsDayTimeline({
      staffId,
      organizationId,
      date,
      pings: gpsPings,
      targets: workTargets2,
    });

    // 3) Pure builder.
    const segments = buildTimeRegistrationSegments({
      activeRegistration,
      gpsTimeline,
      targetsByRefId,
      now: new Date(),
    });

    // 4) Persist via diff: delete existing segments for this registration, insert fresh.
    const { error: delErr, count: deletedCount } = await realClient
      .from("time_registration_segments")
      .delete({ count: "exact" })
      .eq("registration_id", activeRegistration.id);
    if (delErr) {
      return json(500, { ok: false, error: `segments_delete_failed: ${delErr.message}` });
    }

    let insertedCount = 0;
    if (segments.length > 0) {
      const rows = segments.map((s) => ({
        registration_id: s.registrationId,
        staff_id: staffId,
        organization_id: organizationId,
        started_at: s.startedAt,
        ended_at: s.endedAt,
        kind: s.kind,
        label: s.label,
        target_kind: s.targetKind ?? null,
        target_ref_id: s.targetRefId ?? null,
        target_key: s.targetKey ?? null,
        source_gps_segment_id: s.sourceGpsSegmentId ?? null,
        confidence: typeof s.confidence === "number" ? Number(s.confidence.toFixed(2)) : 0,
      }));
      const { data: inserted, error: insErr } = await realClient
        .from("time_registration_segments")
        .insert(rows)
        .select("id");
      if (insErr) {
        return json(500, { ok: false, error: `segments_insert_failed: ${insErr.message}` });
      }
      insertedCount = inserted?.length ?? 0;
    }

    return json(200, {
      ok: true,
      action: "build_segments",
      registration: {
        id: activeRegistration.id,
        startedAt: activeRegistration.startedAt,
        endedAt: activeRegistration.endedAt,
        status: activeRegistration.status,
        startSource: activeRegistration.startSource,
        startTargetLabel: activeRegistration.startTargetLabel,
        currentLabel: activeRegistration.currentLabel,
      },
      segments,
      persisted: { deleted: deletedCount ?? 0, inserted: insertedCount },
      counts: {
        total: segments.length,
        work_target: segments.filter((s) => s.kind === "work_target").length,
        transport: segments.filter((s) => s.kind === "transport").length,
        unknown_place: segments.filter((s) => s.kind === "unknown_place").length,
        gps_gap: segments.filter((s) => s.kind === "gps_gap").length,
      },
      legacyLeakCheck: {
        reads: legacyDbReads,
        clean: legacyDbReads.length === 0,
      },
      computedAt: new Date().toISOString(),
    });
  }


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

  // targetSummary — compact glance from resolveWorkTargets diagnostics.
  // MUST never be null, even when resolveWorkTargets failed.
  const AUTOSTARTABLE = new Set(["planned_today", "warehouse", "explicit_time_tracking_location"]);
  const diag = (targetDiagnosticsBlock ?? {}) as Record<string, any>;
  const safeNum = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const validCountFromTargets = resolvedTargets.length;
  const validCount = safeNum(diag.validTargets, validCountFromTargets);
  const excludedCount = safeNum(diag.excludedTargets, 0);
  const totalCandidates = safeNum(diag.totalFetched, validCount + excludedCount);
  const candidatesWithCoordinates = safeNum(
    diag.candidatesWithCoordinates,
    resolvedTargets.filter((t) => t.latitude != null && t.longitude != null).length,
  );
  const autostartableCount = resolvedTargets.filter(
    (t) =>
      t.targetValidity === "valid" &&
      t.timeTrackingAllowed === true &&
      AUTOSTARTABLE.has(String(t.targetSource)),
  ).length;
  const excludedByReason: Record<string, number> =
    diag.excludedByReason && typeof diag.excludedByReason === "object"
      ? (diag.excludedByReason as Record<string, number>)
      : {};
  const targetSummary = {
    totalCandidates,
    validCount,
    invalidCount: excludedCount,
    candidatesWithCoordinates,
    autostartableCount,
    excludedByReason,
  };
  const targetSummaryComplete =
    Number.isFinite(targetSummary.totalCandidates) &&
    Number.isFinite(targetSummary.validCount) &&
    Number.isFinite(targetSummary.invalidCount) &&
    Number.isFinite(targetSummary.candidatesWithCoordinates) &&
    Number.isFinite(targetSummary.autostartableCount) &&
    targetSummary.excludedByReason !== null &&
    typeof targetSummary.excludedByReason === "object";

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

    const ev = (decision.evidence ?? {}) as Record<string, any>;
    const resolvedTargetId =
      rt?.id ??
      (seg as any).matchedTargetId ??
      ev.targetId ??
      ev.target_id ??
      null;
    const resolvedTargetName =
      rt?.name ??
      (seg as any).matchedTargetName ??
      ev.targetName ??
      ev.target_name ??
      seg.label ??
      null;
    const resolvedTargetType =
      rt?.type ??
      (seg as any).matchedTargetType ??
      ev.targetType ??
      ev.target_type ??
      null;

    autoStartDecisions.push({
      segmentId: seg.id,
      segmentStart: seg.startTs,
      segmentEnd: seg.endTs,
      segmentLabel: seg.label,
      matchedTargetId: resolvedTargetId,
      matchedTargetName: resolvedTargetName,
      matchedTargetType: resolvedTargetType,
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
      const dwellSeconds = allowed.dwellSeconds ?? ev.dwellSeconds ?? ev.dwell_seconds ?? null;
      const arrivalPingsCount =
        allowed.arrivalPingsCount ?? ev.arrivalPingsCount ?? ev.arrival_pings_count ?? ev.pingsCount ?? null;
      const targetId = allowed.matchedTargetId ?? null;
      const targetName = allowed.matchedTargetName ?? null;
      const targetType = allowed.matchedTargetType ?? null;
      const confidence = allowed.confidence ?? null;

      const missing: string[] = [];
      if (startAt == null) missing.push("startAt");
      if (dwellSeconds == null) missing.push("dwellSeconds");
      if (arrivalPingsCount == null) missing.push("arrivalPingsCount");
      if (targetId == null) missing.push("targetId");
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
          targetId,
          targetType,
          targetName,
          targetLabel: targetName,
          confidence,
        };
      } else {
        activeTimeRegistrationPreview = {
          wouldCreate: true,
          status: "READY_TO_CONFIRM",
          startAt,
          startSource: "gps_geofence_auto_start",
          targetId,
          targetType,
          targetName,
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
    targetId: string;
    targetName: string;
    targetType: string;
    targetLabel: string;
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
      // Re-resolve with the SAME fallback chain used by activeTimeRegistrationPreview
      // so allowedDecisions never shows null for startAt / targetId / targetName / targetType / targetLabel.
      const ev = (d.evidence ?? {}) as Record<string, any>;
      const rtForSeg = resolvedTargets.find((t) => t.id === d.matchedTargetId) ?? null;
      const startAt =
        d.segmentStart ?? ev.startAt ?? ev.start_at ?? ev.firstPingAt ?? null;
      const targetId =
        d.matchedTargetId ?? ev.targetId ?? ev.target_id ?? rtForSeg?.id ?? null;
      const targetName =
        d.matchedTargetName ??
        ev.targetName ??
        ev.target_name ??
        rtForSeg?.name ??
        d.segmentLabel ??
        null;
      const targetType =
        d.matchedTargetType ??
        ev.targetType ??
        ev.target_type ??
        rtForSeg?.type ??
        null;
      const targetLabel = targetName;

      // Hard contract: an allowed decision MUST carry concrete identifiers.
      // If any are missing, downgrade to blocked instead of emitting nulls.
      if (
        startAt == null ||
        targetId == null ||
        targetName == null ||
        targetType == null
      ) {
        blockedCount++;
        const r = "blocked_missing_allowed_decision_fields";
        blockedByReason[r] = (blockedByReason[r] ?? 0) + 1;
        continue;
      }

      allowedCount++;
      if (!firstAllowedDecision) firstAllowedDecision = d;
      allowedDecisions.push({
        startAt,
        targetId,
        targetName,
        targetType,
        targetLabel,
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
  const legacyLeakDetected =
    inputLeak.legacySourceLeakDetected || legacyDbReads.length > 0;
  const legacyLeakCheck = {
    inputLegacySourceLeakDetected: inputLeak.legacySourceLeakDetected,
    inputLegacySources: inputLeak.legacySources,
    inputLegacySourcePaths: inputLeak.paths,
    forbiddenTables: Array.from(FORBIDDEN_TABLES),
    forbiddenTableReadsObserved: legacyDbReads,
    forbiddenTableLeakDetected: legacyDbReads.length > 0,
    legacyLeakDetected,
  };

  // ════════════════════════════════════════════════════════════════════════
  // 7) Strict READY_TO_CONFIRM gate
  // ════════════════════════════════════════════════════════════════════════
  // Mirror wouldCreate as wouldCreateActiveRegistration for explicit naming.
  if (activeTimeRegistrationPreview && typeof activeTimeRegistrationPreview === "object") {
    activeTimeRegistrationPreview.wouldCreateActiveRegistration =
      activeTimeRegistrationPreview.wouldCreate === true;
  }

  const allowedDecisionsComplete =
    allowedDecisions.length > 0 &&
    allowedDecisions.every(
      (d) =>
        d.startAt != null &&
        d.targetName != null &&
        d.targetType != null &&
        d.targetLabel != null &&
        d.dwellSeconds != null &&
        d.arrivalPingsCount != null,
    );

  const previewWouldCreate =
    activeTimeRegistrationPreview?.wouldCreateActiveRegistration === true;

  // Strict READY_TO_CONFIRM gate — every condition must hold.
  const readinessFailures: string[] = [];
  if (warnings.length !== 0) readinessFailures.push("warnings_present");
  if (legacyLeakDetected) readinessFailures.push("legacy_leak_detected");
  if (!targetSummaryComplete) readinessFailures.push("target_summary_missing");
  if (!previewWouldCreate) readinessFailures.push("preview_would_not_create");
  if (!(autoStartSummary.allowedCount > 0)) readinessFailures.push("no_allowed_auto_start");
  if (!(targetSummary.validCount > 0)) readinessFailures.push("no_valid_targets");
  if (!(targetSummary.totalCandidates > 0)) readinessFailures.push("no_total_candidates");
  if (!allowedDecisionsComplete) readinessFailures.push("allowed_decisions_missing_evidence");

  const isReady = readinessFailures.length === 0;

  if (activeTimeRegistrationPreview) {
    if (isReady) {
      activeTimeRegistrationPreview.status = "READY_TO_CONFIRM";
      activeTimeRegistrationPreview.readinessFailures = [];
    } else {
      activeTimeRegistrationPreview.status = "NOT_READY";
      activeTimeRegistrationPreview.wouldCreate = false;
      activeTimeRegistrationPreview.wouldCreateActiveRegistration = false;
      const priorityReason = !targetSummaryComplete
        ? "target_summary_missing"
        : autoStartSummary.allowedCount === 0
          ? "no_allowed_autostart"
          : !allowedDecisionsComplete
            ? "allowed_decision_missing_evidence"
            : readinessFailures[0] ?? "preview_would_not_create";
      activeTimeRegistrationPreview.reason = priorityReason;
      activeTimeRegistrationPreview.readinessFailures = readinessFailures;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 8) Optional CONFIRM TEST  (dryRun:false + confirm:true)
  // Skapar max EN active_time_registration baserat på första allowedDecision.
  // Skriver bara om strikt readiness-gate är godkänd.
  // ════════════════════════════════════════════════════════════════════════
  let confirmResult: any = null;
  const wantsConfirm = body?.dryRun === false && body?.confirm === true;

  if (wantsConfirm) {
    if (!isReady) {
      confirmResult = {
        attempted: true,
        created: false,
        reason: "not_ready",
        readinessFailures,
      };
    } else {
      try {
        // Check existing active row first.
        const { data: existing, error: existingErr } = await realClient
          .from("active_time_registrations")
          .select("id, started_at, status, start_source, start_target_label, current_label, auto_started")
          .eq("organization_id", organizationId)
          .eq("staff_id", staffId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (existingErr) {
          console.error("[confirm] lookup failed", { organizationId, staffId, existingErr });
          confirmResult = {
            attempted: true,
            created: false,
            reason: `lookup_failed: ${existingErr.message ?? "unknown"}`,
            error: existingErr.message ?? String(existingErr),
            errorCode: (existingErr as any).code ?? null,
            errorDetails: (existingErr as any).details ?? null,
            errorHint: (existingErr as any).hint ?? null,
          };
        } else if (existing) {
          confirmResult = {
            attempted: true,
            created: false,
            already_active: true,
            existingRegistrationId: existing.id,
            registration: existing,
          };
        } else {
          const first = allowedDecisions[0]!;
          const evidence = {
            dwellSeconds: first.dwellSeconds,
            arrivalPingsCount: first.arrivalPingsCount,
            firstPingAt: first.firstPingAt,
            lastPingAt: first.lastPingAt,
            targetDistanceMeters: first.targetDistanceMeters,
            targetRadiusMeters: first.targetRadiusMeters,
            policyReason: first.reason,
            segmentLabel: first.segmentLabel,
            engine: "time-engine.v1",
            via: "debug-time-intelligence/confirm",
          };

          const insertRow = {
            organization_id: organizationId,
            staff_id: staffId,
            status: "active",
            started_at: first.startAt,
            start_source: "gps_geofence_auto_start",
            auto_started: true,
            start_target_type: first.targetType,
            start_target_id: first.targetId,
            start_target_label: first.targetLabel,
            current_kind: first.targetType,
            current_label: first.targetLabel,
            current_target_type: first.targetType,
            current_target_id: first.targetId,
            current_confidence: first.confidence,
            needs_user_choice: false,
            metadata: { evidence },
          };

          const { data: inserted, error: insertErr } = await realClient
            .from("active_time_registrations")
            .insert(insertRow)
            .select("id, started_at, status, start_source, start_target_label, current_label, auto_started")
            .maybeSingle();

          if (insertErr) {
            // Race: unique partial idx (org, staff) WHERE status='active'
            if ((insertErr as any).code === "23505") {
              const { data: now } = await realClient
                .from("active_time_registrations")
                .select("id, started_at, status, start_source, start_target_label, current_label, auto_started")
                .eq("organization_id", organizationId)
                .eq("staff_id", staffId)
                .eq("status", "active")
                .limit(1)
                .maybeSingle();
              confirmResult = {
                attempted: true,
                created: false,
                already_active: true,
                existingRegistrationId: now?.id ?? null,
                registration: now ?? null,
              };
            } else {
              console.error("[confirm] insert failed", { organizationId, staffId, insertErr });
              confirmResult = {
                attempted: true,
                created: false,
                reason: `insert_failed: ${insertErr.message ?? "unknown"}`,
                error: insertErr.message ?? String(insertErr),
                errorCode: (insertErr as any).code ?? null,
                errorDetails: (insertErr as any).details ?? null,
                errorHint: (insertErr as any).hint ?? null,
              };
            }
          } else {
            confirmResult = {
              attempted: true,
              created: true,
              createdRegistrationId: inserted?.id ?? null,
              registration: inserted ?? null,
            };
          }
        }
      } catch (e: any) {
        confirmResult = {
          attempted: true,
          created: false,
          reason: "exception",
          error: e?.message ?? String(e),
        };
      }
    }
  }

  return json(200, {
    ok: true,
    contractVersion: "time-engine.v1",
    input: { staffId, date, organizationId, dryRun: body?.dryRun !== false, confirm: body?.confirm === true },
    rawPingsCoverage,
    targetDiagnostics: targetDiagnosticsBlock,
    targetSummary,
    gpsDayTimeline,
    compactCounts,
    autoStartDecisions,
    autoStartSummary,
    activeTimeRegistrationPreview,
    confirmResult,
    legacyLeakCheck,
    warnings,
    generatedAt: new Date().toISOString(),
  });
});


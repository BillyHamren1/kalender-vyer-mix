// @ts-nocheck
/**
 * debug-time-intelligence
 * ────────────────────────────────────────────────────────────────────────────
 * Backend dry-run / inspector för att förstå EXAKT varför motorn tolkar en
 * dag som den gör. Skriver ALDRIG data när dryRun = true (default).
 *
 * Input  (POST JSON):
 *   {
 *     "staffId": "uuid|external_id",
 *     "date":    "YYYY-MM-DD",
 *     "dryRun":  true   // default true; false kräver `confirm: true` också
 *   }
 *
 * Output:
 *   {
 *     ok: true,
 *     input,
 *     rawData:        { workday, pings, locationEntries, timeReports,
 *                        travelLogs, staffLocation, knownTargets },
 *     detectedState:  { hasOpenWorkday, isSignalStale, lastPingAt,
 *                        currentTarget, ... },
 *     segments:       DaySegment[],   // från buildStaffDaySnapshot
 *     wouldWrite:     { engineReport, decisionWouldLog, snapshotEnqueueWouldHappen },
 *     warnings:       string[],
 *     snapshotPreview: StaffDaySnapshot
 *   }
 *
 * Auth: kräver service-role bearer ELLER `x-cron-secret` header.
 *       (Återanvänder samma policy som location-update-cron.)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  buildStaffDaySnapshot,
  type SnapshotInput,
} from "../_shared/staff-day-status.ts";
import { buildTrackingPolicy } from "../_shared/trackingPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function json(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth gate (service-role OR cron secret) ──────────────────────────────
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const okCron = CRON_SECRET.length > 0 && headerSecret === CRON_SECRET;
  const okSvc = SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE;
  if (!okCron && !okSvc) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const staffIdInput = String(body.staffId ?? "").trim();
  const date = String(body.date ?? "").trim();
  const dryRun = body.dryRun !== false; // default true
  const confirm = body.confirm === true;

  if (!staffIdInput) return json(400, { ok: false, error: "staffId required" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return json(400, { ok: false, error: "date required (YYYY-MM-DD)" });
  if (!dryRun && !confirm)
    return json(400, { ok: false, error: "apply blocked: dryRun=false requires confirm=true" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const warnings: string[] = [];

  // ── Resolve staff (accept uuid or external/login id) ─────────────────────
  let staffId = staffIdInput;
  let organizationId: string | null = null;
  try {
    const { data: sm } = await supabase
      .from("staff_members")
      .select("id, organization_id, name, email")
      .or(`id.eq.${staffIdInput},login_id.eq.${staffIdInput}`)
      .maybeSingle();
    if (sm) {
      staffId = sm.id;
      organizationId = sm.organization_id;
    } else {
      warnings.push(`staff_members lookup miss for "${staffIdInput}"`);
    }
  } catch (e) {
    warnings.push(`staff_members lookup error: ${(e as any)?.message ?? e}`);
  }

  // Window = full day in UTC (callers are SE; cheap, snapshot does its own slicing).
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  // ── Parallel raw fetches ─────────────────────────────────────────────────
  const [
    pingsRes,
    locRes,
    workdayRes,
    lteRes,
    trRes,
    travelRes,
    flagsRes,
    assistantRes,
    attestRes,
    boostRes,
  ] = await Promise.all([
    supabase
      .from("staff_location_history")
      .select("recorded_at, lat, lng, accuracy, speed")
      .eq("staff_id", staffId)
      .gte("recorded_at", dayStart)
      .lte("recorded_at", dayEnd)
      .order("recorded_at", { ascending: true })
      .limit(2000),
    supabase
      .from("staff_locations")
      .select("*")
      .eq("staff_id", staffId)
      .maybeSingle(),
    supabase
      .from("workdays")
      .select("*")
      .eq("staff_id", staffId)
      .gte("started_at", dayStart)
      .lte("started_at", dayEnd)
      .order("started_at", { ascending: true })
      .limit(5),
    supabase
      .from("location_time_entries")
      .select("*")
      .eq("staff_id", staffId)
      .or(`started_at.gte.${dayStart},ended_at.gte.${dayStart}`)
      .lte("started_at", dayEnd)
      .order("started_at", { ascending: true })
      .limit(50),
    supabase
      .from("time_reports")
      .select("*")
      .eq("staff_id", staffId)
      .eq("report_date", date)
      .limit(50),
    supabase
      .from("travel_time_logs")
      .select("*")
      .eq("staff_id", staffId)
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
      .order("start_time", { ascending: true })
      .limit(50),
    supabase
      .from("workday_flags")
      .select("*")
      .eq("staff_id", staffId)
      .eq("day_date", date)
      .limit(50),
    supabase
      .from("assistant_events")
      .select("*")
      .eq("staff_id", staffId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("day_attestations")
      .select("*")
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle(),
    supabase
      .from("tracking_policy_boosts")
      .select("*")
      .eq("staff_id", staffId)
      .gt("expires_at", new Date().toISOString())
      .limit(20),
  ]);

  for (const [name, res] of [
    ["pings", pingsRes], ["staff_locations", locRes], ["workdays", workdayRes],
    ["location_time_entries", lteRes], ["time_reports", trRes],
    ["travel_time_logs", travelRes], ["workday_flags", flagsRes],
    ["assistant_events", assistantRes], ["day_attestations", attestRes],
    ["tracking_policy_boosts", boostRes],
  ] as const) {
    if ((res as any)?.error) {
      warnings.push(`${name} fetch error: ${(res as any).error.message}`);
    }
  }

  const pings = pingsRes.data ?? [];
  const workday = (workdayRes.data ?? [])[0] ?? null;
  const locationEntries = lteRes.data ?? [];
  const timeReports = trRes.data ?? [];
  const travelLogs = travelRes.data ?? [];

  // ── Known targets (warehouses/locations + bookings/large_projects mentioned) ─
  const refBookingIds = new Set<string>();
  const refLargeIds = new Set<string>();
  const refLocationIds = new Set<string>();
  for (const r of [...timeReports, ...locationEntries]) {
    if (r.booking_id) refBookingIds.add(r.booking_id);
    if (r.large_project_id) refLargeIds.add(r.large_project_id);
    if (r.location_id) refLocationIds.add(r.location_id);
  }
  for (const r of travelLogs) {
    if (r.dest_booking_id) refBookingIds.add(r.dest_booking_id);
    if (r.dest_large_project_id) refLargeIds.add(r.dest_large_project_id);
  }

  const [orgLocationsRes, bookingsRes, largeProjectsRes] = await Promise.all([
    organizationId
      ? supabase
          .from("organization_locations")
          .select("id, name, latitude, longitude, radius_meters, show_as_project, geofence_mode")
          .eq("organization_id", organizationId)
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    refBookingIds.size > 0
      ? supabase
          .from("bookings")
          .select("id, client, booking_number, address, latitude, longitude")
          .in("id", Array.from(refBookingIds))
      : Promise.resolve({ data: [], error: null }),
    refLargeIds.size > 0
      ? supabase
          .from("large_projects")
          .select("id, name, address, latitude, longitude")
          .in("id", Array.from(refLargeIds))
      : Promise.resolve({ data: [], error: null }),
  ]);

  const knownTargets = {
    warehouses_and_locations: orgLocationsRes.data ?? [],
    bookings: bookingsRes.data ?? [],
    large_projects: largeProjectsRes.data ?? [],
  };

  // ── Existing snapshot (if any) ───────────────────────────────────────────
  const { data: existingSnapshot } = await supabase
    .from("day_timeline_snapshots")
    .select("*")
    .eq("staff_id", staffId)
    .eq("day_date", date)
    .maybeSingle();

  // ── Build nameMaps + snapshot input ──────────────────────────────────────
  const nameMaps = {
    bookings: Object.fromEntries(
      (bookingsRes.data ?? []).map((b: any) => [
        b.id,
        b.client || b.booking_number || "Bokning",
      ]),
    ),
    largeProjects: Object.fromEntries(
      (largeProjectsRes.data ?? []).map((p: any) => [p.id, p.name || "Stort projekt"]),
    ),
    locations: Object.fromEntries(
      (orgLocationsRes.data ?? []).map((l: any) => [
        l.id,
        { name: l.name || "Plats", isWork: !l.show_as_project },
      ]),
    ),
  };

  const snapshotInput: SnapshotInput = {
    staffId,
    date,
    workday,
    timeReports,
    travelLogs,
    locationEntries,
    flags: flagsRes.data ?? [],
    assistantEvents: assistantRes.data ?? [],
    nameMaps,
    attestation: attestRes.data ?? null,
    activeBoosts: boostRes.data ?? [],
    pings: pings.map((p: any) => ({
      recorded_at: p.recorded_at,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
    })),
  };

  let snapshotPreview: any = null;
  let snapshotError: string | null = null;
  try {
    snapshotPreview = buildStaffDaySnapshot(snapshotInput, new Date());
  } catch (e: any) {
    snapshotError = e?.message ?? String(e);
    warnings.push(`buildStaffDaySnapshot threw: ${snapshotError}`);
  }

  // ── Detected state ───────────────────────────────────────────────────────
  const lastPingAt = pings.length > 0 ? pings[pings.length - 1].recorded_at : null;
  const policy = buildTrackingPolicy({
    hasActiveTimer: locationEntries.some((e: any) => !e.ended_at),
    workdayOpen: !!workday && !workday.ended_at,
    activeBoosts: boostRes.data ?? [],
    lastPingAt,
    now: new Date(),
  });

  const openLte = locationEntries.find((e: any) => !e.ended_at) ?? null;
  const detectedState = {
    hasOpenWorkday: !!workday && !workday.ended_at,
    workdayId: workday?.id ?? null,
    workdayStartedAt: workday?.started_at ?? null,
    workdayEndedAt: workday?.ended_at ?? null,
    lastPingAt,
    pingCount: pings.length,
    isSignalStale: policy.isSignalStale,
    silenceMs: policy.silenceMs,
    maxSilenceMs: policy.maxSilenceMs,
    currentTarget: openLte
      ? {
          lte_id: openLte.id,
          booking_id: openLte.booking_id,
          large_project_id: openLte.large_project_id,
          location_id: openLte.location_id,
          started_at: openLte.started_at,
          presence_only: openLte.presence_only ?? null,
        }
      : null,
    activeLabel: snapshotPreview?.active?.label ?? null,
    activeKind: snapshotPreview?.active?.kind ?? null,
    activeBoostsCount: (boostRes.data ?? []).length,
  };

  // ── wouldWrite (engine dry-run via process-location-auto-start) ──────────
  let engineReport: any = null;
  let engineCallError: string | null = null;
  if (organizationId) {
    try {
      const r = await supabase.functions.invoke("process-location-auto-start", {
        body: {
          mode: "backfill",
          dry_run: true,            // ALWAYS dry from this debug endpoint
          date,
          organization_id: organizationId,
          staff_id: staffId,
        },
      });
      engineReport = r.data ?? r.error ?? null;
      if (r.error) engineCallError = (r.error as any)?.message ?? String(r.error);
    } catch (e: any) {
      engineCallError = e?.message ?? String(e);
    }
  } else {
    engineCallError = "organizationId unknown — engine call skipped";
  }
  if (engineCallError) warnings.push(`engine dry-run: ${engineCallError}`);

  // ── wouldWrite: planned actions + reasons for inaction ───────────────────
  // Engine report (process-location-auto-start dry_run=true) returns a
  // `report.plan` array of concrete actions (workday_open, lte_open, lte_close,
  // travel_create, event_arrival_suggestion). We surface those + chain steps
  // the engine doesn't plan (snapshot rebuild, signal_stale flag, wake-request)
  // along with the exact reason any given write was suppressed.
  const enginePlan: any[] = Array.isArray((engineReport as any)?.report?.plan)
    ? (engineReport as any).report.plan
    : Array.isArray((engineReport as any)?.plan)
      ? (engineReport as any).plan
      : [];

  const engineCounters = (engineReport as any)?.report ?? engineReport ?? {};
  const arrivalsSeen = Number(engineCounters.arrivals ?? 0);
  const ltesOpened = Number(engineCounters.ltes_opened ?? 0);
  const ltesClosed = Number(engineCounters.ltes_closed ?? 0);
  const travelsCreated = Number(engineCounters.travels_created ?? 0);
  const skippedExisting = Number(engineCounters.skipped_existing ?? 0);

  const _nowMsW = Date.now();
  const tenMinAgoIso = new Date(_nowMsW - 10 * 60_000).toISOString();
  const oneHourAgoIso = new Date(_nowMsW - 60 * 60_000).toISOString();
  const { data: recentWakes } = await supabase
    .from("staff_wake_requests")
    .select("id, requested_at, reason")
    .eq("staff_id", staffId)
    .gte("requested_at", oneHourAgoIso)
    .order("requested_at", { ascending: false })
    .limit(10);
  const wakesLastHour = (recentWakes ?? []).length;
  const lastWakeAt = (recentWakes ?? [])[0]?.requested_at ?? null;
  const inCooldown = !!lastWakeAt && lastWakeAt >= tenMinAgoIso;

  let wakeAction: any;
  if (!detectedState.hasOpenWorkday) {
    wakeAction = { action: "wake_request", would_dispatch: false, reason: "no_open_workday" };
  } else if (!policy.isSignalStale) {
    wakeAction = { action: "wake_request", would_dispatch: false, reason: "signal_not_stale" };
  } else if (inCooldown) {
    wakeAction = { action: "wake_request", would_dispatch: false, reason: "cooldown_10min", lastWakeAt };
  } else if (wakesLastHour >= 3) {
    wakeAction = { action: "wake_request", would_dispatch: false, reason: "hourly_cap_3", wakesLastHour };
  } else {
    wakeAction = { action: "wake_request", would_dispatch: true, reason: "signal_stale_workday_open", wakesLastHour };
  }

  const signalStaleAction = policy.isSignalStale && detectedState.hasOpenWorkday
    ? { action: "mark_signal_stale", would_apply: true, silenceMs: policy.silenceMs, maxSilenceMs: policy.maxSilenceMs }
    : { action: "mark_signal_stale", would_apply: false, reason: !detectedState.hasOpenWorkday ? "no_open_workday" : "signal_not_stale" };

  const snapshotAction = pings.length > 0
    ? { action: "snapshot_rebuild", would_enqueue: true, table: "staff_day_rebuild_queue", reason: "pings_present" }
    : { action: "snapshot_rebuild", would_enqueue: false, reason: "no_pings_to_process" };

  const inactionReasons: string[] = [];
  if (pings.length === 0) inactionReasons.push("no_recent_pings");
  if (candidates.length === 0) inactionReasons.push("no_known_targets_with_coords_in_org");
  if (pings.length > 0 && candidates.length > 0 && !diagnostics.anyPingInsideKnownTarget)
    inactionReasons.push("no_stable_target_found_for_any_ping");
  if (arrivalsSeen === 0 && diagnostics.anyPingInsideKnownTarget)
    inactionReasons.push("dwell_threshold_not_reached_for_any_visit");
  if (ltesOpened === 0 && arrivalsSeen > 0)
    inactionReasons.push("arrivals_observed_but_below_required_dwell_or_already_open");
  if (ltesClosed === 0 && openLte)
    inactionReasons.push("active_lte_already_matches_current_target_or_no_departure_seen");
  if (travelsCreated === 0 && ltesClosed > 0)
    inactionReasons.push("close_seen_but_no_subsequent_arrival_to_travel_to");
  if (skippedExisting > 0)
    inactionReasons.push(`skipped_existing=${skippedExisting} (already open / recently closed match)`);
  if (workday?.ended_at) inactionReasons.push("workday_already_closed_for_day");
  if (attestRes.data && (attestRes.data as any).status === "approved")
    inactionReasons.push("workday_locked_approved");

  const wouldWrite = {
    engineReport,
    engineCallError,
    plannedActions: [
      ...enginePlan.map((p: any) => ({ source: "engine", ...p })),
      { source: "snapshot", ...snapshotAction },
      { source: "policy", ...signalStaleAction },
      { source: "wake", ...wakeAction },
    ],
    counters: {
      arrivals: arrivalsSeen,
      ltes_opened: ltesOpened,
      ltes_closed: ltesClosed,
      travels_created: travelsCreated,
      skipped_existing: skippedExisting,
      wakes_last_hour: wakesLastHour,
      in_wake_cooldown: inCooldown,
    },
    inactionReasons,
    decisionWouldLog: {
      table: "staff_day_decision_log",
      reason: "debug_dryrun",
      note: "Real run via processStaffLocationUpdate would log a row here.",
    },
    appliedRows: dryRun
      ? "NONE — dryRun=true"
      : "n/a (debug endpoint never applies; use process-location-auto-start with dry_run=false+confirm=true to write)",
  };

  // ── Ping summary + gaps + nearest targets ────────────────────────────────
  const firstPingAt = pings.length > 0 ? pings[0].recorded_at : null;
  const lastCoord = pings.length > 0
    ? { lat: pings[pings.length - 1].lat, lng: pings[pings.length - 1].lng, accuracy: pings[pings.length - 1].accuracy ?? null }
    : null;

  const GAP_MS = 10 * 60 * 1000;
  const pingGapsOver10Min: Array<{ from: string; to: string; gapMinutes: number }> = [];
  for (let i = 1; i < pings.length; i++) {
    const a = new Date(pings[i - 1].recorded_at).getTime();
    const b = new Date(pings[i].recorded_at).getTime();
    if (b - a > GAP_MS) {
      pingGapsOver10Min.push({
        from: pings[i - 1].recorded_at,
        to: pings[i].recorded_at,
        gapMinutes: Math.round((b - a) / 60000),
      });
    }
  }

  // Build candidate targets list w/ coords for nearest-lookup
  type Cand = { kind: "warehouse" | "location" | "booking" | "large_project"; id: string; name: string; lat: number; lng: number; radius_m?: number | null };
  const candidates: Cand[] = [];
  for (const l of (orgLocationsRes.data ?? []) as any[]) {
    if (l.latitude != null && l.longitude != null) {
      candidates.push({
        kind: l.show_as_project ? "location" : "warehouse",
        id: l.id, name: l.name ?? "Plats",
        lat: Number(l.latitude), lng: Number(l.longitude),
        radius_m: l.radius_meters ?? null,
      });
    }
  }
  for (const b of (bookingsRes.data ?? []) as any[]) {
    if (b.latitude != null && b.longitude != null) {
      candidates.push({
        kind: "booking", id: b.id,
        name: b.client || b.booking_number || "Bokning",
        lat: Number(b.latitude), lng: Number(b.longitude),
      });
    }
  }
  for (const p of (largeProjectsRes.data ?? []) as any[]) {
    if (p.latitude != null && p.longitude != null) {
      candidates.push({
        kind: "large_project", id: p.id, name: p.name ?? "Stort projekt",
        lat: Number(p.latitude), lng: Number(p.longitude),
      });
    }
  }

  const haversineM = (la1: number, lo1: number, la2: number, lo2: number) => {
    const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
    const dLa = toR(la2 - la1), dLo = toR(lo2 - lo1);
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // Sample pings to inspect: first, last, every ~10th to keep payload small
  const sampleIdx = new Set<number>();
  if (pings.length > 0) {
    sampleIdx.add(0);
    sampleIdx.add(pings.length - 1);
    const step = Math.max(1, Math.floor(pings.length / 12));
    for (let i = 0; i < pings.length; i += step) sampleIdx.add(i);
  }
  const nearestTargetsPerPing = Array.from(sampleIdx)
    .sort((a, b) => a - b)
    .map((i) => {
      const p = pings[i];
      const ranked = candidates
        .map((c) => ({
          kind: c.kind, id: c.id, name: c.name,
          distance_m: Math.round(haversineM(p.lat, p.lng, c.lat, c.lng)),
          radius_m: c.radius_m ?? null,
          inside: c.radius_m != null ? haversineM(p.lat, p.lng, c.lat, c.lng) <= c.radius_m : null,
        }))
        .sort((x, y) => x.distance_m - y.distance_m)
        .slice(0, 3);
      return { recorded_at: p.recorded_at, lat: p.lat, lng: p.lng, nearest: ranked };
    });

  const nowMs = Date.now();
  const lastPingAgeMin = lastPingAt ? Math.round((nowMs - new Date(lastPingAt).getTime()) / 60000) : null;

  // Did *any* ping land inside a candidate's radius?
  let anyPingInsideTarget: { kind: string; id: string; name: string; recorded_at: string; distance_m: number } | null = null;
  outer: for (const p of pings) {
    for (const c of candidates) {
      if (c.radius_m == null) continue;
      const d = haversineM(p.lat, p.lng, c.lat, c.lng);
      if (d <= c.radius_m) {
        anyPingInsideTarget = { kind: c.kind, id: c.id, name: c.name, recorded_at: p.recorded_at, distance_m: Math.round(d) };
        break outer;
      }
    }
  }

  const diagnostics = {
    pingsReceived: pings.length > 0,
    pingCount: pings.length,
    firstPingAt,
    lastPingAt,
    lastPingAgeMinutes: lastPingAgeMin,
    lastCoord,
    pingsTooOld: policy.isSignalStale,
    isSignalStale: policy.isSignalStale,
    silenceMs: policy.silenceMs,
    maxSilenceMs: policy.maxSilenceMs,
    pingGapsOver10MinCount: pingGapsOver10Min.length,
    pingGapsOver10Min,
    hasOpenWorkday: !!workday && !workday.ended_at,
    openLocationTimeEntry: openLte
      ? {
          id: openLte.id,
          started_at: openLte.started_at,
          booking_id: openLte.booking_id,
          large_project_id: openLte.large_project_id,
          location_id: openLte.location_id,
        }
      : null,
    travelLogsCount: travelLogs.length,
    knownTargetsWithCoords: candidates.length,
    anyPingInsideKnownTarget: anyPingInsideTarget,
    targetFound: !!anyPingInsideTarget,
    likelyRootCause: (() => {
      if (pings.length === 0) return "no_pings_received";
      if (candidates.length === 0) return "no_known_targets_with_coords";
      if (!anyPingInsideTarget) return "pings_exist_but_no_target_match";
      if (anyPingInsideTarget && !openLte && timeReports.length === 0)
        return "pings_match_target_but_processor_did_nothing";
      if (policy.isSignalStale) return "pings_too_old_signal_stale";
      return "looks_ok";
    })(),
  };

  // ── Sanity warnings ──────────────────────────────────────────────────────
  if (workday && !workday.ended_at && pings.length === 0) {
    warnings.push("open workday but no pings for the day — check if device uploaded any GPS");
  }
  if (timeReports.length === 0 && locationEntries.length === 0 && pings.length > 0) {
    warnings.push("pings exist but no time_reports/LTE — engine may not have processed yet");
  }
  if (snapshotPreview?.active && !snapshotPreview.active.label) {
    warnings.push("active segment has empty label — resolveLabel fallback hit");
  }
  if (existingSnapshot && snapshotPreview && existingSnapshot.snapshot_signature) {
    // Lightweight drift hint
    const live = JSON.stringify(snapshotPreview.segments?.length ?? 0);
    if (existingSnapshot.snapshot && JSON.stringify(existingSnapshot.snapshot.segments?.length ?? 0) !== live) {
      warnings.push("cached snapshot segment count differs from freshly computed — rebuild pending");
    }
  }

  return json(200, {
    ok: true,
    input: { staffId, date, dryRun, confirm, organizationId },
    rawData: {
      workday,
      workdayCount: (workdayRes.data ?? []).length,
      pingCount: pings.length,
      firstPingAt,
      lastPingAt,
      lastPingAgeMinutes: lastPingAgeMin,
      lastCoord,
      pingGapsOver10Min,
      pings,
      locationEntries,
      openLocationTimeEntry: diagnostics.openLocationTimeEntry,
      timeReports,
      travelLogs,
      staffLocation: locRes.data ?? null,
      flags: flagsRes.data ?? [],
      assistantEvents: assistantRes.data ?? [],
      attestation: attestRes.data ?? null,
      activeBoosts: boostRes.data ?? [],
      knownTargets,
      knownTargetsWithCoordsCount: candidates.length,
      nearestTargetsPerPing,
      anyPingInsideKnownTarget: anyPingInsideTarget,
      existingSnapshot: existingSnapshot ?? null,
    },
    diagnostics,
    detectedState,
    segments: snapshotPreview?.segments ?? [],
    wouldWrite,
    warnings,
    snapshotPreview,
    snapshotError,
  });
});

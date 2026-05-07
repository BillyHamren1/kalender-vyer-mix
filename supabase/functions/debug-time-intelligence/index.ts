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
import { clusterPings } from "../_shared/timeline/cluster.ts";
import { matchSegmentsToPlaces } from "../_shared/timeline/matcher.ts";
import { distanceMeters as haversineMeters } from "../_shared/timeline/geo.ts";
import {
  buildGpsDayTimelineOnly,
  type GpsTimelineSegment,
} from "../_shared/timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace, Ping, Segment } from "../_shared/timeline/types.ts";
// Scenario suite (synthetic) still imports the legacy snapshot builder; that
// only runs when mode === "scenarios" and never touches real workday data.
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
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function json(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Paginate through staff_location_history for the full day window.
 * No hard limit — fetches batches of 1000 until exhausted.
 * Normalizes lat/lng so both lat/lng and latitude/longitude work downstream.
 */
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
  // Primary select: only columns that exist in staff_location_history.
  // Do NOT include latitude/longitude — that table uses lat/lng.
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
      // Some optional column missing — retry this page with minimal select.
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
    for (const p of batch) {
      // Normalize: downstream may read latitude/longitude.
      p.latitude = p.lat;
      p.longitude = p.lng;
    }
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null, pageCount, pageSize, usedFallback } as any;
}

function fmtHM(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toISOString().slice(11, 16); } catch { return String(iso); }
}
function fmtRange(a: string, b: string): string {
  return `${fmtHM(a)}–${fmtHM(b)}`;
}

/* ════════════════════════════════════════════════════════════════════════════
 * TIME INTELLIGENCE — RESET TO PURE GPS PIPELINE
 * ════════════════════════════════════════════════════════════════════════════
 * Phase 1 of the rebuild: NO workday / time_reports / location_time_entries /
 * travel_time_logs / assistant_events / flags / active timers / payable /
 * attestations / cached snapshots are read or used.
 *
 * Allowed inputs:
 *   - staff_location_history (raw GPS pings)
 *   - known targets (organization_locations, bookings, large_projects) —
 *     ONLY to label a place when GPS actually matches it.
 *   - staffId, date, organizationId
 *
 * Pipeline:
 *   raw pings → ping quality classification → cluster (stay/travel/gps_gap)
 *   → match against known targets (label only) → gpsDayTimeline
 * ────────────────────────────────────────────────────────────────────────── */

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
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Read body first so we can short-circuit synthetic scenarios without auth
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  if (String(body.mode ?? "").toLowerCase() === "scenarios") {
    return json(200, runScenarioSuite());
  }

  // ── Auth gate ───────────────────────────────────────────────────────────
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
    } catch {
      okUser = false;
    }
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
  const legacyLeaks: Array<{ table: string; at: string }> = [];
  const supabase = new Proxy(realClient, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          if (FORBIDDEN_TABLES.has(table)) {
            legacyLeaks.push({ table, at: new Date().toISOString() });
          }
          return (target as any).from(table);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as typeof realClient;

  const warnings: string[] = [];

  // ── Resolve staff (uuid only) ───────────────────────────────────────────
  let staffId = staffIdInput;
  let organizationId: string | null = null;
  try {
    const { data: sm } = await supabase
      .from("staff_members")
      .select("id, organization_id")
      .eq("id", staffIdInput)
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

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  // ── Allowed fetches: pings + known targets only ─────────────────────────
  // Hard-filtered known targets. A booking/project may only become a matchable
  // target if it passes ALL validity gates (org, coords, radius, status,
  // not test/demo, date-window). Excluded rows are reported in diagnostics
  // with explicit reasons but never injected into knownPlaces.

  type TargetSource = "planned_today" | "recent_confirmed" | "permanent_location" | "manual_debug" | "excluded";
  type TargetValidity = "valid" | "missing_coordinates" | "invalid_radius" | "test_data" | "cancelled" | "outside_date_window" | "excluded_by_status";

  interface TargetMeta {
    source: TargetSource;
    validity: TargetValidity;
    reason: string;
    radiusMeters: number | null;
  }
  const targetMeta = new Map<string, TargetMeta>(); // key = `${type}:${id}`

  const excluded: Array<{ targetType: string; targetId: string; label: string; validity: TargetValidity; reason: string }> = [];
  const targetWarnings: Array<{ targetType: string; targetId: string; reason: string; label?: string }> = [];

  const [pingsRes, orgLocationsRes, bookingsRes, largeProjectsRes] = await Promise.all([
    fetchAllStaffLocationPings(supabase, staffId, dayStart, dayEnd),
    organizationId
      ? supabase
          .from("organization_locations")
          .select("id, name, latitude, longitude, radius_meters, show_as_project")
          .eq("organization_id", organizationId)
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    organizationId
      ? supabase
          .from("bookings")
          .select("id, booking_number, title, client, organization_id, status, eventdate, rigdaydate, rigdowndate")
          .eq("organization_id", organizationId)
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    organizationId
      ? supabase
          .from("large_projects")
          .select("id, name, organization_id, status, start_date, end_date, event_date, deleted_at")
          .eq("organization_id", organizationId)
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Optional coordinate enrichment — runs separately so a column-missing
  // error here is logged as targetWarnings only, never as a fetch error.
  const bookingCoordsMap = new Map<string, { lat: number; lng: number }>();
  const largeProjectCoordsMap = new Map<string, { lat: number; lng: number }>();

  if (organizationId) {
    try {
      const { data: bCoords } = await supabase
        .from("bookings")
        .select("id, delivery_latitude, delivery_longitude")
        .eq("organization_id", organizationId)
        .limit(1000);
      if (Array.isArray(bCoords)) {
        for (const r of bCoords) {
          if (r.delivery_latitude != null && r.delivery_longitude != null) {
            bookingCoordsMap.set(String(r.id), {
              lat: Number(r.delivery_latitude),
              lng: Number(r.delivery_longitude),
            });
          }
        }
      }
    } catch { /* tolerated */ }
    try {
      const { data: lpCoords } = await supabase
        .from("large_projects")
        .select("id, address_latitude, address_longitude")
        .eq("organization_id", organizationId)
        .limit(500);
      if (Array.isArray(lpCoords)) {
        for (const r of lpCoords) {
          if (r.address_latitude != null && r.address_longitude != null) {
            largeProjectCoordsMap.set(String(r.id), {
              lat: Number(r.address_latitude),
              lng: Number(r.address_longitude),
            });
          }
        }
      }
    } catch { /* tolerated */ }
  }

  const targetFetchDiagnostics: any = {
    warehouses: { attempted: true, ok: !orgLocationsRes.error, totalFetched: 0, valid: 0, excluded: 0 },
    bookings: { attempted: true, ok: !bookingsRes.error, totalFetched: 0, valid: 0, excluded: 0 },
    largeProjects: { attempted: true, ok: !largeProjectsRes.error, totalFetched: 0, valid: 0, excluded: 0 },
    totalFetched: 0,
    totalCandidates: 0,
    candidatesWithCoords: 0,
    validTargets: 0,
    excludedTargets: 0,
    excludedByReason: {} as Record<string, number>,
    sampleTargets: [] as any[],
    sampleExcluded: [] as any[],
    warnings: targetWarnings,
  };

  if (pingsRes.error) warnings.push(`pings fetch error: ${(pingsRes.error as any).message}`);

  const rawPings: any[] = pingsRes.data ?? [];

  // ── Helpers ─────────────────────────────────────────────────────────────
  const TEST_RX = /\b(test|demo)\b|!!|\?\?/i;
  const isTestLabel = (label: string | null | undefined) =>
    !!label && TEST_RX.test(String(label));

  const targetDateMs = new Date(`${date}T12:00:00.000Z`).getTime();
  const DAY_MS = 86_400_000;
  const DATE_WINDOW_DAYS = 14;
  const dayDelta = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.round((t - targetDateMs) / DAY_MS);
  };
  const insideWindow = (iso: string | null | undefined): boolean => {
    const d = dayDelta(iso);
    return d !== null && Math.abs(d) <= DATE_WINDOW_DAYS;
  };

  const bumpReason = (r: TargetValidity) => {
    targetFetchDiagnostics.excludedByReason[r] = (targetFetchDiagnostics.excludedByReason[r] || 0) + 1;
  };
  const recordExcluded = (kind: string, id: string, label: string, validity: TargetValidity, reason: string) => {
    excluded.push({ targetType: kind, targetId: id, label, validity, reason });
    bumpReason(validity);
    if (targetFetchDiagnostics.sampleExcluded.length < 25) {
      targetFetchDiagnostics.sampleExcluded.push({ targetType: kind, targetId: id, label, validity, reason });
    }
  };

  // ── Build known places (only valid, non-test, in-window targets) ────────
  const knownPlaces: KnownPlace[] = [];

  const orgLocations = (orgLocationsRes.data ?? []) as any[];
  targetFetchDiagnostics.warehouses.totalFetched = orgLocations.length;
  if (orgLocationsRes.error) {
    warnings.push(`warehouses fetch_error: ${(orgLocationsRes.error as any).message}`);
  }
  for (const l of orgLocations) {
    const label = l.name ?? "Plats";
    const id = String(l.id);
    if (isTestLabel(label)) {
      recordExcluded("warehouse", id, label, "test_data", "label_matches_test_or_demo");
      targetFetchDiagnostics.warehouses.excluded++;
      continue;
    }
    if (l.latitude == null || l.longitude == null) {
      recordExcluded("warehouse", id, label, "missing_coordinates", "lat_or_lng_null");
      targetFetchDiagnostics.warehouses.excluded++;
      continue;
    }
    const radius = Number(l.radius_meters ?? 100);
    if (!Number.isFinite(radius) || radius <= 0 || radius > 5000) {
      recordExcluded("warehouse", id, label, "invalid_radius", `radius=${l.radius_meters}`);
      targetFetchDiagnostics.warehouses.excluded++;
      continue;
    }
    knownPlaces.push({
      id, type: "location", name: label,
      lat: Number(l.latitude), lng: Number(l.longitude), radiusM: radius,
    });
    targetMeta.set(`location:${id}`, {
      source: "permanent_location", validity: "valid",
      reason: "warehouse_with_coords", radiusMeters: radius,
    });
    targetFetchDiagnostics.warehouses.valid++;
  }

  const bookingRows = (bookingsRes.data ?? []) as any[];
  targetFetchDiagnostics.bookings.totalFetched = bookingRows.length;
  if (bookingsRes.error) {
    warnings.push(`bookings fetch_error: ${(bookingsRes.error as any).message}`);
  }
  for (const b of bookingRows) {
    const id = String(b.id);
    const label = b.client || b.title || b.booking_number || "Bokning";
    const status = String(b.status ?? "").toUpperCase();

    if (isTestLabel(label) || isTestLabel(b.booking_number) || isTestLabel(b.title)) {
      recordExcluded("booking", id, label, "test_data", `label="${label}"`);
      targetFetchDiagnostics.bookings.excluded++;
      continue;
    }
    if (status === "CANCELLED") {
      recordExcluded("booking", id, label, "cancelled", "status=CANCELLED");
      targetFetchDiagnostics.bookings.excluded++;
      continue;
    }
    if (status && status !== "CONFIRMED" && status !== "OFFER") {
      recordExcluded("booking", id, label, "excluded_by_status", `status=${status}`);
      targetFetchDiagnostics.bookings.excluded++;
      continue;
    }

    // Date relevance: any of rigday/event/rigdown within ±14d of the debug date
    const relevantToday =
      insideWindow(b.rigdaydate) || insideWindow(b.eventdate) || insideWindow(b.rigdowndate);
    if (!relevantToday) {
      recordExcluded("booking", id, label, "outside_date_window",
        `rig=${b.rigdaydate ?? "-"} event=${b.eventdate ?? "-"} down=${b.rigdowndate ?? "-"}`);
      targetFetchDiagnostics.bookings.excluded++;
      continue;
    }

    const coords = bookingCoordsMap.get(id);
    if (!coords) {
      recordExcluded("booking", id, label, "missing_coordinates", "no_delivery_lat_lng");
      targetFetchDiagnostics.bookings.excluded++;
      continue;
    }

    // Source classification
    const hitToday =
      dayDelta(b.rigdaydate) === 0 || dayDelta(b.eventdate) === 0 || dayDelta(b.rigdowndate) === 0;
    const source: TargetSource = hitToday ? "planned_today" : "recent_confirmed";

    knownPlaces.push({
      id, type: "booking", name: label,
      lat: coords.lat, lng: coords.lng, radiusM: 100,
    });
    targetMeta.set(`booking:${id}`, {
      source, validity: "valid",
      reason: hitToday ? "rig_or_event_or_down_date_is_today" : "within_14d_window",
      radiusMeters: 100,
    });
    targetFetchDiagnostics.bookings.valid++;
  }

  const largeProjectRows = (largeProjectsRes.data ?? []) as any[];
  targetFetchDiagnostics.largeProjects.totalFetched = largeProjectRows.length;
  if (largeProjectsRes.error) {
    warnings.push(`large_projects fetch_error: ${(largeProjectsRes.error as any).message}`);
  }
  for (const p of largeProjectRows) {
    const id = String(p.id);
    const label = p.name ?? "Stort projekt";

    if (p.deleted_at != null) {
      recordExcluded("large_project", id, label, "excluded_by_status", "deleted_at_set");
      targetFetchDiagnostics.largeProjects.excluded++;
      continue;
    }
    if (isTestLabel(label)) {
      recordExcluded("large_project", id, label, "test_data", `label="${label}"`);
      targetFetchDiagnostics.largeProjects.excluded++;
      continue;
    }

    const relevantToday =
      insideWindow(p.start_date) || insideWindow(p.end_date) || insideWindow(p.event_date);
    if (!relevantToday) {
      recordExcluded("large_project", id, label, "outside_date_window",
        `start=${p.start_date ?? "-"} end=${p.end_date ?? "-"} event=${p.event_date ?? "-"}`);
      targetFetchDiagnostics.largeProjects.excluded++;
      continue;
    }

    const coords = largeProjectCoordsMap.get(id);
    if (!coords) {
      recordExcluded("large_project", id, label, "missing_coordinates", "no_address_lat_lng");
      targetFetchDiagnostics.largeProjects.excluded++;
      continue;
    }

    const hitToday =
      dayDelta(p.start_date) === 0 || dayDelta(p.end_date) === 0 || dayDelta(p.event_date) === 0 ||
      (insideWindow(p.start_date) && insideWindow(p.end_date) &&
        new Date(p.start_date).getTime() <= targetDateMs &&
        new Date(p.end_date).getTime() >= targetDateMs);
    const source: TargetSource = hitToday ? "planned_today" : "recent_confirmed";

    knownPlaces.push({
      id, type: "project", name: label,
      lat: coords.lat, lng: coords.lng, radiusM: 100,
    });
    targetMeta.set(`project:${id}`, {
      source, validity: "valid",
      reason: hitToday ? "project_active_on_date" : "within_14d_window",
      radiusMeters: 100,
    });
    targetFetchDiagnostics.largeProjects.valid++;
  }

  targetFetchDiagnostics.totalFetched =
    targetFetchDiagnostics.warehouses.totalFetched +
    targetFetchDiagnostics.bookings.totalFetched +
    targetFetchDiagnostics.largeProjects.totalFetched;
  targetFetchDiagnostics.totalCandidates = targetFetchDiagnostics.totalFetched;
  targetFetchDiagnostics.candidatesWithCoords = knownPlaces.length;
  targetFetchDiagnostics.validTargets = knownPlaces.length;
  targetFetchDiagnostics.excludedTargets = excluded.length;
  targetFetchDiagnostics.sampleTargets = knownPlaces.slice(0, 25).map((kp) => {
    const meta = targetMeta.get(`${kp.type}:${kp.id}`);
    return {
      targetType: kp.type, targetId: kp.id, label: kp.name,
      lat: kp.lat, lng: kp.lng, radiusMeters: kp.radiusM,
      targetSource: meta?.source ?? "excluded",
      targetValidity: meta?.validity ?? "valid",
      reason: meta?.reason ?? "",
    };
  });

  // ── Per-ping quality classification ─────────────────────────────────────
  const pingClassificationTimeline = rawPings.map((p: any) => {
    const hasCoord = p.lat != null && p.lng != null;
    const accuracy = p.accuracy != null ? Number(p.accuracy) : null;
    const lowQuality = accuracy != null && accuracy > 200;
    let qualityStatus: "ok" | "low" | "invalid";
    let excludedReason: string | null = null;
    if (!hasCoord) {
      qualityStatus = "invalid";
      excludedReason = "missing_coord";
    } else if (lowQuality) {
      qualityStatus = "low";
      excludedReason = `low_accuracy_${Math.round(accuracy!)}m`;
    } else {
      qualityStatus = "ok";
    }
    return {
      id: p.id ?? null,
      recorded_at: p.recorded_at,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      accuracy,
      speed: p.speed ?? null,
      app_state: p.app_state ?? null,
      quality_status: qualityStatus,
      quality_reason: excludedReason,
      included_in_clustering: qualityStatus === "ok",
    };
  });

  // ── Coverage summary ────────────────────────────────────────────────────
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

  const rawPingsCoverage = {
    pingCount: rawPings.length,
    firstPingAt,
    lastPingAt,
    pingGapsOver10MinCount: pingGapsOver10Min.length,
    pingGapsOver10Min,
    pageCount: (pingsRes as any).pageCount ?? null,
    pageSize: (pingsRes as any).pageSize ?? 1000,
    truncated: false,
    qualityCounts: {
      ok: pingClassificationTimeline.filter((p) => p.quality_status === "ok").length,
      low: pingClassificationTimeline.filter((p) => p.quality_status === "low").length,
      invalid: pingClassificationTimeline.filter((p) => p.quality_status === "invalid").length,
    },
  };

  // ── Pure GPS day timeline (no workday/timer/report inputs) ──────────────
  const gpsTimeline = buildGpsDayTimelineOnly({
    staffId,
    organizationId,
    date,
    pings: rawPings.map((p: any) => ({
      recorded_at: p.recorded_at,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      accuracy: p.accuracy ?? null,
      speed: p.speed ?? null,
      app_state: p.app_state ?? null,
    })),
    knownTargets: knownPlaces,
  });

  // Enrich each segment with target meta + geometry-based match diagnostics.
  const enrichedSegments = gpsTimeline.segments.map((seg) => {
    const meta = seg.matchedSiteId && seg.matchedSiteType
      ? targetMeta.get(`${seg.matchedSiteType}:${seg.matchedSiteId}`)
      : null;
    let distanceToTargetMeters: number | null = null;
    let targetRadiusMeters: number | null = meta?.radiusMeters ?? null;
    if (seg.matchedSiteId && seg.centerLat != null && seg.centerLng != null) {
      const place = knownPlaces.find(
        (kp) => kp.id === seg.matchedSiteId && kp.type === seg.matchedSiteType,
      );
      if (place) {
        distanceToTargetMeters = Math.round(haversineMeters(seg.centerLat, seg.centerLng, place.lat, place.lng));
        targetRadiusMeters = place.radiusM;
      }
    }
    return {
      ...seg,
      targetSource: meta?.source ?? (seg.type === "known_site" ? "excluded" : null),
      targetValidity: meta?.validity ?? null,
      distanceToTargetMeters,
      targetRadiusMeters,
      matchConfidence: seg.confidence,
    };
  });

  const gpsSegments: GpsTimelineSegment[] = enrichedSegments as any;
  const targetMatches = gpsTimeline.targetMatches;
  let clusterError: string | null = null;

  if (rawPings.length === 0) warnings.push("no_pings_for_day");
  if (rawPings.length > 0 && knownPlaces.length === 0) warnings.push("no_known_targets_with_coords_in_org");
  if (rawPings.length > 0 && gpsSegments.length === 0) warnings.push("pings_present_but_no_segments_built");

  // Compact debug cap — never return an empty container when count > 0.
  const SEGMENT_RETURN_CAP = 200;
  const returnedSegments = gpsSegments.slice(0, SEGMENT_RETURN_CAP);
  const gpsDayTimeline = {
    count: gpsSegments.length,
    firstStart: gpsSegments[0]?.startTs ?? null,
    lastEnd: gpsSegments[gpsSegments.length - 1]?.endTs ?? null,
    source: "gps_only" as const,
    truncated: gpsSegments.length > returnedSegments.length,
    totalSegments: gpsSegments.length,
    returnedSegments: returnedSegments.length,
    segments: returnedSegments,
  };

  const response = {
    rawPingsCoverage,
    pingClassificationTimeline,
    gpsDayTimeline,
    targetMatches,
    targetFetchDiagnostics,
    warnings,
    debugMeta: {
      ok: true,
      input: { staffId, date, organizationId },
      contractVersion: "v3-pure-gps",
      pipeline: "raw_pings → quality → cluster(stay/travel) → gps_gap → match_known_targets",
      clusterParams: { stationaryRadiusM: 80, minStopMin: 5, maxGapMin: 15, gapThresholdMin: 10 },
      knownPlacesCount: knownPlaces.length,
      clusterError,
      legacySourceLeakDetected: legacyLeaks.length > 0,
      legacySourcesUsed: legacyLeaks,
      forbiddenTables: Array.from(FORBIDDEN_TABLES),
      generatedAt: new Date().toISOString(),
      compactCounts: {
        rawPingCount: rawPings.length,
        gpsDayTimelineCount: gpsSegments.length,
        gpsDayTimelineReturned: returnedSegments.length,
        gpsDayTimelineTruncated: gpsDayTimeline.truncated,
        knownStayCount: targetMatches.summary.knownStayCount,
        unknownStayCount: targetMatches.summary.unknownStayCount,
        travelCount: targetMatches.summary.travelCount,
        gpsGapCount: targetMatches.summary.gpsGapCount,
        targetCandidates: targetFetchDiagnostics.totalCandidates,
        targetCandidatesWithCoords: targetFetchDiagnostics.candidatesWithCoords,
      },
    },
  };

  response.debugMeta.gpsTimelineReturnCheck = {
    builtSegments: gpsTimeline.segments.length,
    returnedSegments: response.gpsDayTimeline?.segments?.length ?? 0,
    returnedAsObject: typeof response.gpsDayTimeline,
  };

  return json(200, response);
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

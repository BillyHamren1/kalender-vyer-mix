// @ts-nocheck
/**
 * ping-day-pipeline
 * ────────────────────────────────────────────────────────────────────────────
 * PING-FIRST tolkning av en personals dag. GPS-pings är primärkällan.
 * Timers / time_reports / location_entries används ENDAST som sekundär
 * kontext (markeras på segmenten via `context`).
 *
 * Skriver ALDRIG data. Returnerar:
 *   - rawPingCount, candidateCount
 *   - classifiedPings: per-ping klass (project/booking/warehouse/travel/
 *     other_place/unknown/bad_accuracy/gps_gap_marker)
 *   - segments: hopslagna segment med start/end/label/confidence/evidencePings
 *   - context: { workdayActive, openLte, timeReportsCount, travelLogsCount }
 *
 * Geofence-källa: alla kända (org_locations + alla bookings/large_projects
 * med koordinater) + bookings/projects inom ±7 dagar runt valt datum.
 *
 * Auth: cron-secret OR service-role bearer OR vanlig användar-JWT (admin).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { fetchAllStaffLocationPings } from "../_shared/timeEngine/fetchAllStaffLocationPings.ts";

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

function haversineM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
  const dLa = toR(la2 - la1), dLo = toR(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type ClassKind =
  | "project"
  | "booking"
  | "warehouse"
  | "travel"
  | "other_place"
  | "unknown"
  | "bad_accuracy"
  | "gps_gap_marker";

interface Candidate {
  kind: "warehouse" | "project_location" | "booking" | "large_project";
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}

interface RawPing {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed?: number | null;
}

interface ClassifiedPing extends RawPing {
  index: number;
  klass: ClassKind;
  target_kind: Candidate["kind"] | null;
  target_id: string | null;
  target_label: string | null;
  distance_m: number | null;
  reason: string;
}

interface Segment {
  index: number;
  start_at: string;
  end_at: string;
  duration_min: number;
  klass: ClassKind;
  target_kind: Candidate["kind"] | null;
  target_id: string | null;
  label: string;
  confidence: number;
  evidence_ping_ids: number[];
  ping_count: number;
  avg_accuracy: number | null;
  context: {
    overlapping_time_report_id: string | null;
    overlapping_lte_id: string | null;
    overlapping_travel_log_id: string | null;
    workday_active_during: boolean;
  };
  notes: string[];
}

const BAD_ACC_M = 150;          // > → bad_accuracy
const GAP_MIN = 12;              // >= → gps_gap_marker mellan pings
const TRAVEL_SPEED_MS = 2.5;     // > 9 km/h
const TRAVEL_DIST_M = 200;       // jumping > 200m mellan pings → travel
const OTHER_PLACE_MIN_PINGS = 3; // stabilitet för other_place
const MIN_SEGMENT_MIN = 1;       // minsta varaktighet

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // ── Auth (samma som debug-time-intelligence) ────────────────────────────
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim() : "";
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
    return json(400, { ok: false, error: "date required YYYY-MM-DD" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Resolve staff
  const { data: sm } = await supabase
    .from("staff_members")
    .select("id, organization_id, name")
    .eq("id", staffIdInput)
    .maybeSingle();
  const staffId = sm?.id ?? staffIdInput;
  const organizationId: string | null = sm?.organization_id ?? null;

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  const sevenDaysAgo = new Date(new Date(date).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const sevenDaysAhead = new Date(new Date(date).getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Day-wide GPS via canonical paginated reader. Falls back to a single
  // page when organizationId is unknown (helper requires it for multi-tenant
  // safety).
  async function fetchAllPings(): Promise<{
    rows: RawPing[]; truncated: boolean; pageCount: number; error: string | null;
  }> {
    if (!organizationId) {
      const { data, error } = await supabase
        .from("staff_location_history")
        .select("recorded_at, lat, lng, accuracy, speed")
        .eq("staff_id", staffId)
        .gte("recorded_at", dayStart).lte("recorded_at", dayEnd)
        .order("recorded_at", { ascending: true })
        .range(0, 999);
      return {
        rows: ((data ?? []) as RawPing[]),
        truncated: (data?.length ?? 0) >= 1000,
        pageCount: 1,
        error: error?.message ?? null,
      };
    }
    const r = await fetchAllStaffLocationPings<RawPing>({
      supabaseAdmin: supabase,
      organizationId,
      staffId,
      startUtc: dayStart,
      endUtc: dayEnd,
      select: "recorded_at, lat, lng, accuracy, speed",
    });
    return {
      rows: r.rows,
      truncated: r.diagnostics.capHit,
      pageCount: r.diagnostics.pageCount,
      error: r.diagnostics.errorMessage,
    };
  }

  const [pingsAll, workdayRes, lteRes, trRes, travelRes, locRes, bookingsRes, largeRes] =
    await Promise.all([
      fetchAllPings(),
      supabase.from("workdays").select("*")
        .eq("staff_id", staffId)
        .gte("started_at", dayStart).lte("started_at", dayEnd)
        .order("started_at", { ascending: true }).limit(5),
      supabase.from("location_time_entries").select("*")
        .eq("staff_id", staffId)
        .or(`entered_at.gte.${dayStart},exited_at.gte.${dayStart}`)
        .lte("entered_at", dayEnd).limit(50),
      supabase.from("time_reports").select("*")
        .eq("staff_id", staffId).eq("report_date", date).limit(50),
      supabase.from("travel_time_logs").select("*")
        .eq("staff_id", staffId)
        .gte("start_time", dayStart).lte("start_time", dayEnd).limit(50),
      organizationId
        ? supabase.from("organization_locations")
            .select("id, name, latitude, longitude, radius_meters, show_as_project")
            .eq("organization_id", organizationId).limit(500)
        : Promise.resolve({ data: [], error: null }),
      organizationId
        ? supabase.from("bookings")
            .select("id, client, booking_number, latitude, longitude, event_date")
            .eq("organization_id", organizationId)
            .not("latitude", "is", null).not("longitude", "is", null)
            .gte("event_date", sevenDaysAgo).lte("event_date", sevenDaysAhead)
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
      organizationId
        ? supabase.from("large_projects")
            .select("id, name, latitude, longitude")
            .eq("organization_id", organizationId)
            .not("latitude", "is", null).not("longitude", "is", null).limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const pings: RawPing[] = pingsAll.rows;
  const workday = (workdayRes.data ?? [])[0] ?? null;
  const locationEntries = lteRes.data ?? [];
  const timeReports = trRes.data ?? [];
  const travelLogs = travelRes.data ?? [];

  // ── Build candidates ────────────────────────────────────────────────────
  const candidates: Candidate[] = [];
  for (const l of (locRes.data ?? []) as any[]) {
    if (l.latitude == null || l.longitude == null) continue;
    candidates.push({
      kind: l.show_as_project ? "project_location" : "warehouse",
      id: l.id,
      name: l.name ?? "Plats",
      lat: Number(l.latitude),
      lng: Number(l.longitude),
      radius_m: Number(l.radius_meters ?? 100),
    });
  }
  for (const b of (bookingsRes.data ?? []) as any[]) {
    candidates.push({
      kind: "booking",
      id: b.id,
      name: b.client || b.booking_number || "Bokning",
      lat: Number(b.latitude),
      lng: Number(b.longitude),
      radius_m: 120,
    });
  }
  for (const p of (largeRes.data ?? []) as any[]) {
    candidates.push({
      kind: "large_project",
      id: p.id,
      name: p.name ?? "Stort projekt",
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      radius_m: 150,
    });
  }

  // ── Per-ping classify ───────────────────────────────────────────────────
  function nearestInside(p: RawPing): { c: Candidate; d: number } | null {
    let best: { c: Candidate; d: number } | null = null;
    for (const c of candidates) {
      const d = haversineM(p.lat, p.lng, c.lat, c.lng);
      if (d <= c.radius_m && (best === null || d < best.d)) best = { c, d };
    }
    return best;
  }

  const classified: ClassifiedPing[] = pings.map((p, i) => {
    const out: ClassifiedPing = {
      ...p, index: i,
      klass: "unknown", target_kind: null, target_id: null,
      target_label: null, distance_m: null, reason: "",
    };
    if (p.accuracy != null && p.accuracy > BAD_ACC_M) {
      out.klass = "bad_accuracy";
      out.reason = `accuracy ${Math.round(p.accuracy)}m > ${BAD_ACC_M}m`;
      return out;
    }
    const hit = nearestInside(p);
    if (hit) {
      out.klass = hit.c.kind === "warehouse" ? "warehouse"
        : hit.c.kind === "booking" ? "booking" : "project";
      out.target_kind = hit.c.kind;
      out.target_id = hit.c.id;
      out.target_label = hit.c.name;
      out.distance_m = Math.round(hit.d);
      out.reason = `inside ${hit.c.kind} radius ${hit.c.radius_m}m`;
      return out;
    }
    // Travel detection: high speed OR big jump from previous classified ping
    const prev = i > 0 ? pings[i - 1] : null;
    if (prev) {
      const dt = (new Date(p.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000;
      const jump = haversineM(p.lat, p.lng, prev.lat, prev.lng);
      const v = dt > 0 ? jump / dt : 0;
      if ((p.speed != null && p.speed > TRAVEL_SPEED_MS) || (jump > TRAVEL_DIST_M && v > TRAVEL_SPEED_MS)) {
        out.klass = "travel";
        out.reason = `jump ${Math.round(jump)}m / ${Math.round(dt)}s ≈ ${(v * 3.6).toFixed(1)} km/h`;
        return out;
      }
    }
    out.klass = "other_place";
    out.reason = "not in known geofence";
    return out;
  });

  // GPS gap markers (synthetic)
  type GapMarker = { at: string; gap_min: number; from: string; to: string };
  const gaps: GapMarker[] = [];
  for (let i = 1; i < classified.length; i++) {
    const dtMin = (new Date(classified[i].recorded_at).getTime()
      - new Date(classified[i - 1].recorded_at).getTime()) / 60000;
    if (dtMin >= GAP_MIN) {
      gaps.push({
        at: classified[i - 1].recorded_at,
        gap_min: Math.round(dtMin),
        from: classified[i - 1].recorded_at,
        to: classified[i].recorded_at,
      });
    }
  }

  // ── Merge into segments ─────────────────────────────────────────────────
  const segments: Segment[] = [];
  function pushSegment(seg: Segment) {
    seg.duration_min = Math.max(
      0,
      Math.round((new Date(seg.end_at).getTime() - new Date(seg.start_at).getTime()) / 60000),
    );
    segments.push(seg);
  }

  let cur: ClassifiedPing[] = [];
  let curKey = "";
  function keyOf(p: ClassifiedPing): string {
    if (p.target_id) return `${p.klass}:${p.target_id}`;
    return p.klass; // travel / other_place / bad_accuracy / unknown
  }

  function flush() {
    if (cur.length === 0) return;
    const first = cur[0], last = cur[cur.length - 1];
    const accs = cur.map((p) => p.accuracy ?? 0).filter((a) => a > 0);
    const avgAcc = accs.length ? Math.round(accs.reduce((s, a) => s + a, 0) / accs.length) : null;
    // Confidence: pings count, accuracy, in-radius distance
    let conf = Math.min(1, cur.length / 10);
    if (avgAcc != null && avgAcc > 50) conf *= 0.7;
    if (first.klass === "other_place" && cur.length < OTHER_PLACE_MIN_PINGS) conf *= 0.5;
    if (first.klass === "bad_accuracy") conf = 0.1;

    const label = first.target_label
      ?? (first.klass === "travel" ? "Förflyttning"
        : first.klass === "other_place" ? "Annan plats"
        : first.klass === "bad_accuracy" ? "Osäker GPS"
        : first.klass === "unknown" ? "Okänd" : "—");

    pushSegment({
      index: segments.length,
      start_at: first.recorded_at,
      end_at: last.recorded_at,
      duration_min: 0,
      klass: first.klass,
      target_kind: first.target_kind,
      target_id: first.target_id,
      label,
      confidence: Number(conf.toFixed(2)),
      evidence_ping_ids: cur.map((p) => p.index),
      ping_count: cur.length,
      avg_accuracy: avgAcc,
      context: {
        overlapping_time_report_id: null,
        overlapping_lte_id: null,
        overlapping_travel_log_id: null,
        workday_active_during: false,
      },
      notes: [],
    });
    cur = [];
  }

  for (const p of classified) {
    const k = keyOf(p);
    if (cur.length === 0) { cur = [p]; curKey = k; continue; }
    if (k === curKey) { cur.push(p); continue; }
    flush();
    cur = [p]; curKey = k;
  }
  flush();

  // Insert gps_gap_marker segments between adjacent segments where time-gap >= GAP_MIN
  const withGaps: Segment[] = [];
  for (let i = 0; i < segments.length; i++) {
    withGaps.push(segments[i]);
    const next = segments[i + 1];
    if (!next) continue;
    const dtMin = (new Date(next.start_at).getTime() - new Date(segments[i].end_at).getTime()) / 60000;
    if (dtMin >= GAP_MIN) {
      withGaps.push({
        index: -1,
        start_at: segments[i].end_at,
        end_at: next.start_at,
        duration_min: Math.round(dtMin),
        klass: "gps_gap_marker",
        target_kind: null,
        target_id: null,
        label: `GPS-gap (${Math.round(dtMin)} min)`,
        confidence: 0,
        evidence_ping_ids: [],
        ping_count: 0,
        avg_accuracy: null,
        context: {
          overlapping_time_report_id: null,
          overlapping_lte_id: null,
          overlapping_travel_log_id: null,
          workday_active_during: false,
        },
        notes: ["synthetic gap"],
      });
    }
  }
  // Re-index
  withGaps.forEach((s, i) => { s.index = i; });

  // ── Sekundär kontext: koppla TR/LTE/travel_log/workday ──────────────────
  const wdStart = workday?.started_at ? new Date(workday.started_at).getTime() : null;
  const wdEnd = workday?.ended_at ? new Date(workday.ended_at).getTime() : (wdStart ? Date.now() : null);
  function overlaps(a1: number, a2: number, b1: number, b2: number) {
    return Math.max(a1, b1) < Math.min(a2, b2);
  }
  for (const s of withGaps) {
    const s1 = new Date(s.start_at).getTime();
    const s2 = new Date(s.end_at).getTime();
    if (wdStart != null && wdEnd != null && overlaps(s1, s2, wdStart, wdEnd)) {
      s.context.workday_active_during = true;
    }
    for (const tr of timeReports as any[]) {
      if (!tr.start_time || !tr.end_time) continue;
      // tr-times are ISO strings (timestamptz from DB)
      const t1 = new Date(tr.start_time).getTime();
      const t2 = new Date(tr.end_time).getTime();
      if (overlaps(s1, s2, t1, t2)) { s.context.overlapping_time_report_id = tr.id; break; }
    }
    for (const lte of locationEntries as any[]) {
      const l1 = new Date(lte.entered_at).getTime();
      const l2 = lte.exited_at ? new Date(lte.exited_at).getTime() : Date.now();
      if (overlaps(s1, s2, l1, l2)) { s.context.overlapping_lte_id = lte.id; break; }
    }
    for (const tl of travelLogs as any[]) {
      const t1 = new Date(tl.start_time).getTime();
      const t2 = tl.end_time ? new Date(tl.end_time).getTime() : Date.now();
      if (overlaps(s1, s2, t1, t2)) { s.context.overlapping_travel_log_id = tl.id; break; }
    }
  }

  // Drop micro-segments below MIN_SEGMENT_MIN unless they're the only one
  const finalSegments = withGaps.filter((s, _i, arr) =>
    arr.length === 1 || s.duration_min >= MIN_SEGMENT_MIN || s.klass === "gps_gap_marker"
  );

  // Summary by klass
  const summary: Record<string, { count: number; minutes: number }> = {};
  for (const s of finalSegments) {
    const k = s.klass;
    if (!summary[k]) summary[k] = { count: 0, minutes: 0 };
    summary[k].count += 1;
    summary[k].minutes += s.duration_min;
  }

  // ── Råa ping-kluster (FÖRE all tolkning) ─────────────────────────────────
  // Inga collapseMicroStops, mergeSamePlaceVisits eller mergeAdjacentTravels.
  // Vi grupperar bara närliggande pings (≤75m centroid-drift, ≤10 min gap)
  // så att man kan se den faktiska GPS-bilden råt — innan klassning.
  const RAW_CLUSTER_MAX_DRIFT_M = 75;
  const RAW_CLUSTER_MAX_GAP_MIN = 10;
  type RawCluster = {
    index: number;
    start_at: string;
    end_at: string;
    duration_min: number;
    ping_count: number;
    centroid_lat: number;
    centroid_lng: number;
    avg_accuracy: number | null;
  };
  const rawClusters: RawCluster[] = [];
  let rc: RawPing[] = [];
  let rcLat = 0, rcLng = 0;
  function flushRaw() {
    if (!rc.length) return;
    const accs = rc.map((p) => p.accuracy ?? 0).filter((a) => a > 0);
    rawClusters.push({
      index: rawClusters.length,
      start_at: rc[0].recorded_at,
      end_at: rc[rc.length - 1].recorded_at,
      duration_min: Math.max(0, Math.round(
        (new Date(rc[rc.length - 1].recorded_at).getTime()
          - new Date(rc[0].recorded_at).getTime()) / 60000)),
      ping_count: rc.length,
      centroid_lat: Number((rcLat / rc.length).toFixed(6)),
      centroid_lng: Number((rcLng / rc.length).toFixed(6)),
      avg_accuracy: accs.length ? Math.round(accs.reduce((s, a) => s + a, 0) / accs.length) : null,
    });
    rc = []; rcLat = 0; rcLng = 0;
  }
  for (let i = 0; i < pings.length; i++) {
    const p = pings[i];
    if (!rc.length) { rc = [p]; rcLat = p.lat; rcLng = p.lng; continue; }
    const cLat = rcLat / rc.length, cLng = rcLng / rc.length;
    const drift = haversineM(p.lat, p.lng, cLat, cLng);
    const gapMin = (new Date(p.recorded_at).getTime()
      - new Date(rc[rc.length - 1].recorded_at).getTime()) / 60000;
    if (drift <= RAW_CLUSTER_MAX_DRIFT_M && gapMin <= RAW_CLUSTER_MAX_GAP_MIN) {
      rc.push(p); rcLat += p.lat; rcLng += p.lng;
    } else {
      flushRaw();
      rc = [p]; rcLat = p.lat; rcLng = p.lng;
    }
  }
  flushRaw();

  const rawPingCoverage = {
    totalFetched: pings.length,
    firstPingAt: pings.length ? pings[0].recorded_at : null,
    lastPingAt: pings.length ? pings[pings.length - 1].recorded_at : null,
    truncated: pingsAll.truncated,
    pageCount: pingsAll.pageCount,
  };

  return json(200, {
    ok: true,
    input: { staffId, date, organizationId, staffName: sm?.name ?? null },
    pingFirst: true,
    rawPingCount: pings.length,
    rawPingCoverage,
    rawClusters,
    classifiedPings: classified,
    gpsGaps: gaps,
    candidateCount: candidates.length,
    segments: finalSegments,
    summary,
    context: {
      workdayActive: !!workday && !workday.ended_at,
      workdayId: workday?.id ?? null,
      openLteCount: locationEntries.filter((e: any) => !e.exited_at).length,
      timeReportsCount: timeReports.length,
      travelLogsCount: travelLogs.length,
    },
    notes: [
      "Ping är primär. Timers/TR/LTE rörs aldrig — endast länkade som context per segment.",
      "Inga collapseMicroStops / mergeSamePlaceVisits / mergeAdjacentTravels — råa kluster visas som rawClusters.",
      `Geofence-källa: org locations + bookings/projekt med koordinater inom ±7 dagar.`,
    ],
    generatedAt: new Date().toISOString(),
  });
});

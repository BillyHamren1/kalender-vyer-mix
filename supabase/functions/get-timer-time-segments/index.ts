// get-timer-time-segments
// ─────────────────────────────────────────────────────────────────────────────
// Slices the pure GPS-only timeline by an active (or recently closed) timer
// window so the segments become time-report / attest underlay.
//
// Flow this implements:
//   1. GPS auto-start (or user-start) creates a location_time_entries row.
//   2. While that row is open (exited_at IS NULL) — or for a closed row when
//      `timer_id` is supplied — every GPS segment that overlaps the window is
//      mapped to a TimeSegment:
//         known_site  → project | booking | warehouse
//         travel      → transport
//         unknown stay→ unknown_place
//         gps_gap     → gps_uncertain
//   3. When the timer is stopped, this same call returns the final cut.
//
// Auth: dual (mobile token or Supabase JWT) via _shared/staff-auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import { buildGpsDayTimelineOnly } from "../_shared/timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace } from "../_shared/timeline/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type TimeSegmentKind =
  | "project"
  | "booking"
  | "warehouse"
  | "transport"
  | "unknown_place"
  | "gps_uncertain";

interface TimeSegment {
  startTs: string;
  endTs: string;
  durationMin: number;
  kind: TimeSegmentKind;
  label: string;
  matchedSiteId: string | null;
  matchedSiteType: "project" | "booking" | "location" | null;
  confidence: number;
  reason: string;
  pingCount: number;
  distanceMeters: number;
  avgKmh: number | null;
  source: "gps_classifier";
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clipToWindow(
  segStart: string,
  segEnd: string,
  windowStart: string,
  windowEnd: string,
): { startTs: string; endTs: string; durationMin: number } | null {
  const s = Math.max(new Date(segStart).getTime(), new Date(windowStart).getTime());
  const e = Math.min(new Date(segEnd).getTime(), new Date(windowEnd).getTime());
  if (e <= s) return null;
  return {
    startTs: new Date(s).toISOString(),
    endTs: new Date(e).toISOString(),
    durationMin: Math.max(1, Math.round((e - s) / 60000)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authRes = await authenticateStaffRequest(req);
  if (!authRes.ok) return json(authRes.err.status, { error: authRes.err.error });
  const { auth } = authRes;

  let timerId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      timerId = body?.timerId ? String(body.timerId) : null;
    } catch { /* ignore */ }
  } else {
    const u = new URL(req.url);
    timerId = u.searchParams.get("timerId");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let staffId: string;
  let organizationId: string;
  if (auth.mode === "mobile") {
    staffId = auth.staffId;
    organizationId = auth.organizationId;
  } else {
    const { data: prof } = await admin.from("profiles")
      .select("staff_id, organization_id").eq("user_id", auth.userId).maybeSingle();
    if (!prof?.staff_id) return json(404, { error: "no staff link" });
    staffId = prof.staff_id;
    organizationId = prof.organization_id;
  }

  // Resolve timer row: explicit id, or latest open row for staff.
  let timerQ = admin.from("location_time_entries")
    .select("id, entered_at, exited_at, booking_id, large_project_id, location_id, source")
    .eq("staff_id", staffId);
  if (timerId) timerQ = timerQ.eq("id", timerId);
  else timerQ = timerQ.is("exited_at", null);
  const { data: rows } = await timerQ.order("entered_at", { ascending: false }).limit(1);
  const timer = rows?.[0] ?? null;
  if (!timer) {
    return json(200, {
      timerActive: false,
      timerId: null,
      startedAt: null,
      endedAt: null,
      segments: [] as TimeSegment[],
      summary: { totalMinutes: 0, byKind: {} },
    });
  }

  const startedAt: string = timer.entered_at;
  const endedAt: string = timer.exited_at ?? new Date().toISOString();
  const dateStr = startedAt.slice(0, 10);

  // Load pings overlapping window (extend a bit for edge clustering)
  const pad = 5 * 60_000;
  const fromTs = new Date(new Date(startedAt).getTime() - pad).toISOString();
  const toTs = new Date(new Date(endedAt).getTime() + pad).toISOString();

  const [pingsRes, locsRes, bookingsRes, projectsRes, projCoordsRes, bookingCoordsRes] = await Promise.all([
    admin.from("staff_location_history")
      .select("recorded_at, lat, lng, accuracy")
      .eq("staff_id", staffId)
      .gte("recorded_at", fromTs).lte("recorded_at", toTs)
      .order("recorded_at", { ascending: true }).limit(2000),
    admin.from("organization_locations")
      .select("id, name, latitude, longitude, radius_meters")
      .eq("organization_id", organizationId).limit(500),
    admin.from("bookings")
      .select("id, client, title, booking_number, status")
      .eq("organization_id", organizationId).neq("status", "CANCELLED").limit(500),
    admin.from("large_projects")
      .select("id, name, status")
      .eq("organization_id", organizationId).is("deleted_at", null).limit(300),
    admin.from("large_projects")
      .select("id, address_latitude, address_longitude")
      .eq("organization_id", organizationId).limit(300),
    admin.from("bookings")
      .select("id, delivery_latitude, delivery_longitude")
      .eq("organization_id", organizationId).limit(500),
  ]);

  const TEST_RX = /\b(test|demo)\b|!!|\?\?/i;
  const bookingCoords = new Map<string, { lat: number; lng: number }>();
  for (const r of (bookingCoordsRes.data ?? []) as any[]) {
    if (r.delivery_latitude != null && r.delivery_longitude != null) {
      bookingCoords.set(String(r.id), {
        lat: Number(r.delivery_latitude), lng: Number(r.delivery_longitude),
      });
    }
  }
  const projCoords = new Map<string, { lat: number; lng: number }>();
  for (const r of (projCoordsRes.data ?? []) as any[]) {
    if (r.address_latitude != null && r.address_longitude != null) {
      projCoords.set(String(r.id), {
        lat: Number(r.address_latitude), lng: Number(r.address_longitude),
      });
    }
  }
  const knownTargets: KnownPlace[] = [];
  for (const l of (locsRes.data ?? []) as any[]) {
    if (l.latitude == null || l.longitude == null) continue;
    if (TEST_RX.test(l.name ?? "")) continue;
    knownTargets.push({
      id: String(l.id), type: "location", name: l.name ?? "Plats",
      lat: Number(l.latitude), lng: Number(l.longitude),
      radiusM: Number(l.radius_meters ?? 100),
    });
  }
  for (const b of (bookingsRes.data ?? []) as any[]) {
    const c = bookingCoords.get(String(b.id));
    if (!c) continue;
    const label = b.client || b.title || b.booking_number || "Bokning";
    if (TEST_RX.test(label)) continue;
    knownTargets.push({ id: String(b.id), type: "booking", name: label, lat: c.lat, lng: c.lng, radiusM: 100 });
  }
  for (const p of (projectsRes.data ?? []) as any[]) {
    const c = projCoords.get(String(p.id));
    if (!c) continue;
    const label = p.name ?? "Projekt";
    if (TEST_RX.test(label)) continue;
    knownTargets.push({ id: String(p.id), type: "project", name: label, lat: c.lat, lng: c.lng, radiusM: 100 });
  }

  const pings = (pingsRes.data ?? []) as any[];
  const gps = buildGpsDayTimelineOnly({
    staffId, organizationId, date: dateStr,
    pings: pings.map((p) => ({
      recorded_at: p.recorded_at, lat: p.lat, lng: p.lng, accuracy: p.accuracy,
    })),
    knownTargets,
  });

  // Map GPS segments → TimeSegments clipped to [startedAt, endedAt]
  const segments: TimeSegment[] = [];
  for (const seg of gps.segments) {
    const clip = clipToWindow(seg.startTs, seg.endTs, startedAt, endedAt);
    if (!clip) continue;

    let kind: TimeSegmentKind;
    if (seg.kind === "stay" && seg.type === "known_site") {
      if (seg.matchedSiteType === "project") kind = "project";
      else if (seg.matchedSiteType === "booking") kind = "booking";
      else if (seg.matchedSiteType === "location") kind = "warehouse";
      else kind = "unknown_place";
    } else if (seg.kind === "travel") {
      kind = "transport";
    } else if (seg.kind === "gps_gap") {
      kind = "gps_uncertain";
    } else {
      kind = "unknown_place";
    }

    segments.push({
      startTs: clip.startTs,
      endTs: clip.endTs,
      durationMin: clip.durationMin,
      kind,
      label: seg.label,
      matchedSiteId: seg.matchedSiteId,
      matchedSiteType: seg.matchedSiteType,
      confidence: seg.confidence,
      reason: seg.reason,
      pingCount: seg.pingCount,
      distanceMeters: seg.distanceMeters,
      avgKmh: seg.avgKmh,
      source: "gps_classifier",
    });
  }

  // Summary
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const s of segments) {
    byKind[s.kind] = (byKind[s.kind] ?? 0) + s.durationMin;
    total += s.durationMin;
  }

  return json(200, {
    timerActive: !timer.exited_at,
    timerId: String(timer.id),
    startedAt,
    endedAt: timer.exited_at ?? null,
    boundTarget: {
      bookingId: timer.booking_id ?? null,
      largeProjectId: timer.large_project_id ?? null,
      locationId: timer.location_id ?? null,
      source: timer.source ?? null,
    },
    segments,
    summary: { totalMinutes: total, byKind },
  });
});

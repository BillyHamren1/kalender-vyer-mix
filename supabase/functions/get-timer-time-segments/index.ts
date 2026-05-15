// get-timer-time-segments
// ─────────────────────────────────────────────────────────────────────────────
// Slices the Time Engine's GPS day timeline by an active (or recently closed)
// `active_time_registrations` window so the segments become time-report /
// attest underlay.
//
// Single source of truth for active timer: `active_time_registrations`.
//   - Active timer       → status='active', stopped_at IS NULL
//   - Closed timer       → status!='active', stopped_at NOT NULL
// GPS classification    → new Time Engine (`buildGpsDayTimeline` +
//                          `resolveWorkTargets`).
//
// NEVER reads from `current_time_registration` or `location_time_entries`.
//
// Auth: dual (mobile token or Supabase JWT) via _shared/staff-auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import {
  buildGpsDayTimeline,
  type GpsPing,
} from "../_shared/time-engine/buildGpsDayTimeline.ts";
import {
  resolveWorkTargets,
  toWorkTarget,
} from "../_shared/time-engine/resolveWorkTargets.ts";
import type { WorkTarget } from "../_shared/time-engine/contracts.ts";
import { fetchAllStaffLocationPings } from "../_shared/timeEngine/fetchAllStaffLocationPings.ts";

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
  matchedTargetId: string | null;
  matchedTargetType: WorkTarget["kind"] | null;
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

  // Resolve timer row from active_time_registrations: explicit id, or latest
  // active row for staff.
  let timerQ = admin.from("active_time_registrations")
    .select(
      "id, started_at, stopped_at, status, start_target_type, start_target_id, start_target_label, current_kind, current_label",
    )
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId);
  if (timerId) {
    timerQ = timerQ.eq("id", timerId);
  } else {
    timerQ = timerQ.eq("status", "active");
  }
  const { data: rows } = await timerQ
    .order("started_at", { ascending: false })
    .limit(1);
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

  const startedAt: string = timer.started_at;
  const endedAt: string = timer.stopped_at ?? new Date().toISOString();
  const dateStr = startedAt.slice(0, 10);

  // Pings overlapping the window (small pad for clustering edges)
  const pad = 5 * 60_000;
  const fromTs = new Date(new Date(startedAt).getTime() - pad).toISOString();
  const toTs = new Date(new Date(endedAt).getTime() + pad).toISOString();

  // Lager 1.10 — gick tidigare via .limit(2000) på staff_location_history.
  // Day-wide / timer-wide analytics SKA gå via fetchAllStaffLocationPings
  // (gpsFetchConsistency.ts). Window = timerns hela varaktighet ± pad.
  const pingFetch = await fetchAllStaffLocationPings({
    supabaseAdmin: admin,
    organizationId,
    staffId,
    startUtc: fromTs,
    endUtc: toTs,
    select: "recorded_at, lat, lng, accuracy, speed",
  });
  const pingsData = pingFetch.rows;

  const pings: GpsPing[] = (pingsData ?? []).map((p: any) => ({
    ts: p.recorded_at,
    lat: Number(p.lat),
    lng: Number(p.lng),
    accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
    speedMps: p.speed != null ? Number(p.speed) : null,
  }));

  // Resolve targets via new Time Engine resolver.
  const { targets: resolved } = await resolveWorkTargets({
    organizationId,
    staffId,
    date: dateStr,
    supabaseAdmin: admin,
  });
  const workTargets: WorkTarget[] = resolved
    .map(toWorkTarget)
    .filter((t): t is WorkTarget => !!t);

  const gps = buildGpsDayTimeline({
    staffId,
    organizationId,
    date: dateStr,
    pings,
    targets: workTargets,
  });

  const segments: TimeSegment[] = [];
  for (const seg of gps.segments) {
    const clip = clipToWindow(seg.startTs, seg.endTs, startedAt, endedAt);
    if (!clip) continue;

    let kind: TimeSegmentKind;
    if (seg.kind === "stay" && seg.type === "known_site") {
      if (seg.matchedTargetType === "project") kind = "project";
      else if (seg.matchedTargetType === "booking") kind = "booking";
      else if (seg.matchedTargetType === "location") kind = "warehouse";
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
      matchedTargetId: seg.matchedTargetId,
      matchedTargetType: seg.matchedTargetType,
      confidence: seg.confidence,
      reason: seg.reason,
      pingCount: seg.pingCount,
      distanceMeters: seg.distanceMeters,
      avgKmh: seg.avgKmh,
      source: "gps_classifier",
    });
  }

  const byKind: Record<string, number> = {};
  let total = 0;
  for (const s of segments) {
    byKind[s.kind] = (byKind[s.kind] ?? 0) + s.durationMin;
    total += s.durationMin;
  }

  return json(200, {
    timerActive: timer.status === "active",
    timerId: String(timer.id),
    startedAt,
    endedAt: timer.stopped_at ?? null,
    boundTarget: {
      targetType: timer.start_target_type ?? null,
      targetId: timer.start_target_id ?? null,
      label: timer.start_target_label ?? null,
    },
    segments,
    summary: { totalMinutes: total, byKind },
  });
});

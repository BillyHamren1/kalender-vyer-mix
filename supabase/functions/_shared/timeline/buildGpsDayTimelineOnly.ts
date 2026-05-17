// buildGpsDayTimelineOnly
// ─────────────────────────────────────────────────────────────────────────────
// PURE function. NO side effects, NO database access, NO knowledge of:
//   workday, time_reports, location_time_entries, travel_time_logs,
//   assistant_events, workday_flags, attestations, active timers, snapshots.
//
// Input:
//   { staffId, organizationId, date, pings, knownTargets }
//
// Output:
//   { rawPingCount, firstPingAt, lastPingAt, gaps, segments, targetMatches,
//     qualitySummary }
//
// A segment is named ONLY from a matched known target. If nothing matches it
// is labelled "Okänd plats" (stay) / "Okänd stabil plats" (long stay) /
// "Förflyttning" (travel) / "GPS-glapp" (gap). Names never come from timers,
// workday, old entries or flags.

import { clusterPings } from "./cluster.ts";
import { matchSegmentsToPlaces } from "./matcher.ts";
import { distanceMeters } from "./geo.ts";
import type { KnownPlace, Ping, Segment } from "./types.ts";

// ── Public input/output types ───────────────────────────────────────────────

export interface RawPingInput {
  recorded_at: string;
  lat: number | null;
  lng: number | null;
  accuracy?: number | null;
  speed?: number | null;
  app_state?: string | null;
}

export interface BuildGpsDayTimelineInput {
  staffId: string;
  organizationId: string | null;
  date: string;                 // YYYY-MM-DD
  pings: RawPingInput[];
  knownTargets: KnownPlace[];
}

export type GpsSegmentKind = "stay" | "travel" | "gps_gap";
export type GpsSegmentType =
  | "known_site"
  | "unknown_place"
  | "transport"
  | "single_ping_movement"
  | "gps_gap";

export interface GpsTimelineSegment {
  startTs: string;
  endTs: string;
  durationMin: number;
  kind: GpsSegmentKind;
  type: GpsSegmentType;
  label: string;
  matchedSiteId: string | null;
  matchedSiteType: KnownPlace["type"] | null;
  matchedSiteName: string | null;
  centerLat: number | null;
  centerLng: number | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  pingCount: number;
  distanceMeters: number;
  avgKmh: number | null;
  confidence: number;            // 0..1
  reason: string;
}

export interface PingGap {
  from: string;
  to: string;
  gapMinutes: number;
}

export interface TargetMatchSummary {
  kind: KnownPlace["type"];
  id: string;
  name: string;
  firstMatchAt: string;
  lastMatchAt: string;
  totalMinutes: number;
  visitCount: number;
}

export interface BuildGpsDayTimelineOutput {
  rawPingCount: number;
  firstPingAt: string | null;
  lastPingAt: string | null;
  gaps: PingGap[];
  segments: GpsTimelineSegment[];
  targetMatches: {
    booking: TargetMatchSummary[];
    project: TargetMatchSummary[];
    location: TargetMatchSummary[];
    summary: {
      knownTargetsCount: number;
      matchedTargetCount: number;
      stayCount: number;
      knownStayCount: number;
      unknownStayCount: number;
      travelCount: number;
      gpsGapCount: number;
    };
  };
  qualitySummary: {
    ok: number;
    low: number;
    invalid: number;
    usedForClusteringCount: number;
  };
}

// ── Internal constants (Phase 1 defaults — debug-friendly) ──────────────────
const STATIONARY_RADIUS_M = 80;
const MIN_STOP_MIN = 5;
const MAX_GAP_MIN = 15;
const GAP_THRESHOLD_MIN = 10;     // emit gps_gap row when stops are this far apart
const LOW_ACCURACY_THRESHOLD_M = 200;

// ── Implementation ──────────────────────────────────────────────────────────

export function buildGpsDayTimelineOnly(
  input: BuildGpsDayTimelineInput,
): BuildGpsDayTimelineOutput {
  const pings = Array.isArray(input.pings) ? [...input.pings] : [];
  pings.sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));

  const knownTargets = Array.isArray(input.knownTargets) ? input.knownTargets : [];

  // Quality classification — does NOT mutate pings
  let okCount = 0;
  let lowCount = 0;
  let invalidCount = 0;
  for (const p of pings) {
    const hasCoord = p.lat != null && p.lng != null;
    const acc = p.accuracy != null ? Number(p.accuracy) : null;
    if (!hasCoord) invalidCount++;
    else if (acc != null && acc > LOW_ACCURACY_THRESHOLD_M) lowCount++;
    else okCount++;
  }

  // Gaps in raw stream (>10 min) — useful regardless of clustering
  const gaps: PingGap[] = [];
  for (let i = 1; i < pings.length; i++) {
    const a = new Date(pings[i - 1].recorded_at).getTime();
    const b = new Date(pings[i].recorded_at).getTime();
    const gapMin = (b - a) / 60000;
    if (gapMin > GAP_THRESHOLD_MIN) {
      gaps.push({
        from: pings[i - 1].recorded_at,
        to: pings[i].recorded_at,
        gapMinutes: Math.round(gapMin),
      });
    }
  }

  // Cluster usable pings only
  const clusterInput: Ping[] = pings
    .filter((p) => p.lat != null && p.lng != null)
    .filter((p) => p.accuracy == null || Number(p.accuracy) <= LOW_ACCURACY_THRESHOLD_M)
    .map((p) => ({
      ts: p.recorded_at,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracy: p.accuracy != null ? Number(p.accuracy) : null,
    }));

  let clustered: Segment[] = [];
  try {
    clustered = clusterPings(clusterInput, {
      stationaryRadiusM: STATIONARY_RADIUS_M,
      minStopMin: MIN_STOP_MIN,
      maxGapMin: MAX_GAP_MIN,
    });
    clustered = matchSegmentsToPlaces(clustered, knownTargets);
  } catch {
    clustered = [];
  }

  // Keep only stationary clusters as "stays". Travels are rebuilt from raw
  // pings between stays so we get continuous movement segments instead of
  // dozens of micro-clusters.
  const stays = clustered.filter((c) => c.isStationary);

  const segments: GpsTimelineSegment[] = [];
  const stayWindows = stays.map((s) => ({
    start: new Date(s.startTs).getTime(),
    end: new Date(s.endTs).getTime(),
  }));
  const inAnyStay = (tMs: number) =>
    stayWindows.some((w) => tMs >= w.start && tMs <= w.end);

  // Helper: build travel segments from a list of consecutive movement pings.
  const TRAVEL_MAX_GAP_MS = 3 * 60_000;
  const buildTravelChains = (chunk: Ping[]): GpsTimelineSegment[] => {
    if (chunk.length === 0) return [];
    const out: GpsTimelineSegment[] = [];
    let chain: Ping[] = [chunk[0]];
    const flushChain = () => {
      if (chain.length === 0) return;
      if (chain.length === 1) {
        const p = chain[0];
        out.push({
          startTs: p.ts,
          endTs: p.ts,
          durationMin: 0,
          kind: "travel",
          type: "single_ping_movement" as any,
          label: "Enstaka rörelseping",
          matchedSiteId: null,
          matchedSiteType: null,
          matchedSiteName: null,
          centerLat: p.lat,
          centerLng: p.lng,
          startLat: p.lat,
          startLng: p.lng,
          endLat: p.lat,
          endLng: p.lng,
          pingCount: 1,
          distanceMeters: 0,
          avgKmh: null,
          confidence: 0.3,
          reason: "isolated_movement_ping",
        });
      } else {
        let dist = 0;
        for (let i = 1; i < chain.length; i++) {
          dist += distanceMeters(chain[i - 1].lat, chain[i - 1].lng, chain[i].lat, chain[i].lng);
        }
        const startTs = chain[0].ts;
        const endTs = chain[chain.length - 1].ts;
        const durationMin = (new Date(endTs).getTime() - new Date(startTs).getTime()) / 60000;
        const avgKmh = durationMin > 0 ? (dist / 1000) / (durationMin / 60) : null;
        const cLat = chain.reduce((s, p) => s + p.lat, 0) / chain.length;
        const cLng = chain.reduce((s, p) => s + p.lng, 0) / chain.length;
        out.push({
          startTs,
          endTs,
          durationMin: Math.max(1, Math.round(durationMin)),
          kind: "travel",
          type: "transport",
          label: "Förflyttning",
          matchedSiteId: null,
          matchedSiteType: null,
          matchedSiteName: null,
          centerLat: cLat,
          centerLng: cLng,
          startLat: chain[0].lat,
          startLng: chain[0].lng,
          endLat: chain[chain.length - 1].lat,
          endLng: chain[chain.length - 1].lng,
          pingCount: chain.length,
          distanceMeters: Math.round(dist),
          avgKmh: avgKmh != null ? Math.round(avgKmh * 10) / 10 : null,
          confidence: 0.7,
          reason: "continuous_movement",
        });
      }
      chain = [];
    };
    for (let i = 1; i < chunk.length; i++) {
      const prev = chunk[i - 1];
      const cur = chunk[i];
      const gapMs = new Date(cur.ts).getTime() - new Date(prev.ts).getTime();
      if (gapMs > TRAVEL_MAX_GAP_MS) {
        flushChain();
      }
      chain.push(cur);
    }
    flushChain();
    return out;
  };

  // Target-aware reclassification: if ≥80% of pings in a travel chain lie
  // within the same known target's geofence, emit it as a stay at that target
  // instead of "transport". Fixes the case where a person walks/moves around
  // inside a large project/warehouse footprint (>80m wiggle) and gets falsely
  // labelled as "Resa" + "Osäker period".
  const TARGET_CONTAINMENT_RATIO = 0.8;
  const findContainingTarget = (chain: Ping[]): KnownPlace | null => {
    if (chain.length === 0 || knownTargets.length === 0) return null;
    let best: { place: KnownPlace; count: number } | null = null;
    for (const place of knownTargets) {
      let inside = 0;
      for (const p of chain) {
        if (distanceMeters(p.lat, p.lng, place.lat, place.lng) <= place.radiusM) {
          inside++;
        }
      }
      const ratio = inside / chain.length;
      if (ratio >= TARGET_CONTAINMENT_RATIO) {
        if (!best || inside > best.count) best = { place, count: inside };
      }
    }
    return best?.place ?? null;
  };

  // Movement pings = pings outside any stay window
  const movementPings = clusterInput.filter((p) => !inAnyStay(new Date(p.ts).getTime()));

  // Walk in chronological order, interleaving stays + travel chains between them
  const sortedStays = [...stays].sort((a, b) => a.startTs.localeCompare(b.startTs));
  let mvIdx = 0;
  const pushTravelBefore = (boundaryMs: number) => {
    const slice: Ping[] = [];
    while (mvIdx < movementPings.length) {
      const t = new Date(movementPings[mvIdx].ts).getTime();
      if (t >= boundaryMs) break;
      slice.push(movementPings[mvIdx]);
      mvIdx++;
    }
    if (slice.length > 0) segments.push(...buildTravelChains(slice));
  };
  for (const stay of sortedStays) {
    pushTravelBefore(new Date(stay.startTs).getTime());
    segments.push(toTimelineSegment(stay));
  }
  // Trailing movement after last stay
  if (mvIdx < movementPings.length) {
    segments.push(...buildTravelChains(movementPings.slice(mvIdx)));
  }

  // Inject gps_gap entries between segments separated by long silence
  const final: GpsTimelineSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    final.push(segments[i]);
    const next = segments[i + 1];
    if (next) {
      const gapMin = (new Date(next.startTs).getTime() - new Date(segments[i].endTs).getTime()) / 60000;
      if (gapMin >= GAP_THRESHOLD_MIN) {
        final.push(makeGapSegment(segments[i].endTs, next.startTs, Math.round(gapMin)));
      }
    }
  }
  segments.length = 0;
  segments.push(...final);

  // Target match summary
  const matchedById = new Map<string, TargetMatchSummary>();
  for (const seg of segments) {
    if (seg.kind !== "stay" || seg.type !== "known_site" || !seg.matchedSiteId || !seg.matchedSiteType) continue;
    const key = `${seg.matchedSiteType}:${seg.matchedSiteId}`;
    const existing = matchedById.get(key);
    if (!existing) {
      matchedById.set(key, {
        kind: seg.matchedSiteType,
        id: seg.matchedSiteId,
        name: seg.matchedSiteName ?? "Okänd plats",
        firstMatchAt: seg.startTs,
        lastMatchAt: seg.endTs,
        totalMinutes: seg.durationMin,
        visitCount: 1,
      });
    } else {
      existing.lastMatchAt = seg.endTs;
      existing.totalMinutes += seg.durationMin;
      existing.visitCount += 1;
    }
  }
  const matches = Array.from(matchedById.values());

  return {
    rawPingCount: pings.length,
    firstPingAt: pings[0]?.recorded_at ?? null,
    lastPingAt: pings[pings.length - 1]?.recorded_at ?? null,
    gaps,
    segments,
    targetMatches: {
      booking: matches.filter((m) => m.kind === "booking"),
      project: matches.filter((m) => m.kind === "project"),
      location: matches.filter((m) => m.kind === "location"),
      summary: {
        knownTargetsCount: knownTargets.length,
        matchedTargetCount: matches.length,
        stayCount: segments.filter((s) => s.kind === "stay").length,
        knownStayCount: segments.filter((s) => s.kind === "stay" && s.type === "known_site").length,
        unknownStayCount: segments.filter((s) => s.kind === "stay" && s.type === "unknown_place").length,
        travelCount: segments.filter((s) => s.kind === "travel").length,
        gpsGapCount: segments.filter((s) => s.kind === "gps_gap").length,
      },
    },
    qualitySummary: {
      ok: okCount,
      low: lowCount,
      invalid: invalidCount,
      usedForClusteringCount: clusterInput.length,
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toTimelineSegment(s: Segment): GpsTimelineSegment {
  const matched = s.matchedPlace;
  let kind: GpsSegmentKind;
  let type: GpsSegmentType;
  let label: string;
  let reason: string;
  let confidence: number;

  if (s.isStationary) {
    kind = "stay";
    if (matched) {
      type = "known_site";
      label = matched.name || "Plats";
      reason = `matched_${matched.type}`;
      confidence = 0.85;
    } else {
      type = "unknown_place";
      // GPS-only naming — never inferred from timers/workday/flags
      label = s.durationMin >= 15 ? "Okänd stabil plats" : "Okänd plats";
      reason = "no_known_target_matched";
      confidence = 0.5;
    }
  } else {
    kind = "travel";
    type = "transport";
    label = "Förflyttning";
    reason = "movement_between_stops";
    confidence = 0.6;
  }

  // Geometry: derive distance / avg speed where possible
  const startLat = s.centerLat;
  const startLng = s.centerLng;
  const endLat = s.centerLat;
  const endLng = s.centerLng;
  let distM = 0;
  let avgKmh: number | null = null;
  if (kind === "travel" && s.durationMin > 0) {
    // We don't have raw start/end coords here (clusterer collapses pings) —
    // distance/speed for travel are best-effort placeholders.
    distM = 0;
    avgKmh = null;
  }

  return {
    startTs: s.startTs,
    endTs: s.endTs,
    durationMin: Math.round(s.durationMin),
    kind,
    type,
    label,
    matchedSiteId: matched?.id ?? null,
    matchedSiteType: matched?.type ?? null,
    matchedSiteName: matched?.name ?? null,
    centerLat: s.centerLat,
    centerLng: s.centerLng,
    startLat,
    startLng,
    endLat,
    endLng,
    pingCount: s.pingCount,
    distanceMeters: Math.round(distM),
    avgKmh,
    confidence,
    reason,
  };
}

function makeGapSegment(fromTs: string, toTs: string, gapMin: number): GpsTimelineSegment {
  return {
    startTs: fromTs,
    endTs: toTs,
    durationMin: gapMin,
    kind: "gps_gap",
    type: "gps_gap",
    label: "GPS-glapp",
    matchedSiteId: null,
    matchedSiteType: null,
    matchedSiteName: null,
    centerLat: null,
    centerLng: null,
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    pingCount: 0,
    distanceMeters: 0,
    avgKmh: null,
    confidence: 0.3,
    reason: "ping_silence_over_threshold",
  };
}

// Re-export the suppressed-distance helper just in case downstream needs it
export { distanceMeters };

/**
 * Time Engine — buildGpsDayTimeline
 * =================================
 *
 * Pure builder for the physical GPS day timeline.
 *
 * GPS Day Timeline = PHYSICAL REALITY from GPS, NOT work time.
 * It says where the person was — never that they worked.
 *
 * STRICT INPUT POLICY — this function may ONLY use:
 *   - pings
 *   - targets
 *   - policy
 *   - date / timezone
 *
 * It MUST NOT touch (do not import, do not query, do not derive from):
 *   - workday / workdays
 *   - time_reports
 *   - location_time_entries
 *   - travel_time_logs
 *   - assistant_events
 *   - workday_flags / time_report_anomalies
 *   - old snapshots / cached timelines
 *   - legacy activeTimers / useWorkSession state
 *
 * It MUST NOT write to the database. It is a pure transformation.
 *
 * Naming rules:
 *   - Stable pings at the same place         → kind=stay
 *   - Consecutive movement pings             → one travel segment
 *   - Long quiet periods                     → gps_gap
 *   - Stay matching a valid target           → type=known_site
 *   - Stay not matching a valid target       → type=unknown_place
 *   - GPS gap MUST NEVER become travel
 *   - Unknown place MUST NEVER be named from a previous timer/report
 */

import type { DwellPolicy, NightPolicy } from './timePolicy.ts';
import { dayPolicy as defaultDayPolicy, nightPolicy as defaultNightPolicy } from './timePolicy.ts';
import type { Confidence, ISODate, ISODateTime, UUID, WorkTarget } from './contracts.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

export interface GpsPing {
  /** ISO timestamp of the ping. */
  ts: ISODateTime;
  lat: number;
  lng: number;
  /** Horizontal accuracy in meters (lower = better). */
  accuracyM?: number | null;
  /** Optional speed (m/s) reported by the device. */
  speedMps?: number | null;
}

export interface BuildGpsDayTimelinePolicy {
  day?: DwellPolicy;
  night?: NightPolicy;
  /** Max time between pings before we declare a gps_gap (default 10 min). */
  maxPingIntervalSeconds?: number;
  /** Max stay radius in meters when clustering stationary pings (default 75m). */
  stayRadiusM?: number;
  /** Min number of pings before we accept a stay cluster (default 2). */
  minStayPings?: number;
  /** Speed threshold (km/h) above which a ping is considered movement (default 4). */
  movementSpeedKmh?: number;
  /** IANA timezone for date math; reserved for future use. */
  timezone?: string;
}

export interface BuildGpsDayTimelineInput {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  pings: GpsPing[];
  targets: WorkTarget[];
  policy?: BuildGpsDayTimelinePolicy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output (richer shape than contracts.GpsSegment for builder consumers)
// ─────────────────────────────────────────────────────────────────────────────

export type GpsTimelineSegmentKind = 'stay' | 'travel' | 'gps_gap';
export type GpsTimelineSegmentType =
  | 'known_site'
  | 'unknown_place'
  | 'transport'
  | 'gps_gap';

export type GpsTimelineSegmentReason =
  | 'matched_valid_target'
  | 'no_target_match'
  | 'movement_cluster'
  | 'gap_exceeds_threshold'
  | 'too_few_pings_for_stay';

export type MovementReason =
  | 'speed_threshold'
  | 'reported_speed_threshold'
  | 'distance_from_previous_ping'
  | 'outside_stay_radius'
  | 'stationary'
  | 'gap';

export interface MovementDecision {
  movement: boolean;
  reason: MovementReason;
  distanceFromPreviousMeters?: number | null;
  secondsFromPrevious?: number | null;
  computedKmh?: number | null;
  reportedKmh?: number | null;
  stayRadiusM?: number;
  movementSpeedKmh?: number;
}

export interface SegmentTargetDiagnostics {
  nearestTargetLabel?: string | null;
  nearestTargetId?: string | null;
  nearestTargetType?: string | null;
  nearestTargetDistanceMeters?: number | null;
  nearestTargetRadiusMeters?: number | null;
  insideNearestTarget?: boolean;
  pingsInsideAnyTarget?: number;
  pingsInsidePrimaryTarget?: number;
  pingsInsideSameTargetRatio?: number;
  travelInsideTargetCandidate?: boolean;
  travelInsideTargetLabel?: string | null;
}

export interface GpsTimelineSegment {
  id: string;
  startTs: ISODateTime;
  endTs: ISODateTime;
  durationMin: number;

  kind: GpsTimelineSegmentKind;
  type: GpsTimelineSegmentType;
  label: string;

  matchedTargetId: UUID | null;
  matchedTargetType: WorkTarget['kind'] | null;
  matchedTargetName: string | null;

  centerLat: number | null;
  centerLng: number | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;

  pingCount: number;
  distanceMeters: number;
  avgKmh: number;
  confidence: Confidence;
  reason: GpsTimelineSegmentReason;

  movementDecision?: MovementDecision;
  targetDiagnostics?: SegmentTargetDiagnostics;
}

export interface GpsTimelineGap {
  id: string;
  startTs: ISODateTime;
  endTs: ISODateTime;
  durationMin: number;
}

export interface GpsTimelineQualitySummary {
  totalPings: number;
  acceptedPings: number;
  rejectedPings: number;
  avgAccuracyM: number | null;
  coverageMinutes: number;
  gapMinutes: number;
}

export interface GpsTimelineTargetMatchSummary {
  knownSiteSegments: number;
  unknownPlaceSegments: number;
  transportSegments: number;
  gapSegments: number;
  uniqueTargetsHit: number;
}

export interface GpsDayTimelineResult {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  computedAt: ISODateTime;

  rawPingCount: number;
  firstPingAt: ISODateTime | null;
  lastPingAt: ISODateTime | null;

  gaps: GpsTimelineGap[];
  segments: GpsTimelineSegment[];
  qualitySummary: GpsTimelineQualitySummary;
  targetMatchSummary: GpsTimelineTargetMatchSummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults & helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  maxPingIntervalSeconds: 10 * 60,
  stayRadiusM: 75,
  minStayPings: 2,
  movementSpeedKmh: 4,
  /** Pings worse than this accuracy (m) are dropped. */
  maxAcceptableAccuracyM: 200,
};

const EARTH_R = 6_371_000;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

const minutesBetween = (a: ISODateTime, b: ISODateTime) =>
  Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000);

const seconds = (n: number) => n * 1000;

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function makeId(prefix: string, idx: number): string {
  return `${prefix}-${idx}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Target matching (no DB, pure)
// ─────────────────────────────────────────────────────────────────────────────

function matchTarget(
  centerLat: number,
  centerLng: number,
  atIso: ISODateTime,
  targets: WorkTarget[],
): { target: WorkTarget; distanceM: number } | null {
  const at = Date.parse(atIso);
  let best: { target: WorkTarget; distanceM: number } | null = null;
  for (const t of targets) {
    if (t.validFrom && Date.parse(t.validFrom) > at) continue;
    if (t.validUntil && Date.parse(t.validUntil) < at) continue;
    const d = haversine(centerLat, centerLng, t.center.lat, t.center.lng);
    if (d <= t.radiusM && (best == null || d < best.distanceM)) {
      best = { target: t, distanceM: d };
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

interface Cluster {
  pings: GpsPing[];
  centerLat: number;
  centerLng: number;
}

function clusterCenter(pings: GpsPing[]): { lat: number; lng: number } {
  let sLat = 0, sLng = 0;
  for (const p of pings) { sLat += p.lat; sLng += p.lng; }
  return { lat: sLat / pings.length, lng: sLng / pings.length };
}

function clusterDistance(pings: GpsPing[]): number {
  let total = 0;
  for (let i = 1; i < pings.length; i++) {
    total += haversine(pings[i - 1].lat, pings[i - 1].lng, pings[i].lat, pings[i].lng);
  }
  return total;
}

export function buildGpsDayTimeline(
  input: BuildGpsDayTimelineInput,
): GpsDayTimelineResult {
  const cfg = {
    maxPingIntervalSeconds: input.policy?.maxPingIntervalSeconds ?? DEFAULTS.maxPingIntervalSeconds,
    stayRadiusM: input.policy?.stayRadiusM ?? DEFAULTS.stayRadiusM,
    minStayPings: input.policy?.minStayPings ?? DEFAULTS.minStayPings,
    movementSpeedKmh: input.policy?.movementSpeedKmh ?? DEFAULTS.movementSpeedKmh,
    day: input.policy?.day ?? defaultDayPolicy,
    night: input.policy?.night ?? defaultNightPolicy,
  };

  const rawPingCount = input.pings.length;

  // 1) Sort + filter by accuracy. Reject obviously bad pings.
  const accepted: GpsPing[] = [...input.pings]
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !!p.ts)
    .filter((p) => (p.accuracyM ?? 0) <= DEFAULTS.maxAcceptableAccuracyM)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const rejectedPings = rawPingCount - accepted.length;
  const firstPingAt = accepted[0]?.ts ?? null;
  const lastPingAt = accepted[accepted.length - 1]?.ts ?? null;

  const gaps: GpsTimelineGap[] = [];
  const segments: GpsTimelineSegment[] = [];

  if (accepted.length === 0) {
    return {
      staffId: input.staffId,
      organizationId: input.organizationId,
      date: input.date,
      computedAt: new Date().toISOString(),
      rawPingCount,
      firstPingAt: null,
      lastPingAt: null,
      gaps,
      segments,
      qualitySummary: {
        totalPings: rawPingCount,
        acceptedPings: 0,
        rejectedPings,
        avgAccuracyM: null,
        coverageMinutes: 0,
        gapMinutes: 0,
      },
      targetMatchSummary: {
        knownSiteSegments: 0,
        unknownPlaceSegments: 0,
        transportSegments: 0,
        gapSegments: 0,
        uniqueTargetsHit: 0,
      },
    };
  }

  // 2) Walk pings, building runs of {stay | travel} interrupted by gps_gap.
  type RunKind = 'stay' | 'travel';
  interface Run {
    kind: RunKind;
    pings: GpsPing[];
    centerLat: number;
    centerLng: number;
  }
  const runs: Array<Run | { kind: 'gps_gap'; startTs: ISODateTime; endTs: ISODateTime }> = [];

  const beginRun = (kind: RunKind, p: GpsPing): Run => ({
    kind,
    pings: [p],
    centerLat: p.lat,
    centerLng: p.lng,
  });

  let current: Run | null = null;

  const isMovement = (prev: GpsPing, p: GpsPing): boolean => {
    const dt = (Date.parse(p.ts) - Date.parse(prev.ts)) / 1000;
    if (dt <= 0) return false;
    const d = haversine(prev.lat, prev.lng, p.lat, p.lng);
    const kmh = (d / dt) * 3.6;
    if (kmh >= cfg.movementSpeedKmh) return true;
    if ((p.speedMps ?? 0) * 3.6 >= cfg.movementSpeedKmh) return true;
    // If point is far outside the current cluster radius, treat as movement.
    return d > cfg.stayRadiusM * 2;
  };

  for (let i = 0; i < accepted.length; i++) {
    const p = accepted[i];

    if (i === 0) {
      current = beginRun('stay', p);
      continue;
    }

    const prev = accepted[i - 1];
    const dtMs = Date.parse(p.ts) - Date.parse(prev.ts);

    // Long quiet period → gps_gap (NEVER travel).
    if (dtMs > seconds(cfg.maxPingIntervalSeconds)) {
      if (current) runs.push(current);
      runs.push({ kind: 'gps_gap', startTs: prev.ts, endTs: p.ts });
      current = beginRun('stay', p);
      continue;
    }

    const movement = isMovement(prev, p);

    if (!current) {
      current = beginRun(movement ? 'travel' : 'stay', p);
      continue;
    }

    if (movement) {
      if (current.kind === 'travel') {
        current.pings.push(p);
        const c = clusterCenter(current.pings);
        current.centerLat = c.lat;
        current.centerLng = c.lng;
      } else {
        // close stay, open travel
        runs.push(current);
        current = beginRun('travel', p);
      }
    } else {
      // stationary candidate
      if (current.kind === 'stay') {
        const dToCenter = haversine(current.centerLat, current.centerLng, p.lat, p.lng);
        if (dToCenter <= cfg.stayRadiusM) {
          current.pings.push(p);
          const c = clusterCenter(current.pings);
          current.centerLat = c.lat;
          current.centerLng = c.lng;
        } else {
          runs.push(current);
          current = beginRun('stay', p);
        }
      } else {
        // travel ended → start new stay
        runs.push(current);
        current = beginRun('stay', p);
      }
    }
  }
  if (current) runs.push(current);

  // 3) Materialize segments (and persist gaps separately).
  let idx = 0;
  let gapIdx = 0;
  let totalCoverageMin = 0;
  let totalGapMin = 0;
  const targetsHit = new Set<string>();
  let knownSite = 0, unknownPlace = 0, transport = 0, gapSegs = 0;

  for (const run of runs) {
    if (run.kind === 'gps_gap') {
      const durationMin = minutesBetween(run.startTs, run.endTs);
      totalGapMin += durationMin;
      gaps.push({
        id: makeId('gap', gapIdx++),
        startTs: run.startTs,
        endTs: run.endTs,
        durationMin,
      });
      segments.push({
        id: makeId('seg', idx++),
        startTs: run.startTs,
        endTs: run.endTs,
        durationMin,
        kind: 'gps_gap',
        type: 'gps_gap',
        label: 'GPS-glapp',
        matchedTargetId: null,
        matchedTargetType: null,
        matchedTargetName: null,
        centerLat: null, centerLng: null,
        startLat: null, startLng: null,
        endLat: null, endLng: null,
        pingCount: 0,
        distanceMeters: 0,
        avgKmh: 0,
        confidence: 0,
        reason: 'gap_exceeds_threshold',
      });
      gapSegs++;
      continue;
    }

    const first = run.pings[0];
    const last = run.pings[run.pings.length - 1];
    const durationMin = minutesBetween(first.ts, last.ts);
    totalCoverageMin += durationMin;
    const distanceMeters = clusterDistance(run.pings);
    const dtSec = Math.max(1, (Date.parse(last.ts) - Date.parse(first.ts)) / 1000);
    const avgKmh = (distanceMeters / dtSec) * 3.6;

    if (run.kind === 'travel') {
      segments.push({
        id: makeId('seg', idx++),
        startTs: first.ts,
        endTs: last.ts,
        durationMin,
        kind: 'travel',
        type: 'transport',
        label: 'Transport',
        matchedTargetId: null,
        matchedTargetType: null,
        matchedTargetName: null,
        centerLat: run.centerLat,
        centerLng: run.centerLng,
        startLat: first.lat, startLng: first.lng,
        endLat: last.lat, endLng: last.lng,
        pingCount: run.pings.length,
        distanceMeters,
        avgKmh,
        confidence: Math.min(1, 0.5 + Math.min(run.pings.length, 10) / 20),
        reason: 'movement_cluster',
      });
      transport++;
      continue;
    }

    // STAY
    const center = clusterCenter(run.pings);
    const tooFew = run.pings.length < cfg.minStayPings;
    const match = matchTarget(center.lat, center.lng, first.ts, input.targets);

    let type: GpsTimelineSegmentType;
    let label: string;
    let reason: GpsTimelineSegmentReason;
    let matchedTargetId: UUID | null = null;
    let matchedTargetType: WorkTarget['kind'] | null = null;
    let matchedTargetName: string | null = null;
    let confidence: Confidence;

    if (match) {
      type = 'known_site';
      label = match.target.label;
      reason = 'matched_valid_target';
      matchedTargetId = match.target.refId;
      matchedTargetType = match.target.kind;
      matchedTargetName = match.target.label;
      confidence = Math.min(1, 0.6 + Math.min(run.pings.length, 10) / 25);
      targetsHit.add(match.target.key);
      knownSite++;
    } else {
      // Unknown place MUST NEVER be named from a previous timer/report.
      type = 'unknown_place';
      label = 'Okänd plats';
      reason = tooFew ? 'too_few_pings_for_stay' : 'no_target_match';
      confidence = tooFew ? 0.2 : Math.min(0.6, 0.3 + run.pings.length / 30);
      unknownPlace++;
    }

    segments.push({
      id: makeId('seg', idx++),
      startTs: first.ts,
      endTs: last.ts,
      durationMin,
      kind: 'stay',
      type,
      label,
      matchedTargetId,
      matchedTargetType,
      matchedTargetName,
      centerLat: center.lat,
      centerLng: center.lng,
      startLat: first.lat, startLng: first.lng,
      endLat: last.lat, endLng: last.lng,
      pingCount: run.pings.length,
      distanceMeters,
      avgKmh,
      confidence,
      reason,
    });
  }

  const avgAccuracyM = avg(
    accepted.map((p) => p.accuracyM ?? NaN).filter((n) => Number.isFinite(n)) as number[],
  );

  return {
    staffId: input.staffId,
    organizationId: input.organizationId,
    date: input.date,
    computedAt: new Date().toISOString(),
    rawPingCount,
    firstPingAt,
    lastPingAt,
    gaps,
    segments,
    qualitySummary: {
      totalPings: rawPingCount,
      acceptedPings: accepted.length,
      rejectedPings,
      avgAccuracyM,
      coverageMinutes: totalCoverageMin,
      gapMinutes: totalGapMin,
    },
    targetMatchSummary: {
      knownSiteSegments: knownSite,
      unknownPlaceSegments: unknownPlace,
      transportSegments: transport,
      gapSegments: gapSegs,
      uniqueTargetsHit: targetsHit.size,
    },
  };
}

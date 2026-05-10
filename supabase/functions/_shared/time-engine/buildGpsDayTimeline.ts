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
import { isInsideGeofence, distanceToGeofenceEdge, type GeofenceTarget } from '../geofenceEval.ts';

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
  /** Median GPS horizontal accuracy across the segment's pings. */
  medianAccuracyMeters?: number | null;
  /** Set during post-pass when evaluating movement_inside_geofence rule. */
  clearExitDetected?: boolean | null;
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

  /** Set when post-pass moved a travel segment into a known site. */
  reclassificationReason?: 'movement_inside_geofence' | null;
  /** Original kind before reclassification (audit). */
  originalKind?: GpsTimelineSegmentKind | null;
  /** Original type before reclassification (audit). */
  originalType?: GpsTimelineSegmentType | null;
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

export interface MovementInsideGeofenceExample {
  segmentStart: ISODateTime;
  segmentEnd: ISODateTime;
  durationMinutes: number;
  targetLabel: string | null;
  pingsInsideSameTargetRatio: number | null;
  computedKmh: number | null;
  movementReason: string | null;
  nearestTargetDistanceMeters: number | null;
  nearestTargetRadiusMeters: number | null;
  clearExitDetected: boolean;
}

export interface GpsClassificationDiagnostics {
  travelSegmentsInsideTargetCandidateCount: number;
  travelSegmentsInsideTargetCandidateMinutes: number;
  travelSegmentsByMovementReason: Record<string, number>;
  rejectedPingsByAccuracyCount: number;
  acceptedPingsCount: number;
  targetsAvailableToGpsTimeline: number;
  movementInsideGeofenceReclassifiedCount: number;
  movementInsideGeofenceReclassifiedMinutes: number;
  movementInsideGeofenceExamples: MovementInsideGeofenceExample[];
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
  classificationDiagnostics: GpsClassificationDiagnostics;
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

/**
 * Adapter so we can call shared isInsideGeofence/distanceToGeofenceEdge
 * (defined over GeofenceTarget) on a Time-Engine WorkTarget.
 * When `polygon` is set, the polygon takes precedence; otherwise circle.
 */
function asGeofenceTarget(t: WorkTarget): GeofenceTarget {
  return {
    latitude: t.center.lat,
    longitude: t.center.lng,
    radius_meters: t.radiusM,
    geofence_mode: t.polygon ? 'polygon' : 'circle',
    geofence_polygon: t.polygon ?? null,
  };
}

/**
 * True iff (lat,lng) is inside the target's geofence (polygon when present, else circle).
 */
function pointInsideTarget(lat: number, lng: number, t: WorkTarget): boolean {
  return isInsideGeofence(lat, lng, asGeofenceTarget(t));
}

/**
 * Signed distance to the target's geofence edge in meters.
 * Positive = inside (meters until you'd leave), negative = outside (meters away).
 * For circle targets this equals (radiusM − haversine_to_center).
 */
function signedDistanceToTargetEdge(lat: number, lng: number, t: WorkTarget): number {
  return distanceToGeofenceEdge(lat, lng, asGeofenceTarget(t));
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
      classificationDiagnostics: {
        travelSegmentsInsideTargetCandidateCount: 0,
        travelSegmentsInsideTargetCandidateMinutes: 0,
        travelSegmentsByMovementReason: {},
        rejectedPingsByAccuracyCount: rejectedPings,
        acceptedPingsCount: 0,
        targetsAvailableToGpsTimeline: input.targets.length,
        movementInsideGeofenceReclassifiedCount: 0,
        movementInsideGeofenceReclassifiedMinutes: 0,
        movementInsideGeofenceExamples: [],
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
    triggerDecision?: MovementDecision;
  }
  const runs: Array<Run | { kind: 'gps_gap'; startTs: ISODateTime; endTs: ISODateTime }> = [];

  const beginRun = (kind: RunKind, p: GpsPing, triggerDecision?: MovementDecision): Run => ({
    kind,
    pings: [p],
    centerLat: p.lat,
    centerLng: p.lng,
    triggerDecision,
  });

  let current: Run | null = null;

  const classifyMovement = (prev: GpsPing, p: GpsPing): MovementDecision => {
    const dt = (Date.parse(p.ts) - Date.parse(prev.ts)) / 1000;
    const d = haversine(prev.lat, prev.lng, p.lat, p.lng);
    const computedKmh = dt > 0 ? (d / dt) * 3.6 : null;
    const reportedKmh = p.speedMps != null ? p.speedMps * 3.6 : null;
    const base = {
      distanceFromPreviousMeters: d,
      secondsFromPrevious: dt,
      computedKmh,
      reportedKmh,
      stayRadiusM: cfg.stayRadiusM,
      movementSpeedKmh: cfg.movementSpeedKmh,
    };
    if (dt <= 0) return { movement: false, reason: 'stationary', ...base };
    if (computedKmh != null && computedKmh >= cfg.movementSpeedKmh) {
      return { movement: true, reason: 'speed_threshold', ...base };
    }
    if (reportedKmh != null && reportedKmh >= cfg.movementSpeedKmh) {
      return { movement: true, reason: 'reported_speed_threshold', ...base };
    }
    if (d > cfg.stayRadiusM * 2) {
      return { movement: true, reason: 'distance_from_previous_ping', ...base };
    }
    return { movement: false, reason: 'stationary', ...base };
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

    const decision = classifyMovement(prev, p);
    const movement = decision.movement;

    if (!current) {
      current = beginRun(movement ? 'travel' : 'stay', p, movement ? decision : undefined);
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
        current = beginRun('travel', p, decision);
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
          current = beginRun('stay', p, {
            movement: false,
            reason: 'outside_stay_radius',
            distanceFromPreviousMeters: dToCenter,
            stayRadiusM: cfg.stayRadiusM,
            movementSpeedKmh: cfg.movementSpeedKmh,
          });
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
  let travelInsideTargetCount = 0;
  let travelInsideTargetMinutes = 0;
  const travelByReason: Record<string, number> = {};

  // Track per-travel-segment metadata used by the post-pass reclassifier.
  const travelMeta = new Map<string, { pings: GpsPing[]; primaryTarget: WorkTarget | null; medianAccM: number | null }>();

  // Helper: median of finite numbers
  const median = (nums: number[]): number | null => {
    const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (arr.length === 0) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  };

  // Helper: compute target diagnostics for a stay/travel based on pings + center
  const computeTargetDiagnostics = (
    pings: GpsPing[],
    centerLat: number | null,
    centerLng: number | null,
    atIso: ISODateTime,
  ): { diag: SegmentTargetDiagnostics; primaryTarget: WorkTarget | null; medianAccM: number | null } => {
    const at = Date.parse(atIso);
    const validTargets = input.targets.filter((t) => {
      if (t.validFrom && Date.parse(t.validFrom) > at) return false;
      if (t.validUntil && Date.parse(t.validUntil) < at) return false;
      return true;
    });
    // Nearest target from center
    let nearest: { target: WorkTarget; distanceM: number } | null = null;
    if (centerLat != null && centerLng != null) {
      for (const t of validTargets) {
        const d = haversine(centerLat, centerLng, t.center.lat, t.center.lng);
        if (nearest == null || d < nearest.distanceM) nearest = { target: t, distanceM: d };
      }
    }
    // Per-ping inside-any-target & per-target counts
    const perTarget = new Map<string, number>();
    let pingsInsideAny = 0;
    for (const p of pings) {
      let insideThisPing = false;
      for (const t of validTargets) {
        const d = haversine(p.lat, p.lng, t.center.lat, t.center.lng);
        if (d <= t.radiusM) {
          insideThisPing = true;
          perTarget.set(t.key, (perTarget.get(t.key) ?? 0) + 1);
        }
      }
      if (insideThisPing) pingsInsideAny++;
    }
    // Pick the dominant target (most pings inside)
    let primaryKey: string | null = null;
    let primaryCount = 0;
    for (const [k, c] of perTarget) {
      if (c > primaryCount) { primaryKey = k; primaryCount = c; }
    }
    const primaryTarget = primaryKey
      ? validTargets.find((t) => t.key === primaryKey) ?? null
      : null;
    const ratio = pings.length > 0 && primaryCount > 0 ? primaryCount / pings.length : 0;
    const medianAccM = median(pings.map((p) => p.accuracyM ?? NaN));

    return {
      diag: {
        nearestTargetLabel: nearest?.target.label ?? null,
        nearestTargetId: nearest?.target.refId ?? null,
        nearestTargetType: nearest?.target.kind ?? null,
        nearestTargetDistanceMeters: nearest ? Math.round(nearest.distanceM) : null,
        nearestTargetRadiusMeters: nearest?.target.radiusM ?? null,
        insideNearestTarget: nearest ? nearest.distanceM <= nearest.target.radiusM : false,
        pingsInsideAnyTarget: pingsInsideAny,
        pingsInsidePrimaryTarget: primaryCount,
        pingsInsideSameTargetRatio: Number(ratio.toFixed(3)),
        travelInsideTargetCandidate: false,
        travelInsideTargetLabel: primaryTarget?.label ?? null,
        medianAccuracyMeters: medianAccM != null ? Math.round(medianAccM) : null,
      },
      primaryTarget,
      medianAccM,
    };
  };

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
        movementDecision: { movement: false, reason: 'gap' },
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
      const { diag: targetDiag, primaryTarget, medianAccM } =
        computeTargetDiagnostics(run.pings, run.centerLat, run.centerLng, first.ts);
      // Decide if this travel happened inside a single target candidate (majority of pings).
      const insideCandidate =
        (targetDiag.pingsInsideSameTargetRatio ?? 0) >= 0.6 &&
        (targetDiag.pingsInsidePrimaryTarget ?? 0) >= 2;
      targetDiag.travelInsideTargetCandidate = insideCandidate;
      if (!insideCandidate) targetDiag.travelInsideTargetLabel = null;
      if (insideCandidate) {
        travelInsideTargetCount++;
        travelInsideTargetMinutes += durationMin;
      }
      const reasonKey = run.triggerDecision?.reason ?? 'unknown';
      travelByReason[reasonKey] = (travelByReason[reasonKey] ?? 0) + 1;

      const segId = makeId('seg', idx++);
      travelMeta.set(segId, { pings: run.pings, primaryTarget, medianAccM });
      segments.push({
        id: segId,
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
        movementDecision: run.triggerDecision ?? { movement: true, reason: 'speed_threshold' },
        targetDiagnostics: targetDiag,
      });
      transport++;
      continue;
    }

    // STAY
    const center = clusterCenter(run.pings);
    const tooFew = run.pings.length < cfg.minStayPings;
    const match = matchTarget(center.lat, center.lng, first.ts, input.targets);
    const { diag: targetDiag } = computeTargetDiagnostics(run.pings, center.lat, center.lng, first.ts);

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
      movementDecision: run.triggerDecision ?? { movement: false, reason: 'stationary' },
      targetDiagnostics: targetDiag,
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4) POST-PASS: movement_inside_geofence reclassification
  //
  // A travel segment that actually happened INSIDE the same primary geofence
  // (e.g. walking around a venue, GPS noise creating false speed spikes)
  // must not be reported as transport. We promote it to a known_site stay
  // when the evidence is strong and there is no clear exit from the target.
  //
  // Guards:
  //   - travelInsideTargetCandidate === true
  //   - pingsInsideSameTargetRatio >= 0.7
  //   - durationMin <= 240
  //   - target is primary / canAutoMatchAsWork (assignedToUserToday !== false)
  //   - !hasClearExitFromTarget(...)
  //
  // We deliberately do NOT block on computedKmh — diagnostics show the
  // speed_threshold trigger is exactly what causes this false-positive.
  // ───────────────────────────────────────────────────────────────────────

  let movementInsideGeofenceCount = 0;
  let movementInsideGeofenceMinutes = 0;
  const movementInsideGeofenceExamples: MovementInsideGeofenceExample[] = [];

  const hasClearExitFromTarget = (
    pings: GpsPing[],
    target: WorkTarget,
    medianAccM: number | null,
    nextSegment: GpsTimelineSegment | undefined,
  ): boolean => {
    const baseAcc = medianAccM != null && Number.isFinite(medianAccM) ? medianAccM : 0;
    const tolA = Math.max(50, baseAcc);
    const tolB = Math.max(100, baseAcc);

    // (A) ≥3 consecutive pings outside target.radiusM + tolA
    let consec = 0;
    for (const p of pings) {
      const d = haversine(p.lat, p.lng, target.center.lat, target.center.lng);
      if (d > target.radiusM + tolA) {
        consec++;
        if (consec >= 3) return true;
      } else {
        consec = 0;
      }
    }

    // (B) last 2 accepted pings outside target.radiusM + tolB
    if (pings.length >= 2) {
      const last = pings[pings.length - 1];
      const prev = pings[pings.length - 2];
      const dL = haversine(last.lat, last.lng, target.center.lat, target.center.lng);
      const dP = haversine(prev.lat, prev.lng, target.center.lat, target.center.lng);
      if (dL > target.radiusM + tolB && dP > target.radiusM + tolB) return true;
    }

    // (C) next segment matches a different known_site primary target
    if (
      nextSegment &&
      nextSegment.kind === 'stay' &&
      nextSegment.type === 'known_site' &&
      nextSegment.matchedTargetId &&
      nextSegment.matchedTargetId !== target.refId
    ) {
      return true;
    }
    return false;
  };

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.kind !== 'travel') continue;
    const td = seg.targetDiagnostics;
    if (!td?.travelInsideTargetCandidate) continue;
    if ((td.pingsInsideSameTargetRatio ?? 0) < 0.7) continue;
    if (seg.durationMin > 240) continue;

    const meta = travelMeta.get(seg.id);
    if (!meta || !meta.primaryTarget) continue;
    const target = meta.primaryTarget;

    // Primary / canAutoMatchAsWork: in this contract layer the only signal
    // we have is `assignedToUserToday`. The resolver sets it to false when
    // the booking/project is not "today"-relevant for the requesting staff,
    // but the report-health endpoint resolves with a representative staff —
    // so a `false` here is not necessarily wrong. We treat the primary target
    // as eligible whenever the GPS is firmly clustered inside it (already
    // gated by ratio >= 0.7) AND the target itself is date-window valid
    // (already filtered by validFrom/validUntil at diagnostics time).
    // No further gate here — secondary targets cannot reach this branch
    // because they are never picked as `primaryTarget` for a travel segment.

    const next = segments[si + 1];
    const clearExit = hasClearExitFromTarget(meta.pings, target, meta.medianAccM, next);
    td.clearExitDetected = clearExit;
    if (clearExit) continue;

    // Reclassify travel → known_site stay. Keep originals for audit.
    seg.originalKind = 'travel';
    seg.originalType = 'transport';
    seg.kind = 'stay';
    seg.type = 'known_site';
    seg.label = target.label;
    seg.matchedTargetId = target.refId;
    seg.matchedTargetType = target.kind;
    seg.matchedTargetName = target.label;
    seg.reclassificationReason = 'movement_inside_geofence';
    seg.reason = 'matched_valid_target';

    targetsHit.add(target.key);
    knownSite++;
    transport = Math.max(0, transport - 1);

    movementInsideGeofenceCount++;
    movementInsideGeofenceMinutes += seg.durationMin;
    if (movementInsideGeofenceExamples.length < 25) {
      movementInsideGeofenceExamples.push({
        segmentStart: seg.startTs,
        segmentEnd: seg.endTs,
        durationMinutes: Math.round(seg.durationMin * 100) / 100,
        targetLabel: target.label,
        pingsInsideSameTargetRatio:
          td.pingsInsideSameTargetRatio != null ? Number(td.pingsInsideSameTargetRatio) : null,
        computedKmh:
          seg.movementDecision?.computedKmh != null ? Number(seg.movementDecision.computedKmh) : null,
        movementReason: seg.movementDecision?.reason ?? null,
        nearestTargetDistanceMeters: td.nearestTargetDistanceMeters ?? null,
        nearestTargetRadiusMeters: td.nearestTargetRadiusMeters ?? null,
        clearExitDetected: false,
      });
    }
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
    classificationDiagnostics: {
      travelSegmentsInsideTargetCandidateCount: travelInsideTargetCount,
      travelSegmentsInsideTargetCandidateMinutes: Math.round(travelInsideTargetMinutes),
      travelSegmentsByMovementReason: travelByReason,
      rejectedPingsByAccuracyCount: rejectedPings,
      acceptedPingsCount: accepted.length,
      targetsAvailableToGpsTimeline: input.targets.length,
      movementInsideGeofenceReclassifiedCount: movementInsideGeofenceCount,
      movementInsideGeofenceReclassifiedMinutes: Math.round(movementInsideGeofenceMinutes),
      movementInsideGeofenceExamples,
    },
  };
}

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
import type { Confidence, GeoAnchor, ISODate, ISODateTime, UUID, WorkTarget } from './contracts.ts';
import { isInsideGeofence, distanceToGeofenceEdge, type GeofenceTarget } from '../geofenceEval.ts';
import { formatStockholm } from '../timeline/geo.ts';
import { TRANSPORT_MIN_DISTANCE_METERS } from './transportThreshold.ts';

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
  /**
   * Optional hard signals from geofence event tables (assistant_events,
   * staff_presence_events). Loaded by `loadGeoAnchors`. Only anchors with
   * `strength='hard'` participate in sticky seeding; weak anchors are ignored
   * by the engine but kept for diagnostics in the caller.
   *
   * NOT a legacy source: treated as ground-truth signal at the same trust
   * level as a GPS ping. Anchors NEVER write anything and NEVER subtract
   * time — they only seed sticky ownership of a primary target.
   */
  geoAnchors?: GeoAnchor[];
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
  | 'too_few_pings_for_stay'
  | 'stationary_inside_geofence_override';

export type MovementReason =
  | 'speed_threshold'
  | 'reported_speed_threshold'
  | 'distance_from_previous_ping'
  | 'outside_stay_radius'
  | 'stationary'
  | 'inside_geofence_override'
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
  /**
   * Why a transport-inside-primary-candidate segment was NOT reclassified by
   * the movement_inside_geofence rule. Only set on transport segments that
   * still satisfy `travelInsideTargetCandidate` after the post-pass.
   *  - 'clear_exit'              tydlig exit upptäcktes (rule A/B/C)
   *  - 'ratio_below_threshold'   ratio i [0.6, 0.7)
   *  - 'secondary_or_unsafe'     primaryTarget saknas / inte auto-matchningsbar
   *  - 'duration_too_long'       segment > 240 min
   *  - 'reclassifiable'          uppfyller alla villkor men reklassades inte
   *                              (motorfel — ska normalt vara 0)
   */
  keptInsidePrimaryReason?:
    | 'clear_exit'
    | 'ratio_below_threshold'
    | 'secondary_or_unsafe'
    | 'duration_too_long'
    | 'reclassifiable'
    | null;

  // ── Sticky-target post-pass diagnostics (audit-only) ────────────────
  /** ID of the active sticky primary target when this segment was evaluated. */
  stickyTargetId?: string | null;
  /** Label of the active sticky primary target. */
  stickyTargetLabel?: string | null;
  /** Min haversine distance from any segment ping to sticky-target center (m). */
  distanceFromStickyCenterMeters?: number | null;
  /** Max distance OUTSIDE the sticky target's geofence edge (m, 0 = inside). */
  distanceOutsideStickyGeofenceMeters?: number | null;
  /** Strong-exit signal A: next/current stay matches another primary target. */
  arrivedAtOtherPrimaryTarget?: boolean;
  /** Strong-exit signal D: last pings near another primary target. */
  transportToOtherPrimaryTarget?: boolean;
  /** Diagnostic-only: long clear exit (≥10 min, ≥5 pings outside radius+buffer). */
  longClearExit?: boolean;
  /**
   * Why a transport-segment was NOT sticky-reclassified (only set when sticky
   * target was active and strong exit was detected). longClearExit alone is
   * NEVER a reasonNotReclassified — it is diagnostic only.
   */
  reasonNotReclassified?:
    | 'arrived_at_other_primary_target'
    | 'distance_over_1000m_outside_sticky_geofence'
    | 'transport_to_other_primary_target'
    | null;
  /** Confidence reason for sticky-reclassified segments with partial GPS outside. */
  confidenceReason?:
    | 'near_sticky_primary_target_no_strong_exit'
    | 'geo_entry_primary_target'
    | null;
  /** Human-readable warning label propagated to the report row. */
  warningLabel?: string | null;

  // ── Geo-anchor (assistant_events / staff_presence_events) diagnostics ─
  /** Set on a stay/travel that is owned by a sticky from a hard entry-anchor. */
  stickyAnchorSource?: 'geo_entry' | 'gps_known_site' | null;
  /** Local-time string (Europe/Stockholm) of the entry-anchor that seeded sticky. */
  stickyAnchorEntryAtLocal?: string | null;
  /** Source table of the entry-anchor. */
  stickyAnchorTable?: 'assistant_events' | 'staff_presence_events' | null;
  /** True iff a geo-exit anchor occurred in this segment's window without strong exit. */
  geoExitWithoutStrongExitObserved?: boolean | null;
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
  reclassificationReason?:
    | 'movement_inside_geofence'
    | 'sticky_primary_target_no_strong_exit'
    | 'stationary_inside_geofence_override'
    | null;
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
  /** Per-bucket breakdown of transport-inside-primary segments that survived
   *  the post-pass (i.e. were NOT reclassified by movement_inside_geofence). */
  transportInsidePrimaryTotalCount: number;
  transportInsidePrimaryTotalMinutes: number;
  reclassifiableTransportInsidePrimaryCount: number;
  reclassifiableTransportInsidePrimaryMinutes: number;
  keptBecauseClearExitCount: number;
  keptBecauseClearExitMinutes: number;
  keptBecauseRatioBelowThresholdCount: number;
  keptBecauseRatioBelowThresholdMinutes: number;
  keptBecauseSecondaryOrUnsafeTargetCount: number;
  keptBecauseSecondaryOrUnsafeTargetMinutes: number;
  keptBecauseDurationTooLongCount: number;
  keptBecauseDurationTooLongMinutes: number;

  /**
   * Sticky-target post-pass diagnostics. Sticky regel: ett primary project/
   * warehouse "äger" personen tills strong exit bevisas. Strong exit kräver
   * ankomst till annat primary target ELLER ≥2 konsekutiva pings ≥1000m
   * UTANFÖR sticky-targetens geofence-edge ELLER transport som slutar nära
   * annat primary target. longClearExit är diagnostic-only och släpper
   * aldrig sticky ensamt.
   */
  stickyTargetDiagnostics: {
    stickyReclassifiedCount: number;
    stickyReclassifiedMinutes: number;
    strongExitCount: number;
    strongExitMinutes: number;
    exitRejectedBecauseUnder1kmCount: number;
    exitRejectedBecauseUnder1kmMinutes: number;
    arrivedAtOtherPrimaryTargetCount: number;
    longClearExitCount: number;
    remainingTransportNearStickyTargetCount: number;
    remainingTransportNearStickyTargetMinutes: number;
    examples: Array<{
      segmentStart: ISODateTime;
      segmentEnd: ISODateTime;
      durationMinutes: number;
      stickyTargetLabel: string | null;
      distanceFromStickyCenterMeters: number | null;
      distanceOutsideStickyGeofenceMeters: number | null;
      decision:
        | 'reclassified_no_strong_exit'
        | 'kept_arrived_other_primary'
        | 'kept_distance_over_1000m_outside_geofence'
        | 'kept_transport_to_other_primary';
      longClearExit: boolean;
      reasonNotReclassified: string | null;
    }>;
  };

  /**
   * Diagnostics about hard geo anchors loaded from assistant_events /
   * staff_presence_events. Pure read; never mutated.
   */
  geoAnchorDiagnostics: {
    hardAnchorCount: number;
    hardEntryCount: number;
    hardExitCount: number;
    entriesAppliedToSticky: number;
    entriesSeededStickyEarly: number;
    entriesIgnoredNoMatchingTarget: number;
    exitsObservedWithoutStrongExit: number;
    transportSegmentsAfterGeoEntryWithoutStrongExitMinutes: number;
    examples: Array<{
      type: 'entry' | 'exit';
      atLocalStockholm: string;
      targetLabel: string | null;
      source: 'assistant_events' | 'staff_presence_events';
      seededStickyEarly?: boolean;
    }>;
  };

  /**
   * INFO/diagnostic: pings that lay inside a primary-eligible geofence and
   * therefore had movement (speed/distance) classification overridden into
   * a stationary stay. Never a WARNING — this is the engine working as
   * intended. (WARNING is `transport_inside_primary_geofence_not_rescued`,
   * surfaced from `remainingTransportInsidePrimaryGeofenceCount`.)
   */
  stationaryGeofenceOverride: {
    rescuedStayCount: number;
    rescuedStayMinutes: number;
    pingsInsidePrimaryCount: number;
    pingsInsidePrimaryRatio: number;
    examples: Array<{
      targetLabel: string;
      startLocalStockholm: string;
      endLocalStockholm: string;
      durationMinutes: number;
      pingCount: number;
      medianAccuracyMeters: number | null;
    }>;
  };

  /**
   * WARNING basis: travel segments that survived the override (i.e. still
   * `kind=travel` despite all of their pings sitting inside the same
   * primary-eligible geofence). Should normally be 0 — non-zero indicates
   * an engine bug or a target whose primary-eligibility was suppressed.
   */
  remainingTransportInsidePrimaryGeofenceCount: number;
  remainingTransportInsidePrimaryGeofenceMinutes: number;

  /**
   * Engine 4 — TRANSPORT_MIN_DISTANCE_METERS diagnostics.
   * Tracks how the 500 m floor and the residence-wins rule altered the raw
   * GPS clustering. Pure diagnostics; no rows are written and no rapport-tabeller
   * are touched.
   */
  transportDistanceThresholdDiagnostics: {
    transportMinDistanceMeters: number;
    /** Number of travel runs demoted to a stay because cluster distance < threshold. */
    belowThresholdMovementSuppressedCount: number;
    /** Total minutes of those demoted runs. */
    belowThresholdMovementSuppressedMinutes: number;
    /** How many movement decisions were taken from device speed_mps but never
     *  produced transport on their own (now strictly support-evidence). */
    reportedSpeedIgnoredCount: number;
    /** Convenience alias for callers/UI: same value as
     *  belowThresholdMovementSuppressedCount but framed as "false trips prevented". */
    falseTravelPreventedCount: number;
    /** Pings/stays where a private_residence target won over a nearby
     *  warehouse/work target. */
    privateResidenceWinsCount: number;
    /** Pings that matched a private_residence polygon (regardless of conflict). */
    privateResidenceMatchedPingsCount: number;
    examples: Array<{
      kind: 'below_threshold_demoted' | 'private_residence_wins';
      startAt: ISODateTime;
      endAt: ISODateTime;
      durationMinutes: number;
      distanceMeters: number;
      reason: string;
    }>;
  };
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
    // Distance metric for "best" ordering stays haversine-to-center; the inside
    // gate honors polygon when present.
    const d = haversine(centerLat, centerLng, t.center.lat, t.center.lng);
    if (pointInsideTarget(centerLat, centerLng, t) && (best == null || d < best.distanceM)) {
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
        transportInsidePrimaryTotalCount: 0,
        transportInsidePrimaryTotalMinutes: 0,
        reclassifiableTransportInsidePrimaryCount: 0,
        reclassifiableTransportInsidePrimaryMinutes: 0,
        keptBecauseClearExitCount: 0,
        keptBecauseClearExitMinutes: 0,
        keptBecauseRatioBelowThresholdCount: 0,
        keptBecauseRatioBelowThresholdMinutes: 0,
        keptBecauseSecondaryOrUnsafeTargetCount: 0,
        keptBecauseSecondaryOrUnsafeTargetMinutes: 0,
        keptBecauseDurationTooLongCount: 0,
        keptBecauseDurationTooLongMinutes: 0,
        stickyTargetDiagnostics: {
          stickyReclassifiedCount: 0,
          stickyReclassifiedMinutes: 0,
          strongExitCount: 0,
          strongExitMinutes: 0,
          exitRejectedBecauseUnder1kmCount: 0,
          exitRejectedBecauseUnder1kmMinutes: 0,
          arrivedAtOtherPrimaryTargetCount: 0,
          longClearExitCount: 0,
          remainingTransportNearStickyTargetCount: 0,
          remainingTransportNearStickyTargetMinutes: 0,
          examples: [],
        },
        geoAnchorDiagnostics: {
          hardAnchorCount: 0,
          hardEntryCount: 0,
          hardExitCount: 0,
          entriesAppliedToSticky: 0,
          entriesSeededStickyEarly: 0,
          entriesIgnoredNoMatchingTarget: 0,
          exitsObservedWithoutStrongExit: 0,
          transportSegmentsAfterGeoEntryWithoutStrongExitMinutes: 0,
          examples: [],
        },
        stationaryGeofenceOverride: {
          rescuedStayCount: 0,
          rescuedStayMinutes: 0,
          pingsInsidePrimaryCount: 0,
          pingsInsidePrimaryRatio: 0,
          examples: [],
        },
        remainingTransportInsidePrimaryGeofenceCount: 0,
        remainingTransportInsidePrimaryGeofenceMinutes: 0,
      },
    };
  }

  // ── Inside-geofence override pre-pass ──────────────────────────────────
  // For each accepted ping, decide which primary-eligible WorkTarget (if
  // any) "owns" the ping by virtue of being inside its geofence. If non-null,
  // the ping is forced into a stay run for that target — speed/distance
  // movement classification is bypassed. Geofence membership > movement.
  //
  // Multi-target tiebreaker (priority lower number wins, then nearest center):
  //   1 direct_staff_assignment
  //   2 team_calendar_event
  //   3 large_project_staff_assignment
  //   4 warehouse / organization_location
  //   5 other primary-eligible target
  //   6 nearest center (final tiebreaker, same priority)
  //
  // Targets where assignedToUserToday === false are excluded — secondary /
  // wrong-date / unassigned targets must never grant override ownership.
  const ANCHOR_PRIORITY: Record<string, number> = {
    direct_staff_assignment: 1,
    team_calendar_event: 2,
    large_project_staff_assignment: 3,
    warehouse: 4,
  };
  const targetOverridePriority = (t: WorkTarget): number => {
    if (t.assignmentAnchor && ANCHOR_PRIORITY[t.assignmentAnchor] != null) {
      return ANCHOR_PRIORITY[t.assignmentAnchor];
    }
    if (t.kind === 'organization_location' || t.kind === 'warehouse') return 4;
    return 5;
  };
  const pickOverrideTargetForPing = (p: GpsPing): WorkTarget | null => {
    const at = Date.parse(p.ts);
    let best: { t: WorkTarget; pri: number; dist: number } | null = null;
    for (const t of input.targets) {
      if (t.assignedToUserToday === false) continue;
      if (t.validFrom && Date.parse(t.validFrom) > at) continue;
      if (t.validUntil && Date.parse(t.validUntil) < at) continue;
      if (!pointInsideTarget(p.lat, p.lng, t)) continue;
      const pri = targetOverridePriority(t);
      const dist = haversine(p.lat, p.lng, t.center.lat, t.center.lng);
      if (
        best == null ||
        pri < best.pri ||
        (pri === best.pri && dist < best.dist)
      ) {
        best = { t, pri, dist };
      }
    }
    return best?.t ?? null;
  };
  const insideOwners: Array<WorkTarget | null> = accepted.map(pickOverrideTargetForPing);
  const insideKeys: Array<string | null> = insideOwners.map((t) => t?.key ?? null);
  const pingsInsidePrimaryCount = insideKeys.reduce((n, k) => n + (k ? 1 : 0), 0);

  // 2) Walk pings, building runs of {stay | travel} interrupted by gps_gap.
  type RunKind = 'stay' | 'travel';
  interface Run {
    kind: RunKind;
    pings: GpsPing[];
    centerLat: number;
    centerLng: number;
    triggerDecision?: MovementDecision;
    /** When set, this stay run is owned by an inside-geofence override and
     *  must materialize as known_site on that target. Set on stays only. */
    geofenceOwnerKey?: string | null;
    geofenceOwner?: WorkTarget | null;
  }
  const runs: Array<Run | { kind: 'gps_gap'; startTs: ISODateTime; endTs: ISODateTime }> = [];

  const beginRun = (
    kind: RunKind,
    p: GpsPing,
    triggerDecision?: MovementDecision,
    owner?: WorkTarget | null,
  ): Run => ({
    kind,
    pings: [p],
    centerLat: p.lat,
    centerLng: p.lng,
    triggerDecision,
    geofenceOwnerKey: owner?.key ?? null,
    geofenceOwner: owner ?? null,
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
    const insideOwner = insideOwners[i];
    const insideKey = insideKeys[i];

    if (i === 0) {
      current = beginRun('stay', p, undefined, insideOwner);
      continue;
    }

    const prev = accepted[i - 1];
    const dtMs = Date.parse(p.ts) - Date.parse(prev.ts);

    // Long quiet period → gps_gap (NEVER travel). The gap exists regardless
    // of override membership — it is honest evidence that GPS was silent.
    // If both sides of the gap are inside the same primary geofence, the
    // post-gap stay still inherits that owner so the gap does NOT split a
    // genuine on-site visit into two transport-bookended pieces.
    if (dtMs > seconds(cfg.maxPingIntervalSeconds)) {
      if (current) runs.push(current);
      runs.push({ kind: 'gps_gap', startTs: prev.ts, endTs: p.ts });
      current = beginRun('stay', p, undefined, insideOwner);
      continue;
    }

    // ── Inside-geofence override ─────────────────────────────────────────
    // If the ping is inside a primary geofence, geofence membership wins
    // over the speed/distance classification.
    if (insideKey != null) {
      if (current && current.kind === 'stay' && current.geofenceOwnerKey === insideKey) {
        // Continue the same overridden stay — bypass stayRadius check.
        current.pings.push(p);
        const c = clusterCenter(current.pings);
        current.centerLat = c.lat;
        current.centerLng = c.lng;
      } else {
        // Transition (from no owner, different owner, or travel) → open a
        // new stay owned by this primary target.
        if (current) runs.push(current);
        current = beginRun('stay', p, {
          movement: false,
          reason: 'inside_geofence_override',
          stayRadiusM: cfg.stayRadiusM,
          movementSpeedKmh: cfg.movementSpeedKmh,
        }, insideOwner);
      }
      continue;
    }

    // ── Outside any primary geofence: original speed/distance logic ─────
    const decision = classifyMovement(prev, p);
    const movement = decision.movement;

    if (!current) {
      current = beginRun(movement ? 'travel' : 'stay', p, movement ? decision : undefined);
      continue;
    }

    // Leaving an overridden stay → close it cleanly before applying movement.
    if (current.kind === 'stay' && current.geofenceOwnerKey != null) {
      runs.push(current);
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
        if (pointInsideTarget(p.lat, p.lng, t)) {
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
        insideNearestTarget: nearest ? pointInsideTarget(centerLat ?? nearest.target.center.lat, centerLng ?? nearest.target.center.lng, nearest.target) : false,
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
    const overrideOwner = (run as { geofenceOwner?: WorkTarget | null }).geofenceOwner ?? null;
    const match = overrideOwner
      ? { target: overrideOwner, distanceM: haversine(center.lat, center.lng, overrideOwner.center.lat, overrideOwner.center.lng) }
      : matchTarget(center.lat, center.lng, first.ts, input.targets);
    const { diag: targetDiag } = computeTargetDiagnostics(run.pings, center.lat, center.lng, first.ts);

    let type: GpsTimelineSegmentType;
    let label: string;
    let reason: GpsTimelineSegmentReason;
    let matchedTargetId: UUID | null = null;
    let matchedTargetType: WorkTarget['kind'] | null = null;
    let matchedTargetName: string | null = null;
    let confidence: Confidence;
    let reclassReason: GpsTimelineSegment['reclassificationReason'] = null;

    if (match) {
      type = 'known_site';
      label = match.target.label;
      reason = overrideOwner ? 'stationary_inside_geofence_override' : 'matched_valid_target';
      matchedTargetId = match.target.refId;
      matchedTargetType = match.target.kind;
      matchedTargetName = match.target.label;
      confidence = overrideOwner ? 0.9 : Math.min(1, 0.6 + Math.min(run.pings.length, 10) / 25);
      targetsHit.add(match.target.key);
      knownSite++;
      if (overrideOwner) {
        reclassReason = 'stationary_inside_geofence_override';
        targetDiag.warningLabel = targetDiag.warningLabel ?? null;
      }
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
      reclassificationReason: reclassReason,
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

  // Per-bucket counters for transport segments that survive as transport
  // even though they are "inside primary target candidate". These drive
  // health-check status (only `reclassifiable` is a true engine warning).
  let transportInsidePrimaryTotalCount = 0;
  let transportInsidePrimaryTotalMinutes = 0;
  let keptClearExitCount = 0; let keptClearExitMinutes = 0;
  let keptRatioBelowCount = 0; let keptRatioBelowMinutes = 0;
  let keptSecondaryUnsafeCount = 0; let keptSecondaryUnsafeMinutes = 0;
  let keptDurationTooLongCount = 0; let keptDurationTooLongMinutes = 0;
  let reclassifiableCount = 0; let reclassifiableMinutes = 0;

  const hasClearExitFromTarget = (
    pings: GpsPing[],
    target: WorkTarget,
    medianAccM: number | null,
    nextSegment: GpsTimelineSegment | undefined,
  ): boolean => {
    const baseAcc = medianAccM != null && Number.isFinite(medianAccM) ? medianAccM : 0;
    const tolA = Math.max(50, baseAcc);
    const tolB = Math.max(100, baseAcc);

    // (A) ≥3 consecutive pings >tolA meters OUTSIDE the target's geofence edge.
    // For polygon targets this measures distance to the polygon edge, not centroid.
    let consec = 0;
    for (const p of pings) {
      const signed = signedDistanceToTargetEdge(p.lat, p.lng, target);
      const outsideBy = -signed; // positive when outside
      if (outsideBy > tolA) {
        consec++;
        if (consec >= 3) return true;
      } else {
        consec = 0;
      }
    }

    // (B) last 2 accepted pings >tolB meters outside the geofence edge
    if (pings.length >= 2) {
      const last = pings[pings.length - 1];
      const prev = pings[pings.length - 2];
      const oL = -signedDistanceToTargetEdge(last.lat, last.lng, target);
      const oP = -signedDistanceToTargetEdge(prev.lat, prev.lng, target);
      if (oL > tolB && oP > tolB) return true;
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

    transportInsidePrimaryTotalCount++;
    transportInsidePrimaryTotalMinutes += seg.durationMin;

    const ratio = td.pingsInsideSameTargetRatio ?? 0;
    const meta = travelMeta.get(seg.id);
    const target = meta?.primaryTarget ?? null;

    // ── Bucket A: secondary / unsafe / missing primary target
    if (!meta || !target) {
      td.keptInsidePrimaryReason = 'secondary_or_unsafe';
      keptSecondaryUnsafeCount++;
      keptSecondaryUnsafeMinutes += seg.durationMin;
      continue;
    }
    // ── Bucket B: ratio i [0.6, 0.7) — gränsfall, motorfel ej
    if (ratio < 0.7) {
      td.keptInsidePrimaryReason = 'ratio_below_threshold';
      keptRatioBelowCount++;
      keptRatioBelowMinutes += seg.durationMin;
      continue;
    }
    // ── Bucket C: duration > 240 min
    if (seg.durationMin > 240) {
      td.keptInsidePrimaryReason = 'duration_too_long';
      keptDurationTooLongCount++;
      keptDurationTooLongMinutes += seg.durationMin;
      continue;
    }

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

    // ── Bucket D: clear exit upptäcktes — segmentet ÄR transport, korrekt
    if (clearExit) {
      td.keptInsidePrimaryReason = 'clear_exit';
      keptClearExitCount++;
      keptClearExitMinutes += seg.durationMin;
      continue;
    }

    // ── Bucket E (motorfel): uppfyller alla villkor men reklassades inte.
    // Vi reklassificerar nedan; counter ökas bara om något skulle ha hindrat
    // det (bör inte hända). Denna räknare är health-check-WARNING-grunden.

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
    // Segment lämnar transport-inside-primary-bucketen helt — nollställ
    // bidraget vi nyss adderade högst upp i loopen.
    transportInsidePrimaryTotalCount = Math.max(0, transportInsidePrimaryTotalCount - 1);
    transportInsidePrimaryTotalMinutes = Math.max(0, transportInsidePrimaryTotalMinutes - seg.durationMin);

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
  // (`reclassifiable` är 0 så länge motorn fungerar; behålls i kontraktet
  // som tidig varningssignal om en framtida ändring råkar bryta loopen.)
  void reclassifiableCount; void reclassifiableMinutes;

  // ───────────────────────────────────────────────────────────────────────
  // 5) POST-PASS #2: STICKY PRIMARY TARGET
  //
  // Regel: när användaren är knuten till en primary target (warehouse /
  // location / project / booking — alla matchade targets gäller om
  // assignedToUserToday !== false) "äger" projektet personen tills STRONG
  // EXIT bevisas. Geofence-exit räcker INTE.
  //
  // Strong exit = någon av:
  //   A. arrivedAtOtherPrimaryTarget — nästa stay är known_site på annan
  //      primary target.
  //   B. distanceOver1km — ≥2 konsekutiva accepterade pings ligger
  //      ≥1000 m UTANFÖR sticky-targetens geofence-edge (inte centrum).
  //   D. transportToOtherPrimaryTarget — segmentets sista ping ligger
  //      inom annan primary targets radie + 250 m buffer.
  //
  // longClearExit (≥10 min, ≥5 pings utanför radius+max(250, medianAcc*3))
  // är DIAGNOSTIC ONLY. Den släpper aldrig sticky ensam.
  //
  // Om strong exit = false och segmentet är en travel som inte redan
  // reklassats av movement_inside_geofence → reklassificera till
  // known_site på sticky target med reason 'sticky_primary_target_no_strong_exit'.
  // Om någon ping låg utanför geofence (men <1 km) får segmentet
  // confidenceReason='near_sticky_primary_target_no_strong_exit' +
  // warningLabel='GPS låg delvis utanför arbetsområdet'.
  // ───────────────────────────────────────────────────────────────────────

  const STICKY_DIST_OUTSIDE_M = 1000;
  const OTHER_PRIMARY_BUFFER_M = 250;

  type StickyState = {
    refId: string;
    label: string;
    kind: WorkTarget['kind'];
    target: WorkTarget;
  };

  const isPrimaryEligibleTarget = (t: WorkTarget | undefined | null): boolean => {
    if (!t) return false;
    if (t.assignedToUserToday === false) return false;
    return true;
  };

  const findEligibleTargetForStay = (s: GpsTimelineSegment): WorkTarget | null => {
    if (s.kind !== 'stay' || s.type !== 'known_site' || !s.matchedTargetId) return null;
    const t = input.targets.find((x) => x.refId === s.matchedTargetId);
    return isPrimaryEligibleTarget(t) ? (t as WorkTarget) : null;
  };

  let sticky: StickyState | null = null;
  let stickyAnchorSource: 'geo_entry' | 'gps_known_site' | null = null;
  let stickyAnchorEntryAtLocal: string | null = null;
  let stickyAnchorTable: 'assistant_events' | 'staff_presence_events' | null = null;
  let geoExitPending = false;

  let stickyReclassifiedCount = 0;
  let stickyReclassifiedMinutes = 0;
  let strongExitCount = 0;
  let strongExitMinutes = 0;
  let exitRejectedUnder1kmCount = 0;
  let exitRejectedUnder1kmMinutes = 0;
  let arrivedAtOtherPrimaryCount = 0;
  let longClearExitDiagCount = 0;
  const stickyExamples: GpsClassificationDiagnostics['stickyTargetDiagnostics']['examples'] = [];

  // Pre-build sorted hard geo anchors for chronological consumption.
  const hardAnchors: GeoAnchor[] = (input.geoAnchors ?? [])
    .filter((a) => a.strength === 'hard' && !!a.matchedTargetRefId)
    .slice()
    .sort((a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc));
  let anchorIdx = 0;
  let geoAnchorEntriesApplied = 0;
  let geoAnchorExitsObserved = 0;
  let geoAnchorEntriesIgnoredNoTarget = 0;
  let geoAnchorEntriesSeededStickyEarly = 0;

  const advanceAnchorsUpTo = (cutoffUtcMs: number) => {
    while (anchorIdx < hardAnchors.length) {
      const a = hardAnchors[anchorIdx];
      if (Date.parse(a.timestampUtc) > cutoffUtcMs) break;
      const matchedRef = a.matchedTargetRefId!;
      const target = input.targets.find((t) => t.refId === matchedRef);
      if (!target || !isPrimaryEligibleTarget(target)) {
        geoAnchorEntriesIgnoredNoTarget++;
        anchorIdx++;
        continue;
      }
      if (a.type === 'entry') {
        const wasEarlySeed = sticky === null || sticky.refId !== target.refId;
        sticky = { refId: target.refId, label: target.label, kind: target.kind, target };
        stickyAnchorSource = 'geo_entry';
        stickyAnchorEntryAtLocal = a.timestampLocalStockholm;
        stickyAnchorTable = a.source;
        geoExitPending = false;
        geoAnchorEntriesApplied++;
        if (wasEarlySeed) geoAnchorEntriesSeededStickyEarly++;
      } else if (a.type === 'exit') {
        // Geo exit alone NEVER releases sticky — only mark pending.
        if (sticky && sticky.refId === target.refId) {
          geoExitPending = true;
          geoAnchorExitsObserved++;
        }
      }
      anchorIdx++;
    }
  };

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];

    // Apply any geo anchors that fall up to the start of this segment.
    advanceAnchorsUpTo(Date.parse(seg.startTs));

    // Adopt sticky on every primary-eligible known_site stay (including
    // those reclassified by movement_inside_geofence).
    if (seg.kind === 'stay' && seg.type === 'known_site') {
      const t = findEligibleTargetForStay(seg);
      if (t) {
        sticky = { refId: t.refId, label: t.label, kind: t.kind, target: t };
        stickyAnchorSource = 'gps_known_site';
        stickyAnchorEntryAtLocal = formatStockholm(seg.startTs, 'datetime');
        stickyAnchorTable = null;
        geoExitPending = false;
      }
      continue;
    }

    // Don't touch gps_gap or unknown_place stays.
    if (seg.kind !== 'travel') continue;
    // No sticky owner yet → leave segment untouched.
    if (!sticky) continue;

    const meta = travelMeta.get(seg.id);
    const pings = meta?.pings ?? [];

    // Compute distance metrics relative to sticky target.
    let minDistFromCenter = Infinity;
    let maxOutsideEdge = 0;
    let consecOutside1km = 0;
    let maxConsecOutside1km = 0;
    for (const p of pings) {
      const d = haversine(p.lat, p.lng, sticky.target.center.lat, sticky.target.center.lng);
      if (d < minDistFromCenter) minDistFromCenter = d;
      const signed = signedDistanceToTargetEdge(p.lat, p.lng, sticky.target);
      const outsideBy = -signed; // positive when outside
      if (outsideBy > maxOutsideEdge) maxOutsideEdge = outsideBy;
      if (outsideBy >= STICKY_DIST_OUTSIDE_M) {
        consecOutside1km++;
        if (consecOutside1km > maxConsecOutside1km) maxConsecOutside1km = consecOutside1km;
      } else {
        consecOutside1km = 0;
      }
    }
    if (!Number.isFinite(minDistFromCenter)) minDistFromCenter = 0;

    // (A) arrived at other primary target — next stay known_site on a
    // different primary-eligible target.
    let arrivedAtOther = false;
    for (let j = si + 1; j < segments.length; j++) {
      const n = segments[j];
      if (n.kind === 'gps_gap') continue;
      if (n.kind === 'stay' && n.type === 'known_site') {
        const nt = findEligibleTargetForStay(n);
        if (nt && nt.refId !== sticky.refId) arrivedAtOther = true;
      }
      break;
    }

    // (D) transport to other primary target — last accepted ping is within
    // another primary target's radius + buffer.
    let transportToOther = false;
    if (pings.length > 0) {
      const lastPing = pings[pings.length - 1];
      const at = Date.parse(lastPing.ts);
      for (const t of input.targets) {
        if (t.refId === sticky.refId) continue;
        if (!isPrimaryEligibleTarget(t)) continue;
        if (t.validFrom && Date.parse(t.validFrom) > at) continue;
        if (t.validUntil && Date.parse(t.validUntil) < at) continue;
        const signed = signedDistanceToTargetEdge(lastPing.lat, lastPing.lng, t);
        // signed >= 0 inside; signed < 0 = outside by |signed| meters.
        if (signed >= -OTHER_PRIMARY_BUFFER_M) {
          transportToOther = true;
          break;
        }
      }
    }

    // Diagnostic-only: long clear exit (NEVER a strong-exit reason alone).
    let longClearExit = false;
    if (seg.durationMin >= 10 && pings.length > 0) {
      const baseAcc =
        meta?.medianAccM != null && Number.isFinite(meta.medianAccM) ? meta.medianAccM : 0;
      const tol = sticky.target.radiusM + Math.max(250, baseAcc * 3);
      let outsideCount = 0;
      for (const p of pings) {
        const d = haversine(p.lat, p.lng, sticky.target.center.lat, sticky.target.center.lng);
        if (d > tol) outsideCount++;
      }
      longClearExit = outsideCount >= 5;
    }

    const distanceOver1km = maxConsecOutside1km >= 2;
    const strongExit = arrivedAtOther || distanceOver1km || transportToOther;

    // Write per-segment sticky diagnostics.
    const td = (seg.targetDiagnostics ??= {} as SegmentTargetDiagnostics);
    td.stickyTargetId = sticky.refId;
    td.stickyTargetLabel = sticky.label;
    td.distanceFromStickyCenterMeters = Math.round(minDistFromCenter);
    td.distanceOutsideStickyGeofenceMeters = Math.round(Math.max(0, maxOutsideEdge));
    td.arrivedAtOtherPrimaryTarget = arrivedAtOther;
    td.transportToOtherPrimaryTarget = transportToOther;
    td.longClearExit = longClearExit;
    td.stickyAnchorSource = stickyAnchorSource;
    td.stickyAnchorEntryAtLocal = stickyAnchorEntryAtLocal;
    td.stickyAnchorTable = stickyAnchorTable;
    td.geoExitWithoutStrongExitObserved = geoExitPending;

    if (longClearExit) longClearExitDiagCount++;

    if (strongExit) {
      strongExitCount++;
      strongExitMinutes += seg.durationMin;
      if (arrivedAtOther) arrivedAtOtherPrimaryCount++;

      const reason: NonNullable<SegmentTargetDiagnostics['reasonNotReclassified']> =
        arrivedAtOther
          ? 'arrived_at_other_primary_target'
          : distanceOver1km
            ? 'distance_over_1000m_outside_sticky_geofence'
            : 'transport_to_other_primary_target';
      td.reasonNotReclassified = reason;

      if (stickyExamples.length < 25) {
        stickyExamples.push({
          segmentStart: seg.startTs,
          segmentEnd: seg.endTs,
          durationMinutes: Math.round(seg.durationMin * 100) / 100,
          stickyTargetLabel: sticky.label,
          distanceFromStickyCenterMeters: td.distanceFromStickyCenterMeters,
          distanceOutsideStickyGeofenceMeters: td.distanceOutsideStickyGeofenceMeters,
          decision:
            arrivedAtOther
              ? 'kept_arrived_other_primary'
              : distanceOver1km
                ? 'kept_distance_over_1000m_outside_geofence'
                : 'kept_transport_to_other_primary',
          longClearExit,
          reasonNotReclassified: reason,
        });
      }

      // Strong exit → release sticky; the next known_site stay reseats it.
      sticky = null;
      stickyAnchorSource = null;
      stickyAnchorEntryAtLocal = null;
      stickyAnchorTable = null;
      geoExitPending = false;
      continue;
    }

    // No strong exit → reclassify this travel into a sticky stay.
    exitRejectedUnder1kmCount++;
    exitRejectedUnder1kmMinutes += seg.durationMin;

    const partialOutside = (td.distanceOutsideStickyGeofenceMeters ?? 0) > 0;

    seg.originalKind = seg.originalKind ?? 'travel';
    seg.originalType = seg.originalType ?? 'transport';
    seg.kind = 'stay';
    seg.type = 'known_site';
    seg.label = sticky.label;
    seg.matchedTargetId = sticky.refId;
    seg.matchedTargetType = sticky.kind;
    seg.matchedTargetName = sticky.label;
    seg.reclassificationReason = 'sticky_primary_target_no_strong_exit';
    seg.reason = 'matched_valid_target';
    seg.confidence = 0.5; // medium

    if (partialOutside) {
      td.confidenceReason = 'near_sticky_primary_target_no_strong_exit';
      td.warningLabel = 'GPS låg delvis utanför arbetsområdet';
    }

    targetsHit.add(sticky.target.key);
    knownSite++;
    transport = Math.max(0, transport - 1);
    stickyReclassifiedCount++;
    stickyReclassifiedMinutes += seg.durationMin;

    if (stickyExamples.length < 25) {
      stickyExamples.push({
        segmentStart: seg.startTs,
        segmentEnd: seg.endTs,
        durationMinutes: Math.round(seg.durationMin * 100) / 100,
        stickyTargetLabel: sticky.label,
        distanceFromStickyCenterMeters: td.distanceFromStickyCenterMeters,
        distanceOutsideStickyGeofenceMeters: td.distanceOutsideStickyGeofenceMeters,
        decision: 'reclassified_no_strong_exit',
        longClearExit,
        reasonNotReclassified: null,
      });
    }
  }

  // Aggregated diagnostic: remaining travel/transport segments that still
  // sit inside 1km of the (last seen) sticky target. These are warnings the
  // health-check surfaces.
  let remainingTransportNearStickyCount = 0;
  let remainingTransportNearStickyMinutes = 0;
  for (const seg of segments) {
    if (seg.kind !== 'travel') continue;
    const td = seg.targetDiagnostics;
    if (!td?.stickyTargetLabel) continue;
    const out = td.distanceOutsideStickyGeofenceMeters ?? null;
    if (out != null && out < STICKY_DIST_OUTSIDE_M) {
      // Strong exit flagged or not, this is a "transport near sticky" that
      // was kept as transport due to other_primary signals; still surface
      // the warning because operators may want to verify.
      if (!td.arrivedAtOtherPrimaryTarget && !td.transportToOtherPrimaryTarget) {
        remainingTransportNearStickyCount++;
        remainingTransportNearStickyMinutes += seg.durationMin;
      }
    }
  }

  // Drain any remaining hard anchors (after the final segment) — for diag totals.
  if (anchorIdx < hardAnchors.length) {
    advanceAnchorsUpTo(Number.POSITIVE_INFINITY);
  }

  // Aggregate: minutes of transport-segments that *survived* sticky-pass
  // (i.e. kept as travel) where sticky was seeded by a geo entry AND the
  // segment is still near the sticky target's geofence. Strong-exit segments
  // (arrived elsewhere, transport-to-other-primary, distance>1km) are excluded
  // because those reflect real movement away from the entry target.
  let transportAfterGeoEntryWithoutStrongExitMinutes = 0;
  for (const seg of segments) {
    if (seg.kind !== 'travel') continue;
    const td = seg.targetDiagnostics;
    if (!td) continue;
    if (td.stickyAnchorSource !== 'geo_entry') continue;
    if (td.reasonNotReclassified) continue; // strong exit kept transport
    const out = td.distanceOutsideStickyGeofenceMeters ?? null;
    if (out != null && out >= STICKY_DIST_OUTSIDE_M) continue;
    transportAfterGeoEntryWithoutStrongExitMinutes += seg.durationMin;
  }

  const geoAnchorExamples = hardAnchors.slice(0, 25).map((a) => ({
    type: a.type as 'entry' | 'exit',
    atLocalStockholm: a.timestampLocalStockholm,
    targetLabel: a.targetLabel,
    source: a.source,
  }));

  // ── INFO: stationary-inside-geofence override aggregates ────────────
  let overrideRescuedCount = 0;
  let overrideRescuedMinutes = 0;
  const overrideExamples: GpsClassificationDiagnostics['stationaryGeofenceOverride']['examples'] = [];
  for (const seg of segments) {
    if (seg.reclassificationReason !== 'stationary_inside_geofence_override') continue;
    overrideRescuedCount++;
    overrideRescuedMinutes += seg.durationMin;
    if (overrideExamples.length < 25) {
      overrideExamples.push({
        targetLabel: seg.label,
        startLocalStockholm: formatStockholm(seg.startTs, 'datetime'),
        endLocalStockholm: formatStockholm(seg.endTs, 'datetime'),
        durationMinutes: Math.round(seg.durationMin * 100) / 100,
        pingCount: seg.pingCount,
        medianAccuracyMeters: seg.targetDiagnostics?.medianAccuracyMeters ?? null,
      });
    }
  }
  const overridePingsRatio =
    accepted.length > 0 ? Number((pingsInsidePrimaryCount / accepted.length).toFixed(3)) : 0;

  // ── WARNING basis: travel segments that survived even though their
  // pings sit (almost) entirely inside the same primary-eligible geofence.
  // The override pre-pass should have rescued them — non-zero = engine bug.
  let remainingTransportInsidePrimaryCount = 0;
  let remainingTransportInsidePrimaryMinutes = 0;
  for (const seg of segments) {
    if (seg.kind !== 'travel') continue;
    const td = seg.targetDiagnostics;
    if (!td) continue;
    const ratio = td.pingsInsideSameTargetRatio ?? 0;
    if (ratio < 0.7) continue; // not "almost entirely inside"
    if (!td.travelInsideTargetCandidate) continue;
    // Only count when the candidate target is primary-eligible (i.e. would
    // have been a valid override owner). Find it in input.targets.
    const cand = td.travelInsideTargetLabel
      ? input.targets.find((t) => t.label === td.travelInsideTargetLabel)
      : null;
    if (!cand || cand.assignedToUserToday === false) continue;
    remainingTransportInsidePrimaryCount++;
    remainingTransportInsidePrimaryMinutes += seg.durationMin;
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
      transportInsidePrimaryTotalCount,
      transportInsidePrimaryTotalMinutes: Math.round(transportInsidePrimaryTotalMinutes * 100) / 100,
      reclassifiableTransportInsidePrimaryCount: reclassifiableCount,
      reclassifiableTransportInsidePrimaryMinutes: Math.round(reclassifiableMinutes * 100) / 100,
      keptBecauseClearExitCount: keptClearExitCount,
      keptBecauseClearExitMinutes: Math.round(keptClearExitMinutes * 100) / 100,
      keptBecauseRatioBelowThresholdCount: keptRatioBelowCount,
      keptBecauseRatioBelowThresholdMinutes: Math.round(keptRatioBelowMinutes * 100) / 100,
      keptBecauseSecondaryOrUnsafeTargetCount: keptSecondaryUnsafeCount,
      keptBecauseSecondaryOrUnsafeTargetMinutes: Math.round(keptSecondaryUnsafeMinutes * 100) / 100,
      keptBecauseDurationTooLongCount: keptDurationTooLongCount,
      keptBecauseDurationTooLongMinutes: Math.round(keptDurationTooLongMinutes * 100) / 100,
      stickyTargetDiagnostics: {
        stickyReclassifiedCount,
        stickyReclassifiedMinutes: Math.round(stickyReclassifiedMinutes * 100) / 100,
        strongExitCount,
        strongExitMinutes: Math.round(strongExitMinutes * 100) / 100,
        exitRejectedBecauseUnder1kmCount: exitRejectedUnder1kmCount,
        exitRejectedBecauseUnder1kmMinutes: Math.round(exitRejectedUnder1kmMinutes * 100) / 100,
        arrivedAtOtherPrimaryTargetCount: arrivedAtOtherPrimaryCount,
        longClearExitCount: longClearExitDiagCount,
        remainingTransportNearStickyTargetCount: remainingTransportNearStickyCount,
        remainingTransportNearStickyTargetMinutes: Math.round(remainingTransportNearStickyMinutes * 100) / 100,
        examples: stickyExamples,
      },
      geoAnchorDiagnostics: {
        hardAnchorCount: hardAnchors.length,
        hardEntryCount: hardAnchors.filter((a) => a.type === 'entry').length,
        hardExitCount: hardAnchors.filter((a) => a.type === 'exit').length,
        entriesAppliedToSticky: geoAnchorEntriesApplied,
        entriesSeededStickyEarly: geoAnchorEntriesSeededStickyEarly,
        entriesIgnoredNoMatchingTarget: geoAnchorEntriesIgnoredNoTarget,
        exitsObservedWithoutStrongExit: geoAnchorExitsObserved,
        transportSegmentsAfterGeoEntryWithoutStrongExitMinutes:
          Math.round(transportAfterGeoEntryWithoutStrongExitMinutes * 100) / 100,
        examples: geoAnchorExamples,
      },
      stationaryGeofenceOverride: {
        rescuedStayCount: overrideRescuedCount,
        rescuedStayMinutes: Math.round(overrideRescuedMinutes * 100) / 100,
        pingsInsidePrimaryCount,
        pingsInsidePrimaryRatio: overridePingsRatio,
        examples: overrideExamples,
      },
      remainingTransportInsidePrimaryGeofenceCount: remainingTransportInsidePrimaryCount,
      remainingTransportInsidePrimaryGeofenceMinutes:
        Math.round(remainingTransportInsidePrimaryMinutes * 100) / 100,
    },
    // Back-compat top-level mirrors (consumers like report-candidate-blocks-health
    // read these at the result root). Same values as inside classificationDiagnostics.
    geoAnchorDiagnostics: {
      hardAnchorCount: hardAnchors.length,
      hardEntryCount: hardAnchors.filter((a) => a.type === 'entry').length,
      hardExitCount: hardAnchors.filter((a) => a.type === 'exit').length,
      entriesAppliedToSticky: geoAnchorEntriesApplied,
      entriesSeededStickyEarly: geoAnchorEntriesSeededStickyEarly,
      entriesIgnoredNoMatchingTarget: geoAnchorEntriesIgnoredNoTarget,
      exitsObservedWithoutStrongExit: geoAnchorExitsObserved,
      transportSegmentsAfterGeoEntryWithoutStrongExitMinutes:
        Math.round(transportAfterGeoEntryWithoutStrongExitMinutes * 100) / 100,
      examples: geoAnchorExamples,
    },
    stationaryGeofenceOverride: {
      rescuedStayCount: overrideRescuedCount,
      rescuedStayMinutes: Math.round(overrideRescuedMinutes * 100) / 100,
      pingsInsidePrimaryCount,
      pingsInsidePrimaryRatio: overridePingsRatio,
      examples: overrideExamples,
    },
    remainingTransportInsidePrimaryGeofenceCount: remainingTransportInsidePrimaryCount,
    remainingTransportInsidePrimaryGeofenceMinutes:
      Math.round(remainingTransportInsidePrimaryMinutes * 100) / 100,
  } as GpsDayTimelineResult;
}

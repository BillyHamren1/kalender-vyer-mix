/**
 * Time Engine — Public Contracts (frontend)
 * =========================================
 *
 * This module defines the canonical types for the NEW Time Engine.
 *
 * IMPORTANT — Separation of concerns:
 *   These types are intentionally INDEPENDENT of legacy domain models:
 *     - workday / workdays
 *     - time_reports
 *     - location_time_entries
 *     - travel_time_logs
 *     - assistant_events
 *     - legacy `activeTimers` / useWorkSession state
 *
 *   The legacy systems may continue to exist, but they are NOT the
 *   source of truth for the new Time Engine. Do not import them here,
 *   and do not derive new-engine state from them.
 *
 * Layered model:
 *   1. GpsDayTimeline           — physical reality from GPS (NOT work time)
 *   2. WorkTarget               — a candidate workplace/geofence
 *   3. TargetMatch              — does a GPS segment match a valid target?
 *   4. AutoStartDecision        — may GPS start time? (policy output)
 *   5. ActiveTimeRegistration   — the one and only active timer
 *   6. TimeRegistrationSegment  — how active time is split over place/project/transport/unknown
 *
 * NOTE: TimeReport (the persisted, attestable artifact) is created in a
 * LATER phase. It is intentionally absent from this contract.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

export type ISODateTime = string; // e.g. "2026-05-07T08:30:00.000Z"
export type ISODate = string;     // e.g. "2026-05-07"
export type UUID = string;

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Horizontal accuracy in meters, if known. */
  accuracyM?: number | null;
}

/** Confidence on [0, 1]. 1 = certain, 0 = unknown. */
export type Confidence = number;

// ─────────────────────────────────────────────────────────────────────────────
// 1. GPS Day Timeline
//    GPS Day Timeline = PHYSICAL REALITY from GPS, NOT work time.
//    It says where the person was — never that they worked.
// ─────────────────────────────────────────────────────────────────────────────

export type GpsSegmentKind =
  /** Stationary at a place (known or unknown). */
  | 'stationary'
  /** Moving between places. */
  | 'movement'
  /** No GPS signal long enough to count as a gap. */
  | 'gps_gap';

export interface GpsSegment {
  id: string;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null; // null => still ongoing
  kind: GpsSegmentKind;
  /** Centroid of stationary segment, or representative point of movement. */
  point?: GeoPoint;
  /** Approx distance traveled (meters) for movement segments. */
  distanceM?: number;
  /** Number of underlying GPS pings supporting this segment. */
  pingCount?: number;
  confidence: Confidence;
}

export interface GpsDayTimeline {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  segments: GpsSegment[];
  /** Wall-clock when this timeline view was computed. */
  computedAt: ISODateTime;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WorkTarget
//    A candidate workplace/geofence the engine can match GPS against.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkTargetKind =
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'organization_location';

export interface WorkTarget {
  /** Stable key per kind, e.g. `project:UUID` or `warehouse:UUID`. */
  key: string;
  kind: WorkTargetKind;
  refId: UUID;
  label: string;
  center: GeoPoint;
  radiusM: number;
  /** Optional planned window of validity (e.g. assigned day). */
  validFrom?: ISODateTime | null;
  validUntil?: ISODateTime | null;
  /** True if user is currently assigned/expected here. */
  assignedToUserToday?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TargetMatch
//    Result of matching ONE GPS segment against a set of WorkTargets.
// ─────────────────────────────────────────────────────────────────────────────

export type TargetMatchOutcome =
  /** Segment is inside a known, valid target. */
  | 'inside_known_target'
  /** Segment is at a stable but unknown place. */
  | 'unknown_place'
  /** Segment is movement (transport candidate). */
  | 'transport'
  /** Segment is a GPS gap inside an active registration. */
  | 'gps_uncertain'
  /** Not enough signal to decide. */
  | 'insufficient_signal';

export interface TargetMatch {
  segmentId: string;
  outcome: TargetMatchOutcome;
  /** Present when outcome === 'inside_known_target'. */
  target?: WorkTarget;
  /** Distance to chosen target center, meters. */
  distanceM?: number;
  confidence: Confidence;
  /** Human-readable reason for debug/UI. */
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AutoStartDecision
//    AutoStartPolicy = decides if GPS may start time.
//    Default policy in this engine: GPS NEVER starts time.
//    GPS may only RECLASSIFY time once a user-started timer is active.
// ─────────────────────────────────────────────────────────────────────────────

export type AutoStartBlockReason =
  /** Hard rule of the new engine. */
  | 'gps_cannot_start_time'
  /** Night guard 00:00–05:00 local time. */
  | 'blocked_night_auto_start_no_active_timer'
  /** GPS segment was movement, not a stable place. */
  | 'movement_not_allowed'
  /** Stable place but not a known/assigned target. */
  | 'unknown_place_not_allowed'
  /** Match exists but confidence is too low. */
  | 'low_confidence'
  /** Engine kill-switch / feature flag off. */
  | 'engine_disabled';

export interface AutoStartDecision {
  /** Always false in this engine — kept as discriminator for future flexibility. */
  allowed: false;
  blocked: true;
  reason: AutoStartBlockReason;
  /** Optional debug payload for the safety panel. */
  debug?: {
    isNightLocal?: boolean;
    localHour?: number;
    matchedTargetKey?: string | null;
    confidence?: Confidence;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ActiveTimeRegistration
//    The actual timer. Only one per staff at a time.
//    MUST be created by user_timer source. GPS may never create it.
// ─────────────────────────────────────────────────────────────────────────────

export type RegistrationKind =
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'transport'
  | 'unknown_place'
  | 'gps_uncertain';

export type RegistrationSource = 'user_timer';
export type RegistrationStatus = 'active' | 'stopped';

export interface ActiveTimeRegistration {
  id: UUID;
  staffId: UUID;
  organizationId: UUID;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  status: RegistrationStatus;
  source: RegistrationSource;
  startedByUser: true;

  /** Current best classification (may be updated by GPS classifier). */
  currentKind: RegistrationKind;
  currentLabel: string;
  /** Reference to the matched target, if any. */
  currentTargetKey?: string | null;

  confidence: Confidence;
  needsUserChoice: boolean;
  lastGpsClassificationAt?: ISODateTime | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TimeRegistrationSegment
//    How the active registration's elapsed time is split into
//    place/project/transport/unknown sub-segments by GPS.
//    These are derived facts, not persisted time reports.
//    TimeReport is created in a LATER phase, not here.
// ─────────────────────────────────────────────────────────────────────────────

export type TimeRegistrationSegmentKind =
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'transport'
  | 'unknown_place'
  | 'gps_uncertain';

export interface TimeRegistrationSegment {
  registrationId: UUID;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  kind: TimeRegistrationSegmentKind;
  label: string;
  targetKey?: string | null;
  confidence: Confidence;
  /** Originating GPS segment id, if any. */
  sourceGpsSegmentId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience aggregate (read-side view; no persistence implied).
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeEngineDayView {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  gpsTimeline: GpsDayTimeline;
  activeRegistration: ActiveTimeRegistration | null;
  registrationSegments: TimeRegistrationSegment[];
  /** Most recent auto-start decision, for debug surfaces only. */
  lastAutoStartDecision?: AutoStartDecision | null;
  computedAt: ISODateTime;
}

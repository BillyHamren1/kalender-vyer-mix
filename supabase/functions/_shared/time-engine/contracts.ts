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
 * AUTO-START POLICY (canonical):
 *   GPS MAY start time — but ONLY when the user is inside a valid, known
 *   work target (project / booking / warehouse / organization_location)
 *   with sufficient dwell, ping count and confidence.
 *
 *   GPS MUST NOT start time from:
 *     - movement / transport
 *     - unknown places
 *     - GPS gaps
 *     - low-confidence / uncertain pings
 *     - test/demo/cancelled/invalid targets
 *     - private/home zones
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
  | 'stationary'
  | 'movement'
  | 'gps_gap';

export interface GpsSegment {
  id: string;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  kind: GpsSegmentKind;
  point?: GeoPoint;
  distanceM?: number;
  pingCount?: number;
  confidence: Confidence;
}

export interface GpsDayTimeline {
  staffId: UUID;
  organizationId: UUID;
  date: ISODate;
  segments: GpsSegment[];
  computedAt: ISODateTime;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WorkTarget
// ─────────────────────────────────────────────────────────────────────────────

export type WorkTargetKind =
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'organization_location';

/**
 * GeoJSON Polygon. coordinates: [ring][point][lng, lat]. Outer ring first; inner rings = holes.
 * Mirrors src/lib/geofenceEval.ts and supabase/functions/_shared/geofenceEval.ts.
 */
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface WorkTarget {
  key: string;
  kind: WorkTargetKind;
  refId: UUID;
  label: string;
  /** Centroid (polygon centroid when polygon is set; otherwise circle center). */
  center: GeoPoint;
  /** Circle radius. Used as fallback when polygon is null. */
  radiusM: number;
  /** Optional polygon. When set, takes precedence over the circle (center,radiusM). */
  polygon?: GeoJSONPolygon | null;
  validFrom?: ISODateTime | null;
  validUntil?: ISODateTime | null;
  assignedToUserToday?: boolean;
  /**
   * Why this target counts as primary (resolveWorkTargets.assignmentAnchor).
   * Used by the inside-geofence override to prioritize when a ping sits
   * inside multiple primary-eligible geofences. Higher priority wins:
   *   1 direct_staff_assignment
   *   2 team_calendar_event
   *   3 large_project_staff_assignment
   *   4 warehouse  (and organization_location, see kind)
   *   5 everything else primary-eligible
   *   6 nearest-center tiebreaker
   */
  assignmentAnchor?:
    | 'warehouse'
    | 'direct_staff_assignment'
    | 'team_calendar_event'
    | 'large_project_staff_assignment'
    | 'date_address_candidate'
    | 'project_linked_unassigned'
    | 'active_project_unassigned';
  /**
   * Engine 4 — Locations: when true this target represents a private
   * residence / boende polygon and MUST NEVER be classified as work.
   * It also wins semantically over nearby warehouse/work targets so a
   * residence is never merged with a warehouse area, even within
   * TRANSPORT_MIN_DISTANCE_METERS.
   */
  isPrivateResidence?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2b. GeoAnchor
//     A hard signal (geofence ENTER / EXIT) tied to a specific WorkTarget.
//     Treated as ground truth at the same trust level as a GPS ping.
//     Used by buildGpsDayTimeline to seed sticky ownership of a primary
//     project/warehouse/location even before any GPS stay establishes it.
//
//     ONLY entry-anchors that match a primary-eligible WorkTarget
//     (canAutoMatchAsWork=true, validity=valid) become "hard" anchors.
//     Anchors against secondary or unknown targets are kept as `weak` and
//     never alter classification.
// ─────────────────────────────────────────────────────────────────────────────

export type GeoAnchorSource =
  | 'assistant_events'
  | 'staff_presence_events';

export type GeoAnchorType = 'entry' | 'exit';

/** Confidence tier as a discrete label. Always 'high' for now. */
export type GeoAnchorConfidence = 'high' | 'medium' | 'low';

/** Strength after cross-matching against resolved WorkTargets. */
export type GeoAnchorStrength = 'hard' | 'weak';

export interface GeoAnchor {
  id: string;
  staffId: UUID;
  organizationId: UUID;
  type: GeoAnchorType;
  source: GeoAnchorSource;
  /** Raw label from the source row (e.g. 'geofence_foreground'). */
  rawSourceLabel: string | null;
  /** Target type as stored in the source row. */
  targetType: 'project' | 'large_project' | 'booking' | 'location' | string;
  /** Target id as stored in the source row. */
  targetId: string;
  targetLabel: string | null;
  /** Anchor moment in UTC ISO. */
  timestampUtc: ISODateTime;
  /** Same moment formatted as "YYYY-MM-DD HH:MM" Europe/Stockholm (display). */
  timestampLocalStockholm: string;
  confidence: GeoAnchorConfidence;
  /** Set after matching against WorkTargets. */
  strength?: GeoAnchorStrength;
  /** WorkTarget.refId of the matched primary target (when strength='hard'). */
  matchedTargetRefId?: UUID | null;
  /** WorkTarget.kind of the matched primary target. */
  matchedTargetKind?: WorkTargetKind | null;
  /** Reason this anchor was demoted to 'weak'. */
  weakReason?:
    | 'no_matching_worktarget'
    | 'target_not_primary'
    | 'target_not_today'
    | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TargetMatch
// ─────────────────────────────────────────────────────────────────────────────

export type TargetMatchOutcome =
  | 'inside_known_target'
  | 'unknown_place'
  | 'transport'
  | 'gps_uncertain'
  | 'insufficient_signal';

export interface TargetMatch {
  segmentId: string;
  outcome: TargetMatchOutcome;
  target?: WorkTarget;
  distanceM?: number;
  confidence: Confidence;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AutoStartDecision
//    Output of AutoStartPolicy. May be either allowed or blocked.
//    GPS may start time only when inside a valid known work target with
//    sufficient evidence. Otherwise the decision is blocked with a reason.
// ─────────────────────────────────────────────────────────────────────────────

/** Reasons GPS auto-start may be blocked. */
export type AutoStartBlockedReason =
  | 'blocked_already_active'
  | 'blocked_movement_only'
  | 'blocked_unknown_place'
  | 'blocked_gps_gap'
  | 'blocked_low_confidence'
  | 'blocked_invalid_target'
  | 'blocked_test_target'
  | 'blocked_home_or_private'
  | 'blocked_not_enough_dwell'
  | 'blocked_not_enough_pings'
  | 'blocked_night_requires_stronger_evidence'
  | 'blocked_target_not_autostartable_source'
  | 'blocked_engine_disabled';

/** Reasons GPS auto-start may be allowed. */
export type AutoStartAllowedReason = 'allowed_valid_geofence';

export type AutoStartReason = AutoStartAllowedReason | AutoStartBlockedReason;

export type AutoStartSource = 'gps_geofence_auto_start';

export interface AutoStartEvidence {
  dwellSeconds?: number;
  arrivalPingsCount?: number;
  firstPingAt?: ISODateTime | null;
  lastPingAt?: ISODateTime | null;
  targetDistanceMeters?: number | null;
  targetRadiusMeters?: number | null;
  isNightLocal?: boolean;
  localHour?: number;
  policyReason?: string;
  [key: string]: unknown;
}

export type AutoStartDecision =
  | {
      allowed: true;
      reason: AutoStartAllowedReason;
      source: AutoStartSource;
      startAt: ISODateTime;
      targetId: UUID;
      targetType: WorkTargetKind;
      targetName: string;
      confidence: Confidence;
      evidence: AutoStartEvidence;
    }
  | {
      allowed: false;
      reason: AutoStartBlockedReason;
      source: null;
      startAt: null;
      targetId: null;
      targetType: null;
      targetName: null;
      confidence: Confidence;
      evidence: AutoStartEvidence;
    };

// ─────────────────────────────────────────────────────────────────────────────
// 5. ActiveTimeRegistration
//    The actual timer. Only one active per staff at a time.
//    May be created by user, by GPS auto-start at a valid geofence, or by admin.
// ─────────────────────────────────────────────────────────────────────────────

export type RegistrationKind =
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'transport'
  | 'unknown_place'
  | 'gps_uncertain';

export type RegistrationSource =
  | 'user_timer'
  | 'gps_geofence_auto_start'
  | 'admin_start';

export type RegistrationStatus = 'active' | 'stopped';

export interface ActiveTimeRegistration {
  id: UUID;
  staffId: UUID;
  organizationId: UUID;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  status: RegistrationStatus;

  /** How this registration was started. */
  startSource: RegistrationSource;
  /** True iff a human user explicitly started this timer. */
  startedByUser: boolean;
  /** True iff started automatically (GPS geofence). */
  autoStarted: boolean;

  /** Target the timer was started against (frozen at start time). */
  startTargetType: WorkTargetKind | null;
  startTargetId: UUID | null;
  startTargetLabel: string | null;

  /** Current best classification (may be updated by GPS classifier). */
  currentKind: RegistrationKind;
  currentLabel: string;
  currentTargetKey?: string | null;

  confidence: Confidence;
  needsUserChoice: boolean;
  lastGpsClassificationAt?: ISODateTime | null;

  /**
   * @deprecated kept for transitional compatibility — use `startSource`.
   */
  source?: RegistrationSource;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TimeRegistrationSegment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Segment kinds for active time registration breakdown.
 *
 *   work_target    — inside a known/valid work target (project/booking/warehouse/org_location)
 *   transport      — movement; never auto-starts a timer, but is a valid segment INSIDE an active timer
 *   unknown_place  — stationary at an unknown place; never auto-starts, but valid INSIDE an active timer
 *   gps_gap        — signal status only. Does NOT subtract work time. The timer keeps ticking.
 */
export type TimeRegistrationSegmentKind =
  | 'work_target'
  | 'transport'
  | 'unknown_place'
  | 'gps_gap';

export interface TimeRegistrationSegment {
  registrationId: UUID;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  kind: TimeRegistrationSegmentKind;
  label: string;
  /** Only set when kind='work_target'. */
  targetKind?: WorkTargetKind | null;
  targetRefId?: UUID | null;
  targetKey?: string | null;
  confidence: Confidence;
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
  lastAutoStartDecision?: AutoStartDecision | null;
  computedAt: ISODateTime;
}

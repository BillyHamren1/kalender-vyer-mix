/**
 * Time Engine — Public Contracts (Edge Functions / Deno)
 * =======================================================
 *
 * Server-side mirror of src/lib/time-engine/contracts.ts.
 * Keep these two files in sync by hand — do NOT cross-import across the
 * frontend/Deno boundary.
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
 *   Legacy tables/functions may continue to exist, but they are NOT the
 *   source of truth for the new Time Engine.
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

export type ISODateTime = string;
export type ISODate = string;
export type UUID = string;

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number | null;
}

export type Confidence = number;

// ── 1. GPS Day Timeline — physical reality, not work time ───────────────────
export type GpsSegmentKind = 'stationary' | 'movement' | 'gps_gap';

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

// ── 2. WorkTarget — candidate workplace/geofence ────────────────────────────
export type WorkTargetKind =
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'organization_location';

export interface WorkTarget {
  key: string;
  kind: WorkTargetKind;
  refId: UUID;
  label: string;
  center: GeoPoint;
  radiusM: number;
  validFrom?: ISODateTime | null;
  validUntil?: ISODateTime | null;
  assignedToUserToday?: boolean;
}

// ── 3. TargetMatch ──────────────────────────────────────────────────────────
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

// ── 4. AutoStartDecision — AutoStartPolicy output ───────────────────────────
//
// Policy: GPS NEVER starts time. GPS may only reclassify an active
// user-started timer. This type is therefore always a "blocked" verdict.
export type AutoStartBlockReason =
  | 'gps_cannot_start_time'
  | 'blocked_night_auto_start_no_active_timer'
  | 'movement_not_allowed'
  | 'unknown_place_not_allowed'
  | 'low_confidence'
  | 'engine_disabled';

export interface AutoStartDecision {
  allowed: false;
  blocked: true;
  reason: AutoStartBlockReason;
  debug?: {
    isNightLocal?: boolean;
    localHour?: number;
    matchedTargetKey?: string | null;
    confidence?: Confidence;
  };
}

// ── 5. ActiveTimeRegistration — the actual timer ────────────────────────────
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
  currentKind: RegistrationKind;
  currentLabel: string;
  currentTargetKey?: string | null;
  confidence: Confidence;
  needsUserChoice: boolean;
  lastGpsClassificationAt?: ISODateTime | null;
}

// ── 6. TimeRegistrationSegment — split of active time ───────────────────────
// Derived facts only. TimeReport is created in a LATER phase, not here.
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
  sourceGpsSegmentId?: string | null;
}

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

/**
 * Time Engine — decideAutoStart
 * =============================
 *
 * Pure decision function. Given a current GPS segment, the previous
 * segment, a candidate target and the local time, decides whether GPS
 * may auto-start a time registration RIGHT NOW.
 *
 * STRICT CONSTRAINTS:
 *   - This function ONLY decides. It MUST NOT write to the database.
 *   - It MUST NOT read from workday / time_reports / location_time_entries
 *     / travel_time_logs / assistant_events / legacy timers.
 *   - It MUST NOT name unknown places from old timers/reports.
 *
 * GPS may auto-start time only when ALL of these hold:
 *   - currentSegment.kind === 'stay'
 *   - currentSegment.type === 'known_site'
 *   - target is provided
 *   - target.targetValidity === 'valid'
 *   - target.timeTrackingAllowed === true
 *   - dwell, ping count and confidence meet day/night policy
 *   - target is not home/private
 *   - target is not test/demo/cancelled/archived
 *
 * GPS may NEVER auto-start from:
 *   - travel / transport
 *   - unknown_place
 *   - gps_gap
 *   - low confidence
 *   - single ping
 *   - invalid target
 *   - test/demo target
 *   - home/private
 *   - stale/cached/low quality pings
 *
 * Night 00:00–05:00 local time:
 *   - night work IS allowed
 *   - but requires stronger evidence (more pings, longer dwell,
 *     higher confidence) AND
 *   - requirePlannedOrExplicitAllowedTarget === true
 */

import type { Confidence, ISODateTime, UUID, WorkTarget } from './contracts.ts';
import {
  dayPolicy as defaultDayPolicy,
  nightPolicy as defaultNightPolicy,
  isNightLocal,
  localHour,
  type DwellPolicy,
  type NightPolicy,
} from './timePolicy.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AutoStartSegmentKind = 'stay' | 'travel' | 'gps_gap';
export type AutoStartSegmentType =
  | 'known_site'
  | 'unknown_place'
  | 'transport'
  | 'gps_gap';

/** Minimum subset of a GpsTimelineSegment that the decision needs. */
export interface DecideAutoStartSegment {
  id?: string;
  startTs: ISODateTime;
  endTs: ISODateTime;
  durationMin: number;
  kind: AutoStartSegmentKind;
  type: AutoStartSegmentType;
  pingCount: number;
  confidence: Confidence;
  /** True if these pings are stale/cached or otherwise low quality. */
  isStaleOrCached?: boolean;
}

export type TargetValidity =
  | 'valid'
  | 'missing_coordinates'
  | 'invalid_radius'
  | 'test_data'
  | 'cancelled'
  | 'archived';

/**
 * Target shape used by the decision. Compatible with both
 *   - the canonical contracts.WorkTarget, and
 *   - the richer ResolvedWorkTarget from resolveWorkTargets.ts
 *     (extra fields are optional here).
 */
export type AutoStartableTargetSource =
  | 'planned_today'
  | 'warehouse'
  | 'explicit_time_tracking_location';

export type AnyTargetSource =
  | AutoStartableTargetSource
  | 'active_project'
  | 'recent_confirmed'
  | 'permanent_location'
  | (string & {});

/**
 * Only these targetSource values may auto-start time in v1.
 * `active_project` and `recent_confirmed` are intentionally excluded
 * until the engine is verified end-to-end.
 */
export const AUTOSTARTABLE_TARGET_SOURCES: ReadonlySet<AutoStartableTargetSource> =
  new Set(['planned_today', 'warehouse', 'explicit_time_tracking_location']);

export interface DecideAutoStartTarget extends Partial<WorkTarget> {
  refId: UUID;
  kind: WorkTarget['kind'];
  label: string;
  targetValidity?: TargetValidity;
  timeTrackingAllowed?: boolean;
  isHomeOrPrivate?: boolean;
  isTestOrDemo?: boolean;
  isCancelled?: boolean;
  isArchived?: boolean;
  assignedToUserToday?: boolean;
  explicitlyAllowed?: boolean;
  /**
   * Where this target came from in resolveWorkTargets. Only a subset
   * is allowed to auto-start (see AUTOSTARTABLE_TARGET_SOURCES).
   */
  targetSource?: AnyTargetSource;
}


export interface ExistingActiveRegistration {
  id: UUID;
  startedAt: ISODateTime;
  /** Free-form so we don't pin this to one shape. */
  source?: string;
}

export type AutoStartDecisionReason =
  | 'allowed_valid_geofence'
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
  | 'blocked_missing_allowed_decision_fields'
  /**
   * User manually ended their workday earlier today via WorkDayPanel.
   * GPS/geofence may not auto-start a new timer for the rest of the
   * local day. A suppression row in `time_auto_start_suppressions`
   * is the source of truth. Manual start from WorkDayPanel is NOT
   * blocked by this reason — only background auto-start is.
   */
  | 'blocked_user_ended_workday'
  /**
   * The day timer for this staff/local-date was already stopped (auto OR
   * user). The Time Engine MUST NOT re-open the day from GPS for the
   * remainder of the local day. Only an explicit manual start via
   * `start_time_registration` may resume it.
   *
   * Lock-policy from the user spec:
   *   "stoppad dagtimer = dagen är stoppad"
   *   "stopped day cannot be reopened by GPS batch"
   */
  | 'blocked_day_already_stopped'
  /**
   * The candidate stay segment falls geographically INSIDE a known
   * private_residence / inferred_home / manual_ignore zone for THIS staff
   * (from staff_private_zones / staff_inferred_home_locations). Even if a
   * nearby work target also matches, "home wins over work" — GPS must NOT
   * auto-start a project/booking/warehouse timer here. Diagnostics:
   *   matchedPrivateResidence, privateResidenceDistanceMeters,
   *   competingWorkTarget, homeWonOverWorkTarget,
   *   suppressedAutoStartBecauseHome.
   */
  | 'blocked_inside_private_residence'
  /**
   * The user explicitly tapped "Nej" / "Detta är inte arbete" on a previous
   * arrival prompt for THIS staff/day/target (or geographic point). Auto-start
   * MUST respect that for at least the rest of the local day. Manual start
   * via `start_time_registration` bypasses (it does not run through this
   * engine and always wins over a prior decline). Diagnostics:
   *   userDeclineFound, declineMatchedTarget, declineMatchedRadius,
   *   suppressedAutoStartBecauseDeclined.
   */
  | 'blocked_user_declined_today';

export interface AutoStartEvidence {
  isNightLocal: boolean;
  localHour: number;
  dwellMinutes: number;
  requiredDwellMinutes: number;
  pingCount: number;
  requiredPingCount: number;
  confidence: Confidence;
  requiredConfidence: Confidence;
  segmentKind: AutoStartSegmentKind;
  segmentType: AutoStartSegmentType;
  targetKey?: string | null;
  targetValidity?: TargetValidity;
  timeTrackingAllowed?: boolean;
  assignedToUserToday?: boolean;
  explicitlyAllowed?: boolean;
  targetSource?: AnyTargetSource | null;
  policyUsed: 'day' | 'night';
}

export interface DecideAutoStartInput {
  currentSegment: DecideAutoStartSegment;
  previousSegment?: DecideAutoStartSegment | null;
  target?: DecideAutoStartTarget | null;
  /** ISO timestamp representing local "now" for the decision. */
  localTime: ISODateTime;
  policy?: {
    day?: DwellPolicy;
    night?: NightPolicy;
  };
  existingActiveRegistration?: ExistingActiveRegistration | null;
  /**
   * Set by the caller (processGpsTimelineForAutoStart) when the
   * candidate segment center sits inside a staff private zone
   * (staff_private_zones / staff_inferred_home_locations).
   * "Home wins over work" — when true, decideAutoStart denies with
   * `blocked_inside_private_residence` even if `target` is a valid
   * project/booking/warehouse. GPS evidence may still be collected;
   * only the auto-start side is suppressed.
   */
  insidePrivateResidence?: {
    distanceMeters: number;
    zoneKind: string | null;
  } | null;
  /**
   * Set by the caller (processGpsTimelineForAutoStart) when an active
   * decline row in `auto_start_decline_log` matches this candidate
   * (target_id match, or lat/lng within radius). When present,
   * decideAutoStart denies with `blocked_user_declined_today`.
   * Manual start (start_time_registration) bypasses this engine entirely.
   */
  userDeclinedToday?: {
    matchedTarget: boolean;
    matchedRadiusMeters: number | null;
    declineId: string;
    expiresAt: ISODateTime;
  } | null;
}

export type AutoStartSource = 'gps_geofence_auto_start';

export interface AutoStartDecisionResult {
  allowed: boolean;
  reason: AutoStartDecisionReason;
  confidence: Confidence;
  startAt: ISODateTime | null;
  targetId: UUID | null;
  targetType: WorkTarget['kind'] | null;
  targetName: string | null;
  source: AutoStartSource | null;
  evidence: AutoStartEvidence;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_HINTS = ['test', 'demo', 'sandbox', 'playground'];
const PRIVATE_HINTS = ['home', 'hem', 'privat', 'private'];

function labelHas(label: string | undefined, hints: string[]): boolean {
  const l = (label ?? '').toLowerCase();
  return hints.some((h) => l.includes(h));
}

function isHomeOrPrivate(t: DecideAutoStartTarget): boolean {
  if (t.isHomeOrPrivate === true) return true;
  return labelHas(t.label, PRIVATE_HINTS);
}

function isTestOrDemo(t: DecideAutoStartTarget): boolean {
  if (t.isTestOrDemo === true) return true;
  if (t.targetValidity === 'test_data') return true;
  return labelHas(t.label, TEST_HINTS);
}

function isInvalidTarget(t: DecideAutoStartTarget): boolean {
  if (t.targetValidity && t.targetValidity !== 'valid') return true;
  if (t.isCancelled === true) return true;
  if (t.isArchived === true) return true;
  if (t.timeTrackingAllowed === false) return true;
  return false;
}

function buildEvidence(args: {
  segment: DecideAutoStartSegment;
  target?: DecideAutoStartTarget | null;
  policy: DwellPolicy;
  policyUsed: 'day' | 'night';
  localIso: ISODateTime;
}): AutoStartEvidence {
  const { segment, target, policy, policyUsed, localIso } = args;
  return {
    isNightLocal: policyUsed === 'night',
    localHour: localHour(localIso),
    dwellMinutes: segment.durationMin,
    requiredDwellMinutes: policy.minDwellSeconds / 60,
    pingCount: segment.pingCount,
    requiredPingCount: policy.minArrivalPings,
    confidence: segment.confidence,
    requiredConfidence: policy.minConfidence,
    segmentKind: segment.kind,
    segmentType: segment.type,
    targetKey: target?.key ?? null,
    targetValidity: target?.targetValidity,
    timeTrackingAllowed: target?.timeTrackingAllowed,
    assignedToUserToday: target?.assignedToUserToday,
    explicitlyAllowed: target?.explicitlyAllowed,
    targetSource: target?.targetSource ?? null,
    policyUsed,
  };
}

function deny(
  reason: AutoStartDecisionReason,
  evidence: AutoStartEvidence,
  confidence: Confidence,
): AutoStartDecisionResult {
  return {
    allowed: false,
    reason,
    confidence,
    startAt: null,
    targetId: null,
    targetType: null,
    targetName: null,
    source: null,
    evidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision
// ─────────────────────────────────────────────────────────────────────────────

export function decideAutoStart(input: DecideAutoStartInput): AutoStartDecisionResult {
  const { currentSegment: seg, target, localTime } = input;
  const dayP = input.policy?.day ?? defaultDayPolicy;
  const nightP = input.policy?.night ?? defaultNightPolicy;
  const night = isNightLocal(localTime, nightP);
  const activePolicy: DwellPolicy = night ? nightP : dayP;
  const policyUsed: 'day' | 'night' = night ? 'night' : 'day';

  const evidence = buildEvidence({
    segment: seg,
    target,
    policy: activePolicy,
    policyUsed,
    localIso: localTime,
  });

  // Already active timer → never auto-start.
  if (input.existingActiveRegistration) {
    return deny('blocked_already_active', evidence, seg.confidence);
  }

  // HOME WINS OVER WORK — if the candidate stay center sits inside a
  // staff private zone (home/private_residence/manual_ignore/recurring_night),
  // GPS may NEVER auto-start a project/booking/warehouse timer here. Even if
  // a nearby work target also matches, the user is at HOME. The
  // processGpsTimelineForAutoStart caller surfaces the diagnostics
  // (matchedPrivateResidence, homeWonOverWorkTarget, …).
  if (input.insidePrivateResidence) {
    return deny('blocked_inside_private_residence', evidence, seg.confidence);
  }

  // Movement / transport never auto-starts.
  if (seg.kind === 'travel' || seg.type === 'transport') {
    return deny('blocked_movement_only', evidence, seg.confidence);
  }

  // GPS gap never auto-starts (and a gap may never become travel either).
  if (seg.kind === 'gps_gap' || seg.type === 'gps_gap') {
    return deny('blocked_gps_gap', evidence, seg.confidence);
  }

  // Unknown place never auto-starts.
  if (seg.type === 'unknown_place') {
    return deny('blocked_unknown_place', evidence, seg.confidence);
  }

  // Must be a stay at a known site.
  if (seg.kind !== 'stay' || seg.type !== 'known_site') {
    return deny('blocked_unknown_place', evidence, seg.confidence);
  }

  if (!target) {
    return deny('blocked_invalid_target', evidence, seg.confidence);
  }

  // Stale / cached pings → treat as low confidence.
  if (seg.isStaleOrCached) {
    return deny('blocked_low_confidence', evidence, seg.confidence);
  }

  // Target classification.
  if (isTestOrDemo(target)) {
    return deny('blocked_test_target', evidence, seg.confidence);
  }
  if (isHomeOrPrivate(target)) {
    return deny('blocked_home_or_private', evidence, seg.confidence);
  }
  if (isInvalidTarget(target)) {
    return deny('blocked_invalid_target', evidence, seg.confidence);
  }

  // v1 gate: only a subset of target sources may auto-start time.
  // active_project / recent_confirmed are intentionally excluded until
  // the engine is verified end-to-end. The target may still appear as
  // known_site in GPS Day Timeline — it just won't auto-start time.
  const src = target.targetSource;
  if (src && !AUTOSTARTABLE_TARGET_SOURCES.has(src as AutoStartableTargetSource)) {
    return deny('blocked_target_not_autostartable_source', evidence, seg.confidence);
  }

  // Dwell / ping / confidence thresholds.
  const dwellMin = seg.durationMin;
  const requiredDwellMin = activePolicy.minDwellSeconds / 60;
  if (seg.pingCount < activePolicy.minArrivalPings) {
    return deny(
      night ? 'blocked_night_requires_stronger_evidence' : 'blocked_not_enough_pings',
      evidence,
      seg.confidence,
    );
  }
  if (dwellMin < requiredDwellMin) {
    return deny(
      night ? 'blocked_night_requires_stronger_evidence' : 'blocked_not_enough_dwell',
      evidence,
      seg.confidence,
    );
  }
  if (seg.confidence < activePolicy.minConfidence) {
    return deny(
      night ? 'blocked_night_requires_stronger_evidence' : 'blocked_low_confidence',
      evidence,
      seg.confidence,
    );
  }

  // Night: require planned or explicitly allowed target.
  if (night && nightP.requirePlannedOrExplicitAllowedTarget) {
    const planned = target.assignedToUserToday === true;
    const explicit = target.explicitlyAllowed === true;
    if (!planned && !explicit) {
      return deny('blocked_night_requires_stronger_evidence', evidence, seg.confidence);
    }
  }

  // ✓ All checks passed — assemble allowed result.
  const startAt = seg.startTs ?? null;
  const targetId = target.refId ?? null;
  const targetType = target.kind ?? null;
  const targetName = target.label ?? null;
  const source: AutoStartSource = 'gps_geofence_auto_start';

  if (!startAt || !targetId || !targetType || !targetName) {
    return deny('blocked_missing_allowed_decision_fields', evidence, seg.confidence);
  }

  return {
    allowed: true,
    reason: 'allowed_valid_geofence',
    confidence: seg.confidence,
    startAt,
    targetId,
    targetType,
    targetName,
    source,
    evidence,
  };
}

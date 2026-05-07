/**
 * Time Engine — Policy (frontend mirror of Deno timePolicy.ts)
 *
 * Speglar `supabase/functions/_shared/time-engine/timePolicy.ts` 1:1.
 * Håll filerna i synk för hand — ingen cross-import över Deno/Vite-gränsen.
 *
 * UI får använda detta för debug-paneler och förklaringstexter, men
 * INTE för att skapa tid: kontraktet ActiveTimeRegistration.source
 * är fortsatt låst till 'user_timer'.
 *
 * Se Deno-filens header för fullständiga huvudregler.
 */

import type {
  AutoStartBlockedReason,
  Confidence,
  GpsSegment,
  TargetMatch,
  TimeRegistrationSegmentKind,
  WorkTarget,
} from './contracts';

// ─── Policy values ──────────────────────────────────────────────────────────

export interface DwellPolicy {
  minDwellSeconds: number;
  minArrivalPings: number;
  minConfidence: Confidence;
}

export const dayPolicy: DwellPolicy = {
  minDwellSeconds: 5 * 60,
  minArrivalPings: 3,
  minConfidence: 0.7,
};

export interface NightPolicy extends DwellPolicy {
  localStartHour: 0;
  localEndHour: 5;
  requirePlannedOrExplicitAllowedTarget: true;
}

export const nightPolicy: NightPolicy = {
  localStartHour: 0,
  localEndHour: 5,
  minDwellSeconds: 15 * 60,
  minArrivalPings: 6,
  minConfidence: 0.85,
  requirePlannedOrExplicitAllowedTarget: true,
};

// ─── Decision reasons ───────────────────────────────────────────────────────

export type AutoStartAllowReason = 'allowed_valid_geofence';

export type AutoStartDenyReason =
  | 'blocked_movement_only'
  | 'blocked_unknown_place'
  | 'blocked_gps_gap'
  | 'blocked_low_confidence'
  | 'blocked_invalid_target'
  | 'blocked_test_target'
  | 'blocked_home_or_private'
  | 'blocked_not_enough_dwell'
  | 'blocked_not_enough_pings'
  | 'blocked_night_requires_stronger_evidence';

export type PolicyAutoStartReason = AutoStartAllowReason | AutoStartDenyReason;

export type PolicyDecision =
  | { allowed: true; reason: AutoStartAllowReason; target: WorkTarget; confidence: Confidence }
  | { allowed: false; reason: AutoStartDenyReason; target?: WorkTarget; confidence: Confidence };

/**
 * Policy deny reasons map 1:1 onto the contract's AutoStartBlockedReason set.
 * Kept as a function for forward-compat in case the two diverge.
 */
export function mapDenyToContractReason(reason: AutoStartDenyReason): AutoStartBlockedReason {
  return reason;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_TARGET_HINTS = ['test', 'demo', 'sandbox', 'playground'];
const PRIVATE_TARGET_HINTS = ['home', 'hem', 'privat', 'private'];

const isTestTarget = (t: WorkTarget) =>
  TEST_TARGET_HINTS.some((h) => (t.label || '').toLowerCase().includes(h));

const isHomeOrPrivate = (t: WorkTarget) =>
  PRIVATE_TARGET_HINTS.some((h) => (t.label || '').toLowerCase().includes(h));

function isTargetCurrentlyValid(t: WorkTarget, atIso: string): boolean {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return false;
  if (t.validFrom && Date.parse(t.validFrom) > at) return false;
  if (t.validUntil && Date.parse(t.validUntil) < at) return false;
  return true;
}

function dwellSeconds(seg: GpsSegment): number {
  if (!seg.endedAt) return 0;
  return Math.max(0, Math.floor((Date.parse(seg.endedAt) - Date.parse(seg.startedAt)) / 1000));
}

export function isNightLocal(atIso: string, np: NightPolicy = nightPolicy): boolean {
  const hour = new Date(atIso).getHours();
  return hour >= np.localStartHour && hour < np.localEndHour;
}

export const localHour = (atIso: string): number => new Date(atIso).getHours();

// ─── Auto-start evaluation ──────────────────────────────────────────────────

export interface EvaluateAutoStartInput {
  segment: GpsSegment;
  match: TargetMatch;
  atIso?: string;
}

export function evaluateAutoStart(input: EvaluateAutoStartInput): PolicyDecision {
  const { segment, match } = input;
  const atIso = input.atIso ?? segment.endedAt ?? segment.startedAt;

  if (segment.kind === 'movement' || match.outcome === 'transport') {
    return { allowed: false, reason: 'blocked_movement_only', confidence: match.confidence };
  }
  if (segment.kind === 'gps_gap' || match.outcome === 'gps_uncertain') {
    return { allowed: false, reason: 'blocked_gps_gap', confidence: match.confidence };
  }
  if (match.outcome === 'unknown_place') {
    return { allowed: false, reason: 'blocked_unknown_place', confidence: match.confidence };
  }
  if (match.outcome !== 'inside_known_target' || !match.target) {
    return { allowed: false, reason: 'blocked_unknown_place', confidence: match.confidence };
  }

  const target = match.target;

  if (!isTargetCurrentlyValid(target, atIso)) {
    return { allowed: false, reason: 'blocked_invalid_target', target, confidence: match.confidence };
  }
  if (isTestTarget(target)) {
    return { allowed: false, reason: 'blocked_test_target', target, confidence: match.confidence };
  }
  if (isHomeOrPrivate(target)) {
    return { allowed: false, reason: 'blocked_home_or_private', target, confidence: match.confidence };
  }

  const night = isNightLocal(atIso);
  const policy: DwellPolicy = night ? nightPolicy : dayPolicy;

  const pings = segment.pingCount ?? 0;
  if (pings < policy.minArrivalPings) {
    return night
      ? { allowed: false, reason: 'blocked_night_requires_stronger_evidence', target, confidence: match.confidence }
      : { allowed: false, reason: 'blocked_not_enough_pings', target, confidence: match.confidence };
  }

  const dwell = dwellSeconds(segment);
  if (dwell < policy.minDwellSeconds) {
    return night
      ? { allowed: false, reason: 'blocked_night_requires_stronger_evidence', target, confidence: match.confidence }
      : { allowed: false, reason: 'blocked_not_enough_dwell', target, confidence: match.confidence };
  }

  if (match.confidence < policy.minConfidence) {
    return night
      ? { allowed: false, reason: 'blocked_night_requires_stronger_evidence', target, confidence: match.confidence }
      : { allowed: false, reason: 'blocked_low_confidence', target, confidence: match.confidence };
  }

  if (night && nightPolicy.requirePlannedOrExplicitAllowedTarget && !target.assignedToUserToday) {
    return {
      allowed: false,
      reason: 'blocked_night_requires_stronger_evidence',
      target,
      confidence: match.confidence,
    };
  }

  return { allowed: true, reason: 'allowed_valid_geofence', target, confidence: match.confidence };
}

// ─── Active classification (rule 5) ─────────────────────────────────────────

export function classifyActiveSegment(
  segment: GpsSegment,
  match: TargetMatch,
): { kind: TimeRegistrationSegmentKind; targetKey: string | null; label: string } {
  if (segment.kind === 'movement' || match.outcome === 'transport') {
    return { kind: 'transport', targetKey: null, label: 'Transport' };
  }
  if (segment.kind === 'gps_gap' || match.outcome === 'gps_uncertain' || match.outcome === 'insufficient_signal') {
    return { kind: 'gps_uncertain', targetKey: null, label: 'GPS-osäkerhet' };
  }
  if (match.outcome === 'inside_known_target' && match.target) {
    const t = match.target;
    const kind: TimeRegistrationSegmentKind =
      t.kind === 'project' ? 'project'
      : t.kind === 'booking' ? 'booking'
      : t.kind === 'warehouse' ? 'warehouse'
      : 'unknown_place';
    return { kind, targetKey: t.key, label: t.label };
  }
  return { kind: 'unknown_place', targetKey: null, label: 'Okänd plats' };
}

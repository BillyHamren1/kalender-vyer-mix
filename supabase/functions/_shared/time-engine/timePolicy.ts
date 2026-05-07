/**
 * Time Engine — Policy (Deno / Edge Functions)
 * ============================================
 *
 * Kodnära policyregler för nya Time Engine. Tydlig, läsbar, testbar.
 *
 * HUVUDREGLER:
 *   1. GPS FÅR skapa fysisk timeline (GpsDayTimeline).
 *   2. GPS FÅR matcha giltiga arbetsplatser (TargetMatch).
 *   3. GPS FÅR auto-starta tid ENDAST vid giltig arbetsplats/geofence
 *      som möter dwell/ping/confidence-kraven nedan.
 *   4. GPS FÅR ALDRIG auto-starta tid från:
 *        - rörelse (movement)
 *        - okänd plats (unknown_place)
 *        - GPS-glapp (gps_gap)
 *        - låg confidence
 *        - test/demo-target
 *        - cancelled/archived target
 *        - home/private place
 *        - ensam ping (singleton)
 *   5. Under AKTIV tidsregistrering FÅR GPS automatiskt FÖRDELA tiden på:
 *        booking | project | warehouse | transport | unknown_place | gps_uncertain
 *   6. Natt 00:00–05:00 kräver STARKARE bevis (fler pings, längre dwell,
 *      högre confidence, planerad/explicit tillåten target). Riktiga
 *      nattjobb förbjuds INTE — de måste bara möta nightPolicy.
 *   7. Time reports skapas INTE i denna fas.
 *   8. workday används INTE i nya motorn.
 *   9. location_time_entries används INTE i nya motorn.
 *  10. travel_time_logs används INTE i nya motorn.
 *
 * Allt skrivet mot kontrakten i ./contracts.ts. Inga legacy-importer.
 */

import type {
  AutoStartBlockedReason,
  Confidence,
  GpsSegment,
  TargetMatch,
  WorkTarget,
} from './contracts.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Policy values
// ─────────────────────────────────────────────────────────────────────────────

export interface DwellPolicy {
  minDwellSeconds: number;
  minArrivalPings: number;
  minConfidence: Confidence;
}

export const dayPolicy: DwellPolicy = {
  minDwellSeconds: 5 * 60,    // 5 minuter stillastående
  minArrivalPings: 3,         // minst 3 GPS-pings (ej ensam ping)
  minConfidence: 0.7,
};

export interface NightPolicy extends DwellPolicy {
  localStartHour: 0;
  localEndHour: 5;
  /** Nattjobb tillåts men kräver planerad eller explicit tillåten target. */
  requirePlannedOrExplicitAllowedTarget: true;
}

export const nightPolicy: NightPolicy = {
  localStartHour: 0,
  localEndHour: 5,
  minDwellSeconds: 15 * 60,   // 15 minuter stillastående på natten
  minArrivalPings: 6,         // dubbelt så många pings krävs
  minConfidence: 0.85,
  requirePlannedOrExplicitAllowedTarget: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Decision reasons (alltid en tydlig anledning)
// ─────────────────────────────────────────────────────────────────────────────

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

export type AutoStartReason = AutoStartAllowReason | AutoStartDenyReason;

/**
 * Policyutfall för en EN GPS-segment-mot-target-bedömning.
 *
 * Detta är policyns interna verdict. Det officiella API:t mot resten
 * av motorn (`AutoStartDecision` i contracts.ts) blockerar fortfarande
 * GPS-skapande av timern i nuvarande fas — policyn är förberedelsen
 * för en framtida öppning, men dess "allowed_valid_geofence" får i
 * denna fas INTE skapa `current_time_registration`.
 *
 * Mappning till `AutoStartBlockReason` finns i `mapDenyToContractReason`.
 */
export type PolicyDecision =
  | {
      allowed: true;
      reason: AutoStartAllowReason;
      target: WorkTarget;
      confidence: Confidence;
    }
  | {
      allowed: false;
      reason: AutoStartDenyReason;
      target?: WorkTarget;
      confidence: Confidence;
    };

/** Mappa policy-deny till kontraktets AutoStartBlockReason. */
export function mapDenyToContractReason(
  reason: AutoStartDenyReason,
): AutoStartBlockReason {
  switch (reason) {
    case 'blocked_movement_only':
      return 'movement_not_allowed';
    case 'blocked_unknown_place':
    case 'blocked_home_or_private':
    case 'blocked_invalid_target':
    case 'blocked_test_target':
    case 'blocked_gps_gap':
      return 'unknown_place_not_allowed';
    case 'blocked_low_confidence':
    case 'blocked_not_enough_dwell':
    case 'blocked_not_enough_pings':
      return 'low_confidence';
    case 'blocked_night_requires_stronger_evidence':
      return 'blocked_night_auto_start_no_active_timer';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hjälpare
// ─────────────────────────────────────────────────────────────────────────────

const TEST_TARGET_HINTS = ['test', 'demo', 'sandbox', 'playground'];
const PRIVATE_TARGET_HINTS = ['home', 'hem', 'privat', 'private'];

function isTestTarget(t: WorkTarget): boolean {
  const label = (t.label || '').toLowerCase();
  return TEST_TARGET_HINTS.some((h) => label.includes(h));
}

function isHomeOrPrivate(t: WorkTarget): boolean {
  const label = (t.label || '').toLowerCase();
  return PRIVATE_TARGET_HINTS.some((h) => label.includes(h));
}

function isTargetCurrentlyValid(t: WorkTarget, atIso: string): boolean {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return false;
  if (t.validFrom && Date.parse(t.validFrom) > at) return false;
  if (t.validUntil && Date.parse(t.validUntil) < at) return false;
  return true;
}

function dwellSeconds(seg: GpsSegment): number {
  if (!seg.endedAt) return 0;
  const start = Date.parse(seg.startedAt);
  const end = Date.parse(seg.endedAt);
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function isNightLocal(
  atIso: string,
  np: NightPolicy = nightPolicy,
): boolean {
  // Lokal tid på exekverande server. Edge runtime är UTC; konsumenter
  // som vill ha Stockholm-tid bör skicka in atIso justerat eller wrappa
  // detta anrop. Vi exponerar localHour för debug.
  const d = new Date(atIso);
  const hour = d.getHours();
  return hour >= np.localStartHour && hour < np.localEndHour;
}

export function localHour(atIso: string): number {
  return new Date(atIso).getHours();
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-start evaluation
// ─────────────────────────────────────────────────────────────────────────────

export interface EvaluateAutoStartInput {
  segment: GpsSegment;
  match: TargetMatch;
  /** Tidpunkten beslutet gäller, default = segment.endedAt eller startedAt. */
  atIso?: string;
}

/**
 * Avgör om en GPS-segment-match får auto-starta tid enligt policyn.
 *
 * OBS: Även när detta returnerar `allowed: true` är det INTE tillåtet att
 * faktiskt skapa `current_time_registration` i nuvarande fas — kontraktet
 * `ActiveTimeRegistration.source` är låst till `'user_timer'`. Funktionen
 * är förberedelse + policy-sanity för framtida öppning.
 */
export function evaluateAutoStart(input: EvaluateAutoStartInput): PolicyDecision {
  const { segment, match } = input;
  const atIso = input.atIso ?? segment.endedAt ?? segment.startedAt;

  // 4. GPS får ALDRIG auto-starta från rörelse / glapp / okänd plats.
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

  // 4. Test/demo, cancelled/archived, home/private.
  if (!isTargetCurrentlyValid(target, atIso)) {
    return { allowed: false, reason: 'blocked_invalid_target', target, confidence: match.confidence };
  }
  if (isTestTarget(target)) {
    return { allowed: false, reason: 'blocked_test_target', target, confidence: match.confidence };
  }
  if (isHomeOrPrivate(target)) {
    return { allowed: false, reason: 'blocked_home_or_private', target, confidence: match.confidence };
  }

  // 6. Välj day vs night-policy.
  const night = isNightLocal(atIso);
  const policy: DwellPolicy = night ? nightPolicy : dayPolicy;

  // 4. Singleton-ping / dwell.
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

  // 6. Natt: kräv planerad/explicit tillåten target.
  if (night && nightPolicy.requirePlannedOrExplicitAllowedTarget) {
    if (!target.assignedToUserToday) {
      return {
        allowed: false,
        reason: 'blocked_night_requires_stronger_evidence',
        target,
        confidence: match.confidence,
      };
    }
  }

  // 3. Allt OK → giltig geofence.
  return {
    allowed: true,
    reason: 'allowed_valid_geofence',
    target,
    confidence: match.confidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Klassificeringspolicy under aktiv tidsregistrering (regel 5)
// ─────────────────────────────────────────────────────────────────────────────

import type { TimeRegistrationSegmentKind } from './contracts.ts';

/**
 * Bestäm hur ett GPS-segment ska klassas under en aktiv tidsregistrering.
 * GPS får automatiskt fördela tid på dessa kinds, INGET annat.
 */
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
      : 'unknown_place'; // organization_location utan tydlig kategori
    return { kind, targetKey: t.key, label: t.label };
  }
  return { kind: 'unknown_place', targetKey: null, label: 'Okänd plats' };
}

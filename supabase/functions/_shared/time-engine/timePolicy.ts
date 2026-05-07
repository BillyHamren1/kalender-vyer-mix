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

export type PolicyAutoStartReason = AutoStartAllowReason | AutoStartDenyReason;

/**
 * Policyutfall för en EN GPS-segment-mot-target-bedömning.
 *
 * Detta är policyns interna verdict. Resten av motorn använder
 * `AutoStartDecision` från contracts.ts. Mappning sker via
 * `mapDenyToContractReason` (1:1 mot AutoStartBlockedReason).
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

/** Mappa policy-deny till kontraktets AutoStartBlockedReason (1:1). */
export function mapDenyToContractReason(
  reason: AutoStartDenyReason,
): AutoStartBlockedReason {
  return reason;
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
//
// SINGLE SOURCE OF TRUTH:
//   `decideAutoStart()` i `./decideAutoStart.ts` är den enda funktionen
//   som avgör om GPS får auto-starta tid. Den producerar kontraktets
//   `AutoStartDecision` (allowed | blocked) och använder dayPolicy/
//   nightPolicy + isNightLocal från denna fil.
//
//   Den tidigare `evaluateAutoStart(segment, match)`-varianten är
//   borttagen för att inte ha två parallella verklighetsbilder av
//   samma beslut. Använd `decideAutoStart` direkt.


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

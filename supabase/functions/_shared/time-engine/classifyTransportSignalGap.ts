// @ts-nocheck
/**
 * Time Engine — classifyTransportSignalGap
 * ────────────────────────────────────────
 *
 * Pure helper. Given a short GPS gap inside what looks like a transport
 * sequence (own GPS before AND after, no conflicting signals), decide whether
 * the gap should be folded into the transport block or remain "Osäker period".
 *
 * Companion route evidence is FIRST-CLASS — it can promote the classification
 * to confirmed_transport_gap before any AI or fallback is needed.
 *
 * Pure: no DB, no AI, no writes.
 */

import type { WorkTarget } from './contracts.ts';
import type { CompanionRouteEvidence } from './findCompanionRouteEvidence.ts';

const EARTH_R = 6_371_000;
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export type TransportGapClassification =
  | 'confirmed_transport_gap'
  | 'probable_transport_gap'
  | 'unknown_gap_needs_review';

export type TransportGapConfidence = 'very_high' | 'high' | 'medium' | 'low';

export interface ClassifyTransportSignalGapInput {
  gapStartIso: string;
  gapEndIso: string;
  previousKnownPosition: { lat: number; lng: number } | null;
  nextKnownPosition: { lat: number; lng: number } | null;
  /** Was the segment immediately before the gap a travel segment? */
  previousIsTransport: boolean;
  /** Was the segment immediately after the gap a travel segment? */
  nextIsTransport: boolean;
  /** Resolved work target for the next stable position (if any). */
  destinationCandidate: WorkTarget | null;
  conflictingSignals: {
    anyHardGeoEntry: boolean;
    anyConfirmedStayAtOtherPlace: boolean;
    anyHomePrivate: boolean;
  };
  companionRouteEvidence: CompanionRouteEvidence;
}

export interface ClassifyTransportSignalGapResult {
  classification: TransportGapClassification;
  confidence: TransportGapConfidence;
  confidenceScore: number;
  countsAsTransport: boolean;
  reasons: string[];
  warningLabel: string;
  destinationEvidence: {
    label: string | null;
    targetType: string | null;
    targetSource: string | null;
    isWorkRelated: boolean;
    confidence: 'high' | 'medium' | 'low';
  } | null;
  companionRouteEvidence: CompanionRouteEvidence;
  impliedSpeedKmh: number | null;
  gapMinutes: number;
}

const MAX_GAP_MIN = 30;
const MIN_SPEED_KMH = 5;
const MAX_SPEED_KMH = 130;

function buildWarningLabel(matchedCount: number, gapMin: number): string {
  if (matchedCount >= 2) return `GPS saknades ${gapMin} min · rutt bekräftad av ${matchedCount} personer`;
  if (matchedCount === 1) return `GPS saknades ${gapMin} min · rutt bekräftad av annan personal`;
  return `GPS saknades ${gapMin} min under resan`;
}

export function classifyTransportSignalGap(
  input: ClassifyTransportSignalGapInput,
): ClassifyTransportSignalGapResult {
  const gapMs = Date.parse(input.gapEndIso) - Date.parse(input.gapStartIso);
  const gapMinutes = Math.max(0, Math.round(gapMs / 60000));

  const reasons: string[] = [];
  const companion = input.companionRouteEvidence;

  let distanceMeters: number | null = null;
  let impliedSpeedKmh: number | null = null;
  if (input.previousKnownPosition && input.nextKnownPosition && gapMinutes > 0) {
    distanceMeters = haversineM(
      input.previousKnownPosition.lat, input.previousKnownPosition.lng,
      input.nextKnownPosition.lat, input.nextKnownPosition.lng,
    );
    impliedSpeedKmh = (distanceMeters / 1000) / (gapMinutes / 60);
  }

  const destinationIsWorkRelated =
    !!input.destinationCandidate && (input.destinationCandidate.kind === 'organization_location'
      || input.destinationCandidate.kind === 'project'
      || input.destinationCandidate.kind === 'large_project'
      || input.destinationCandidate.kind === 'booking');

  const destinationEvidence = input.destinationCandidate
    ? {
        label: input.destinationCandidate.label ?? null,
        targetType: input.destinationCandidate.kind ?? null,
        targetSource: input.destinationCandidate.kind ?? null,
        isWorkRelated: destinationIsWorkRelated,
        confidence: destinationIsWorkRelated ? 'high' as const : 'medium' as const,
      }
    : null;

  const warningLabel = buildWarningLabel(companion.matchedStaffCount, gapMinutes);

  // Hard rejects — keep as needs_review.
  const fail = (reason: string): ClassifyTransportSignalGapResult => {
    reasons.push(reason);
    return {
      classification: 'unknown_gap_needs_review',
      confidence: 'low',
      confidenceScore: 0.2,
      countsAsTransport: false,
      reasons,
      warningLabel,
      destinationEvidence,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  };

  if (input.conflictingSignals.anyHardGeoEntry) return fail('conflict_hard_geo_entry');
  if (input.conflictingSignals.anyConfirmedStayAtOtherPlace) return fail('conflict_confirmed_stay');
  if (input.conflictingSignals.anyHomePrivate) return fail('conflict_home_private');
  if (gapMinutes > MAX_GAP_MIN) return fail('gap_too_long');
  if (!input.previousKnownPosition || !input.nextKnownPosition) return fail('missing_anchors');

  if (distanceMeters != null && distanceMeters > 500 && impliedSpeedKmh != null) {
    if (impliedSpeedKmh < MIN_SPEED_KMH || impliedSpeedKmh > MAX_SPEED_KMH) {
      return fail('implausible_speed');
    }
  }

  // Confidence pyramid.
  if (companion.matched && companion.confidence === 'very_high') {
    reasons.push(...companion.reasons);
    reasons.push('short_signal_gap_inside_confirmed_route');
    return {
      classification: 'confirmed_transport_gap',
      confidence: 'very_high',
      confidenceScore: 0.95,
      countsAsTransport: true,
      reasons,
      warningLabel,
      destinationEvidence,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  const surroundedByTransport = input.previousIsTransport && input.nextIsTransport;

  if ((companion.matched && companion.confidence === 'high')
      || (destinationIsWorkRelated && surroundedByTransport)) {
    if (companion.matched) reasons.push(...companion.reasons);
    reasons.push('short_signal_gap_inside_confirmed_route');
    return {
      classification: 'confirmed_transport_gap',
      confidence: 'high',
      confidenceScore: 0.9,
      countsAsTransport: true,
      reasons,
      warningLabel,
      destinationEvidence,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  if ((companion.matched && companion.confidence === 'medium') || surroundedByTransport) {
    if (companion.matched) reasons.push(...companion.reasons);
    reasons.push('probable_transport_gap_partial_evidence');
    return {
      classification: 'probable_transport_gap',
      confidence: 'medium',
      confidenceScore: 0.7,
      countsAsTransport: true,
      reasons,
      warningLabel,
      destinationEvidence,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  return fail('insufficient_transport_evidence');
}

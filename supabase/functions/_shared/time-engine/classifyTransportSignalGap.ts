// @ts-nocheck
/**
 * Time Engine — classifyTransportSignalGap
 * ────────────────────────────────────────
 *
 * Pure helper. Decide whether a short GPS gap inside a transport sequence
 * should be folded into the transport block or kept as "needs review".
 *
 * KEY RULES (v2 — transport blocks may be anchors):
 *   - We do NOT require stable-stay anchors on both sides. Transport segments
 *     count as anchors and route-continuation alone (gap between transports +
 *     own pings before/after + plausible speed when measurable) is sufficient
 *     for confirmed_transport_gap (high confidence).
 *   - Companion-route evidence is an extra boost, never a requirement.
 *   - destinationConfirmed=false + routeContinuationConfirmed=true is allowed.
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
  /** Last own GPS ping/segment endpoint before the gap (any segment kind). */
  previousKnownPosition: { lat: number; lng: number } | null;
  /** First own GPS ping/segment startpoint after the gap (any segment kind). */
  nextKnownPosition: { lat: number; lng: number } | null;
  /** Was the segment immediately before the gap a travel segment? */
  previousIsTransport: boolean;
  /** Was the segment immediately after the gap a travel segment? */
  nextIsTransport: boolean;
  /** Resolved destination (immediate next stable stay, or later in transport chain). */
  destinationCandidate: WorkTarget | null;
  /** Resolved origin (immediate previous stable stay), if it is a known work target. */
  originCandidate?: WorkTarget | null;
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
  destinationConfirmed: boolean;
  routeContinuationConfirmed: boolean;
  transportAnchorsUsed: boolean;
  companionRouteEvidence: CompanionRouteEvidence;
  impliedSpeedKmh: number | null;
  gapMinutes: number;
}

const MAX_GAP_MIN = 30;
/** Relaxed cap when BOTH ends are known work targets (origin + destination).
 *  A clear stay-A → stay-B transition with both anchors and plausible speed
 *  is treated as transport even when the GPS gap is longer. Capped to keep
 *  half-day gaps from being silently turned into trips. */
const MAX_GAP_MIN_KNOWN_ENDS = 240;
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
    !!input.destinationCandidate && (
      input.destinationCandidate.kind === 'organization_location'
      || input.destinationCandidate.kind === 'project'
      || input.destinationCandidate.kind === 'booking'
      || input.destinationCandidate.kind === 'warehouse'
    );

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
  const surroundedByTransport = input.previousIsTransport && input.nextIsTransport;
  const transportAnchorsUsed = input.previousIsTransport || input.nextIsTransport;
  const hasAnyAnchor = !!(input.previousKnownPosition || input.nextKnownPosition);
  const hasBothAnchors = !!(input.previousKnownPosition && input.nextKnownPosition);

  const originIsWorkRelated =
    !!input.originCandidate && (
      input.originCandidate.kind === 'organization_location'
      || input.originCandidate.kind === 'project'
      || input.originCandidate.kind === 'booking'
      || input.originCandidate.kind === 'warehouse'
    );
  /** Both ends are KNOWN work targets (different sites). A clean
   *  stay-A → stay-B transition with no GPS pings between is a real trip. */
  const knownEndToKnownEnd =
    originIsWorkRelated
    && destinationIsWorkRelated
    && hasBothAnchors
    && input.originCandidate?.refId !== input.destinationCandidate?.refId;

  // Speed validation only when both anchors known AND distance > 500 m.
  const speedOk =
    distanceMeters == null || distanceMeters <= 500
      ? true
      : impliedSpeedKmh != null && impliedSpeedKmh >= MIN_SPEED_KMH && impliedSpeedKmh <= MAX_SPEED_KMH;

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
      destinationConfirmed: false,
      routeContinuationConfirmed: false,
      transportAnchorsUsed,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  };

  // Hard rejects.
  if (input.conflictingSignals.anyHardGeoEntry) return fail('conflict_hard_geo_entry');
  if (input.conflictingSignals.anyConfirmedStayAtOtherPlace) return fail('conflict_confirmed_stay');
  if (input.conflictingSignals.anyHomePrivate) return fail('conflict_home_private');
  const effectiveMaxGap = knownEndToKnownEnd ? MAX_GAP_MIN_KNOWN_ENDS : MAX_GAP_MIN;
  if (gapMinutes > effectiveMaxGap) return fail('gap_too_long');
  if (!hasAnyAnchor && !surroundedByTransport) return fail('no_transport_evidence');
  if (!speedOk) return fail('implausible_speed');

  // Known-work-target on both ends with plausible speed → confirmed transport.
  // Anchors are the surrounding stays themselves; no transport pings required.
  if (knownEndToKnownEnd && speedOk) {
    reasons.push('known_work_target_on_both_ends');
    if (distanceMeters != null) reasons.push(`distance_${Math.round(distanceMeters)}m`);
    if (impliedSpeedKmh != null) reasons.push(`speed_${Math.round(impliedSpeedKmh)}kmh`);
    return {
      classification: 'confirmed_transport_gap',
      confidence: 'high',
      confidenceScore: 0.88,
      countsAsTransport: true,
      reasons,
      warningLabel,
      destinationEvidence,
      destinationConfirmed: true,
      routeContinuationConfirmed: true,
      transportAnchorsUsed,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  const routeContinuationConfirmed =
    surroundedByTransport || (transportAnchorsUsed && hasAnyAnchor);

  // Companion at very_high → confirmed/very_high.
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
      destinationConfirmed: destinationIsWorkRelated,
      routeContinuationConfirmed: true,
      transportAnchorsUsed,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  // Confirmed (high) without companion: surrounded by transport with own
  // anchors and either work-destination OR plausible speed.
  if (
    surroundedByTransport
    && hasBothAnchors
    && (destinationIsWorkRelated || (impliedSpeedKmh != null && speedOk))
  ) {
    reasons.push('transport_anchors_both_sides');
    if (destinationIsWorkRelated) reasons.push('destination_work_related');
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
      destinationConfirmed: destinationIsWorkRelated,
      routeContinuationConfirmed: true,
      transportAnchorsUsed,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  // Companion high or destination + transport shape → confirmed (high).
  if (
    (companion.matched && companion.confidence === 'high')
    || (destinationIsWorkRelated && (surroundedByTransport || transportAnchorsUsed))
  ) {
    if (companion.matched) reasons.push(...companion.reasons);
    if (destinationIsWorkRelated) reasons.push('destination_work_related');
    reasons.push('short_signal_gap_inside_confirmed_route');
    return {
      classification: 'confirmed_transport_gap',
      confidence: 'high',
      confidenceScore: 0.9,
      countsAsTransport: true,
      reasons,
      warningLabel,
      destinationEvidence,
      destinationConfirmed: destinationIsWorkRelated,
      routeContinuationConfirmed,
      transportAnchorsUsed,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  // Probable: surrounded by transport (route continuation confirmed) but no
  // confirmed destination, OR companion medium, OR transport on one side +
  // plausible speed between anchors.
  if (
    surroundedByTransport
    || (companion.matched && companion.confidence === 'medium')
    || (transportAnchorsUsed && hasBothAnchors && impliedSpeedKmh != null && speedOk)
  ) {
    if (companion.matched) reasons.push(...companion.reasons);
    if (surroundedByTransport) reasons.push('transport_anchors_both_sides');
    else if (transportAnchorsUsed) reasons.push('transport_anchor_one_side');
    reasons.push('probable_transport_gap_partial_evidence');
    return {
      classification: 'probable_transport_gap',
      confidence: 'medium',
      confidenceScore: 0.7,
      countsAsTransport: true,
      reasons,
      warningLabel,
      destinationEvidence,
      destinationConfirmed: destinationIsWorkRelated,
      routeContinuationConfirmed,
      transportAnchorsUsed,
      companionRouteEvidence: companion,
      impliedSpeedKmh,
      gapMinutes,
    };
  }

  return fail('insufficient_transport_evidence');
}

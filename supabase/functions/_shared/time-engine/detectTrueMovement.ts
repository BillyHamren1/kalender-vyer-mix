/**
 * Lager 2.5 — Verklig förflyttning.
 *
 * Skapar movement-segment ENDAST när det finns positiv evidence för att
 * personen faktiskt förflyttat sig mellan två olika stabila platser.
 *
 * SKAPAS INTE av:
 *   - signalgap utan pings emellan
 *   - en ensam GPS-spike / outlier
 *   - speed_mps utan platsbyte
 *   - kort intern rörelse på samma site (<500 m)
 *   - GPS-drift mellan samma target
 *
 * Movement-segment använder befintliga LocationTruthSegment-typen
 * (`type: 'movement'`) och stoppar metadata i `diagnostics.movementMeta`.
 */

import type {
  LocationTruthSegment,
  LocationTruthMatchedTarget,
} from './buildLocationTruthFromDayEvidence.ts';
import type { NormalizedGpsPing } from './normalizeGpsEvidence.ts';

export interface MovementDiagnostics {
  transitionCandidates: number;
  movementCreatedCount: number;
  internalMovementAbsorbedCount: number;
  rejectedSpeedOnlyCount: number;
  rejectedSameTargetCount: number;
  rejectedShortDistanceCount: number;
  rejectedSignalGapOnlyCount: number;
  rejectedOutlierBouncesCount: number;
  examples: Array<{
    fromSegmentId: string;
    toSegmentId: string;
    distanceMeters: number;
    gapMinutes: number;
    pingsBetween: number;
    decision:
      | 'movement_created'
      | 'internal_movement_absorbed'
      | 'transition_warning_no_pings'
      | 'rejected_same_target'
      | 'rejected_short_distance'
      | 'rejected_speed_only'
      | 'rejected_outlier_bounce';
    confidence?: 'high' | 'medium' | 'low';
  }>;
}

export interface DetectMovementResult {
  segments: LocationTruthSegment[];
  diagnostics: MovementDiagnostics;
}

const MIN_MOVEMENT_DISTANCE_M = 500;
const ROUTE_PING_MIN_DISTANCE_FROM_ENDPOINT_M = 200;
const MIN_MOVEMENT_DURATION_SEC = 30;

const STABLE_TYPES = new Set([
  'known_target',
  'known_address',
  'private_residence',
]);

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function sameTargetIdentity(
  a: LocationTruthSegment,
  b: LocationTruthSegment,
): boolean {
  if (
    a.matchedTarget &&
    b.matchedTarget &&
    a.matchedTarget.targetType === b.matchedTarget.targetType &&
    a.matchedTarget.targetId === b.matchedTarget.targetId
  ) {
    return true;
  }
  return false;
}

function makeMovementSegment(
  from: LocationTruthSegment,
  to: LocationTruthSegment,
  distanceMeters: number,
  pingsBetween: number,
  confidence: 'high' | 'medium' | 'low',
): LocationTruthSegment {
  const fromTarget: LocationTruthMatchedTarget | undefined = from.matchedTarget;
  const toTarget: LocationTruthMatchedTarget | undefined = to.matchedTarget;
  return {
    id: `mov_${from.id}__${to.id}`,
    staffId: from.staffId,
    startAt: from.endAt,
    endAt: to.startAt,
    type: 'movement',
    finalType: 'movement',
    matchedTarget: undefined,
    physicalLocation: undefined,
    businessContext: {
      status: 'unresolved_business_context',
      warnings: ['movement_between_targets'],
    },
    confidence,
    evidence: {
      pingCount: pingsBetween,
    },
    warnings: ['movement_between_targets'],
    diagnostics: {
      decisionReason: 'detected_true_movement',
      // @ts-ignore — extra metadata utöver kontraktet
      movementMeta: {
        fromTarget,
        toTarget,
        distanceMeters,
        pingsBetween,
      },
    },
  };
}

function pingsStrictlyBetween(
  pings: NormalizedGpsPing[],
  startIso: string,
  endIso: string,
): NormalizedGpsPing[] {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }
  return pings.filter((p) => {
    if (p.ignoredForLocationLogic || p.hardRejected) return false;
    const t = Date.parse(p.ts);
    return Number.isFinite(t) && t > start && t < end;
  });
}

function tagInternalMovement(
  a: LocationTruthSegment,
  b: LocationTruthSegment,
  distanceMeters: number,
): void {
  const tag = 'internal_movement_same_site';
  for (const seg of [a, b]) {
    if (!seg.warnings.includes(tag)) seg.warnings.push(tag);
    // @ts-ignore — utökad metadata
    seg.diagnostics.internalMovementMeters = Math.max(
      // @ts-ignore
      seg.diagnostics.internalMovementMeters ?? 0,
      Math.round(distanceMeters),
    );
  }
}

function tagTransitionWarning(
  a: LocationTruthSegment,
  b: LocationTruthSegment,
  reason: string,
): void {
  for (const seg of [a, b]) {
    if (!seg.warnings.includes(reason)) seg.warnings.push(reason);
  }
}

export function detectTrueMovement(
  segments: LocationTruthSegment[],
  pings: NormalizedGpsPing[] = [],
): DetectMovementResult {
  const diag: MovementDiagnostics = {
    transitionCandidates: 0,
    movementCreatedCount: 0,
    internalMovementAbsorbedCount: 0,
    rejectedSpeedOnlyCount: 0,
    rejectedSameTargetCount: 0,
    rejectedShortDistanceCount: 0,
    rejectedSignalGapOnlyCount: 0,
    rejectedOutlierBouncesCount: 0,
    examples: [],
  };

  if (!Array.isArray(segments) || segments.length < 2) {
    return { segments: segments ?? [], diagnostics: diag };
  }

  const sorted = [...segments].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );

  const inserts: Array<{ afterIndex: number; segment: LocationTruthSegment }> = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const A = sorted[i];
    if (!STABLE_TYPES.has(A.type)) continue;

    // Hitta nästa stabila segment — hoppa över unresolved_location-segment
    // (sparsamma route-pings som råkat klustras men inte är arbetsplats).
    let nextIdx = -1;
    for (let k = i + 1; k < sorted.length; k++) {
      const cand = sorted[k];
      if (cand.type === 'movement') continue;
      if (cand.type === 'unresolved_location') continue;
      if (STABLE_TYPES.has(cand.type)) {
        nextIdx = k;
        break;
      }
      // Övriga typer (needs_location_review etc.) bryter sökningen.
      break;
    }
    if (nextIdx === -1) continue;
    const B = sorted[nextIdx];

    // Samma target — bridge bör redan ha hanterat detta. Skydd: inget movement.
    if (sameTargetIdentity(A, B)) {
      diag.rejectedSameTargetCount++;
      continue;
    }

    const aLat = A.physicalLocation?.lat;
    const aLng = A.physicalLocation?.lng;
    const bLat = B.physicalLocation?.lat;
    const bLng = B.physicalLocation?.lng;
    if (
      !Number.isFinite(aLat) ||
      !Number.isFinite(aLng) ||
      !Number.isFinite(bLat) ||
      !Number.isFinite(bLng)
    ) {
      // Saknar koordinater på endera sidan ⇒ kan inte avgöra → transition warning.
      tagTransitionWarning(A, B, 'transition_unknown_distance');
      diag.transitionCandidates++;
      continue;
    }

    const distance = haversineMeters(aLat!, aLng!, bLat!, bLng!);
    const gapMs = Date.parse(B.startAt) - Date.parse(A.endAt);
    const gapMin = Math.max(0, Math.round(gapMs / 60000));
    const durationSec = Math.max(0, Math.round(gapMs / 1000));

    // Kort distans → intern rörelse, INGET movement-segment.
    if (distance < MIN_MOVEMENT_DISTANCE_M) {
      tagInternalMovement(A, B, distance);
      diag.internalMovementAbsorbedCount++;
      diag.rejectedShortDistanceCount++;
      pushExample(diag, A.id, B.id, distance, gapMin, 0, 'internal_movement_absorbed');
      continue;
    }

    // Pings strikt mellan A.endAt och B.startAt.
    const between = pingsStrictlyBetween(pings, A.endAt, B.startAt);

    // Kontrollera outlier-bounce: om alla mellan-pings ligger nära EN av
    // endpunkterna ⇒ ingen verklig rörelse. Vi vill se minst en ping som
    // ligger en bit (>=200 m) från BÅDA endpunkterna.
    let routePingCount = 0;
    for (const p of between) {
      const dA = haversineMeters(p.lat, p.lng, aLat!, aLng!);
      const dB = haversineMeters(p.lat, p.lng, bLat!, bLng!);
      if (
        dA >= ROUTE_PING_MIN_DISTANCE_FROM_ENDPOINT_M &&
        dB >= ROUTE_PING_MIN_DISTANCE_FROM_ENDPOINT_M
      ) {
        routePingCount++;
      }
    }

    // Inga pings emellan alls ⇒ bara signalgap. Transition warning, INGET movement.
    if (between.length === 0) {
      tagTransitionWarning(A, B, 'transition_candidate_no_ping_evidence');
      diag.transitionCandidates++;
      diag.rejectedSignalGapOnlyCount++;
      pushExample(diag, A.id, B.id, distance, gapMin, 0, 'transition_warning_no_pings');
      continue;
    }

    // Pings finns men ingen ligger på en faktisk route mellan A och B
    // ⇒ outlier-bounce / intern jitter. Ingen movement.
    if (routePingCount === 0) {
      tagTransitionWarning(A, B, 'transition_candidate_only_endpoint_pings');
      diag.transitionCandidates++;
      diag.rejectedOutlierBouncesCount++;
      pushExample(diag, A.id, B.id, distance, gapMin, between.length, 'rejected_outlier_bounce');
      continue;
    }

    // För kort fönster för att hinna förflytta sig en meningsfull sträcka.
    if (durationSec < MIN_MOVEMENT_DURATION_SEC) {
      diag.rejectedSpeedOnlyCount++;
      pushExample(diag, A.id, B.id, distance, gapMin, between.length, 'rejected_speed_only');
      continue;
    }

    // Confidence: many route pings + reasonable speed ⇒ high.
    const speedMps = durationSec > 0 ? distance / durationSec : 0;
    const reasonableSpeed = speedMps <= 60; // 60 m/s ≈ 216 km/h tak
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (routePingCount >= 2 && reasonableSpeed) confidence = 'high';
    if (routePingCount === 1 || !reasonableSpeed) confidence = 'low';

    const segment = makeMovementSegment(A, B, distance, between.length, confidence);
    inserts.push({ afterIndex: i, segment });
    diag.movementCreatedCount++;
    pushExample(diag, A.id, B.id, distance, gapMin, between.length, 'movement_created', confidence);
  }

  // Insertera nya movement-segment i tidsordning.
  if (inserts.length === 0) {
    return { segments: sorted, diagnostics: diag };
  }
  const out: LocationTruthSegment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    const ins = inserts.find((x) => x.afterIndex === i);
    if (ins) out.push(ins.segment);
  }
  return { segments: out, diagnostics: diag };
}

function pushExample(
  diag: MovementDiagnostics,
  fromId: string,
  toId: string,
  distanceMeters: number,
  gapMinutes: number,
  pingsBetween: number,
  decision: MovementDiagnostics['examples'][number]['decision'],
  confidence?: 'high' | 'medium' | 'low',
): void {
  if (diag.examples.length >= 8) return;
  diag.examples.push({
    fromSegmentId: fromId,
    toSegmentId: toId,
    distanceMeters: Math.round(distanceMeters),
    gapMinutes,
    pingsBetween,
    decision,
    confidence,
  });
}

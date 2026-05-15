/**
 * Lager 2.4 — Försiktig gap-policy för Location Truth.
 *
 * Grundregel: dela INTE på signalglapp om det inte finns positiv evidence
 * för att personen lämnat platsen. Om kluster A före gap och kluster B efter
 * gap matchar SAMMA target ⇒ slå ihop till ETT segment.
 *
 * Skapar aldrig:
 *   - signal_gap-segment
 *   - unknown
 *   - review
 *   - transport (transport hanteras i Lager 2.5)
 *
 * Lägger på warnings + diagnostics:
 *   - bridgedSignalGapMinutes
 *   - signal_gap_bridged   (30–120 min)
 *   - long_signal_gap      (>120 min)
 *   - transition_candidate (target A → target B utan transport-bevis)
 */

import type {
  LocationTruthSegment,
  LocationTruthSegmentType,
} from './buildLocationTruthFromDayEvidence.ts';

export interface GapBridgeDiagnostics {
  gapsEvaluated: number;
  gapsBridgedSameTarget: number;
  longGapsBridged: number;
  gapsThatCausedBreak: number;
  gapsPreservedAsUnknown: number;
  transitionCandidatesMarked: number;
  outliersAbsorbed: number;
  examples: Array<{
    fromSegmentId: string;
    toSegmentId: string;
    gapMinutes: number;
    action:
      | 'bridged_silent'
      | 'bridged_signal_gap'
      | 'bridged_long_signal_gap'
      | 'transition_candidate'
      | 'broken_positive_evidence';
    sameTarget: boolean;
    warnings: string[];
  }>;
}

export interface BridgeSignalGapsResult {
  segments: LocationTruthSegment[];
  diagnostics: GapBridgeDiagnostics;
}

const SHORT_GAP_MIN = 30;
const LONG_GAP_MIN = 120;
const OUTLIER_MAX_MIN = 5;
const KNOWN_ADDRESS_BRIDGE_RADIUS_M = 100;
/** Lager 2.10 — fysisk-närhet-bridge tillåter cross-type bridging. */
const PHYSICAL_PROXIMITY_BRIDGE_RADIUS_M = 250;

/** Tröskel för när två kluster räknas som "samma plats". */
function sameTargetIdentity(
  a: LocationTruthSegment,
  b: LocationTruthSegment,
): { same: boolean; via: 'target_id' | 'private_residence' | 'known_address_proximity' | 'physical_proximity' | null } {
  // Samma EventFlow-target via id räknas alltid som samma plats.
  if (
    a.matchedTarget &&
    b.matchedTarget &&
    a.matchedTarget.targetType === b.matchedTarget.targetType &&
    a.matchedTarget.targetId === b.matchedTarget.targetId
  ) {
    return { same: true, via: 'target_id' };
  }
  // private_residence utan id → samma om båda är private_residence.
  if (a.type === 'private_residence' && b.type === 'private_residence') {
    return { same: true, via: 'private_residence' };
  }
  // known_address ↔ known_address — strikt närhet (legacy).
  if (a.type === 'known_address' && b.type === 'known_address') {
    const d = physicalDistanceMeters(a, b);
    if (d !== null && d <= KNOWN_ADDRESS_BRIDGE_RADIUS_M) {
      return { same: true, via: 'known_address_proximity' };
    }
  }
  // Lager 2.10 — fysisk-närhet bridge ÄVEN om typerna skiljer sig
  // (known_target ↔ known_address etc). Kräver att båda har physicalLocation.
  if (
    isBridgeableType(a.type) &&
    isBridgeableType(b.type) &&
    !(a.type === 'private_residence' || b.type === 'private_residence')
  ) {
    const d = physicalDistanceMeters(a, b);
    if (d !== null && d <= PHYSICAL_PROXIMITY_BRIDGE_RADIUS_M) {
      return { same: true, via: 'physical_proximity' };
    }
  }
  return { same: false, via: null };
}

function isBridgeableType(t: LocationTruthSegmentType): boolean {
  return t === 'known_target' || t === 'known_address';
}

function physicalDistanceMeters(
  a: LocationTruthSegment,
  b: LocationTruthSegment,
): number | null {
  if (
    !a.physicalLocation ||
    !b.physicalLocation ||
    !Number.isFinite(a.physicalLocation.lat) ||
    !Number.isFinite(b.physicalLocation.lat)
  ) {
    return null;
  }
  return haversineMeters(
    a.physicalLocation.lat,
    a.physicalLocation.lng,
    b.physicalLocation.lat,
    b.physicalLocation.lng,
  );
}

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

function gapMinutesBetween(
  a: LocationTruthSegment,
  b: LocationTruthSegment,
): number {
  const aEnd = Date.parse(a.endAt);
  const bStart = Date.parse(b.startAt);
  if (!Number.isFinite(aEnd) || !Number.isFinite(bStart)) return 0;
  return Math.max(0, Math.round((bStart - aEnd) / 60000));
}

function durationMinutes(s: LocationTruthSegment): number {
  const start = Date.parse(s.startAt);
  const end = Date.parse(s.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / 60000);
}

/**
 * Vissa segmenttyper utgör positiv evidence att personen lämnat:
 *   - private_residence efter arbetsplats
 *   - explicit needs_location_review (kan signalera dagsslut)
 * Sådana mellanliggande segment får ALDRIG bridgeas över.
 */
function isHardBreakBetween(
  prev: LocationTruthSegment,
  middle: LocationTruthSegment,
  next: LocationTruthSegment,
): boolean {
  if (
    middle.type === 'private_residence' &&
    prev.type !== 'private_residence' &&
    next.type !== 'private_residence'
  ) {
    return true;
  }
  return false;
}

function mergeTwo(
  a: LocationTruthSegment,
  b: LocationTruthSegment,
  gapMin: number,
  warningTag: 'silent' | 'signal_gap_bridged' | 'long_signal_gap',
): LocationTruthSegment {
  const newWarnings = [...a.warnings];
  for (const w of b.warnings) if (!newWarnings.includes(w)) newWarnings.push(w);
  if (warningTag === 'signal_gap_bridged' && !newWarnings.includes('signal_gap_bridged')) {
    newWarnings.push('signal_gap_bridged');
  }
  if (warningTag === 'long_signal_gap' && !newWarnings.includes('long_signal_gap')) {
    newWarnings.push('long_signal_gap');
  }

  const bridgedTotal =
    (a.diagnostics.bridgedSignalGapMinutes ?? 0) +
    (b.diagnostics.bridgedSignalGapMinutes ?? 0) +
    gapMin;

  const sourcePingIds = [
    ...(a.diagnostics.sourcePingIds ?? []),
    ...(b.diagnostics.sourcePingIds ?? []),
  ];

  const merged: LocationTruthSegment = {
    ...a,
    endAt: b.endAt,
    confidence: weakestConfidence(a.confidence, b.confidence),
    evidence: {
      ...a.evidence,
      pingCount: (a.evidence.pingCount ?? 0) + (b.evidence.pingCount ?? 0),
    },
    warnings: newWarnings,
    diagnostics: {
      ...a.diagnostics,
      sourcePingIds,
      bridgedSignalGapMinutes: bridgedTotal,
      // @ts-ignore — utökar metadata
      gapPolicy: 'bridged_same_target_after_gap',
      // @ts-ignore — utökar metadata
      noEvidenceOfDeparture: true,
    },
  };
  return merged;
}

function weakestConfidence(
  a: 'high' | 'medium' | 'low',
  b: 'high' | 'medium' | 'low',
): 'high' | 'medium' | 'low' {
  const order = { low: 0, medium: 1, high: 2 } as const;
  return order[a] <= order[b] ? a : b;
}

function tagTransitionCandidate(
  prev: LocationTruthSegment,
  next: LocationTruthSegment,
  gapMin: number,
): void {
  const tag = 'transition_candidate';
  for (const seg of [prev, next]) {
    if (!seg.warnings.includes(tag)) seg.warnings.push(tag);
    // @ts-ignore — utökar metadata
    seg.diagnostics.gapPolicy = 'transition_candidate_no_transport_yet';
    // @ts-ignore — utökar metadata
    seg.diagnostics.transitionGapMinutes = gapMin;
  }
}

const KNOWN_TYPES: LocationTruthSegmentType[] = [
  'known_target',
  'known_address',
  'private_residence',
];

export function bridgeSignalGaps(
  input: LocationTruthSegment[],
): BridgeSignalGapsResult {
  const diagnostics: GapBridgeDiagnostics = {
    gapsEvaluated: 0,
    gapsBridgedSameTarget: 0,
    longGapsBridged: 0,
    gapsThatCausedBreak: 0,
    gapsPreservedAsUnknown: 0,
    transitionCandidatesMarked: 0,
    outliersAbsorbed: 0,
    examples: [],
  };

  if (!Array.isArray(input) || input.length === 0) {
    return { segments: [], diagnostics };
  }

  // Sortera kronologiskt — defensivt.
  const sorted = [...input].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );

  const out: LocationTruthSegment[] = [];
  let i = 0;
  while (i < sorted.length) {
    let current = sorted[i];

    // Försök bridgea framåt så långt som möjligt.
    let j = i + 1;
    while (j < sorted.length) {
      const candidate = sorted[j];

      // Möjlig outlier emellan: kort segment av annan/svag typ.
      const isOutlier =
        durationMinutes(candidate) <= OUTLIER_MAX_MIN &&
        !KNOWN_TYPES.includes(candidate.type) &&
        j + 1 < sorted.length &&
        sameTargetIdentity(current, sorted[j + 1]);

      if (isOutlier) {
        diagnostics.outliersAbsorbed++;
        // Hoppa över outliern och försök bridgea till nästa.
        const next = sorted[j + 1];
        const gapMin =
          gapMinutesBetween(current, next) + Math.round(durationMinutes(candidate));
        diagnostics.gapsEvaluated++;
        const tag = pickWarningTag(gapMin);
        current = mergeTwo(current, next, gapMin, tag);
        diagnostics.gapsBridgedSameTarget++;
        if (gapMin > LONG_GAP_MIN) diagnostics.longGapsBridged++;
        recordExample(diagnostics, current.id, next.id, gapMin, tag, true, [
          'outlier_absorbed',
        ]);
        j += 2;
        continue;
      }

      // Hård brytning (t.ex. private_residence emellan i mitten av jobbdag).
      if (
        j + 1 < sorted.length &&
        isHardBreakBetween(current, candidate, sorted[j + 1])
      ) {
        diagnostics.gapsThatCausedBreak++;
        break;
      }

      const gapMin = gapMinutesBetween(current, candidate);
      diagnostics.gapsEvaluated++;

      if (sameTargetIdentity(current, candidate)) {
        const tag = pickWarningTag(gapMin);
        current = mergeTwo(current, candidate, gapMin, tag);
        diagnostics.gapsBridgedSameTarget++;
        if (gapMin > LONG_GAP_MIN) diagnostics.longGapsBridged++;
        recordExample(diagnostics, current.id, candidate.id, gapMin, tag, true, []);
        j += 1;
        continue;
      }

      // Olika kända targets → markera som transition_candidate (ingen transport ännu).
      if (
        KNOWN_TYPES.includes(current.type) &&
        KNOWN_TYPES.includes(candidate.type) &&
        gapMin > 0
      ) {
        tagTransitionCandidate(current, candidate, gapMin);
        diagnostics.transitionCandidatesMarked++;
        recordExample(
          diagnostics,
          current.id,
          candidate.id,
          gapMin,
          'transition_candidate',
          false,
          ['transition_candidate'],
        );
      } else if (
        candidate.type === 'unresolved_location' ||
        current.type === 'unresolved_location'
      ) {
        diagnostics.gapsPreservedAsUnknown++;
      } else {
        diagnostics.gapsThatCausedBreak++;
        recordExample(
          diagnostics,
          current.id,
          candidate.id,
          gapMin,
          'broken_positive_evidence',
          false,
          [],
        );
      }
      break;
    }

    out.push(current);
    i = j > i ? j : i + 1;
  }

  return { segments: out, diagnostics };
}

function pickWarningTag(
  gapMin: number,
): 'silent' | 'signal_gap_bridged' | 'long_signal_gap' {
  if (gapMin < SHORT_GAP_MIN) return 'silent';
  if (gapMin <= LONG_GAP_MIN) return 'signal_gap_bridged';
  return 'long_signal_gap';
}

function recordExample(
  diag: GapBridgeDiagnostics,
  fromId: string,
  toId: string,
  gapMin: number,
  tag:
    | 'silent'
    | 'signal_gap_bridged'
    | 'long_signal_gap'
    | 'transition_candidate'
    | 'broken_positive_evidence',
  sameTarget: boolean,
  warnings: string[],
): void {
  if (diag.examples.length >= 8) return;
  const action =
    tag === 'silent'
      ? 'bridged_silent'
      : tag === 'signal_gap_bridged'
        ? 'bridged_signal_gap'
        : tag === 'long_signal_gap'
          ? 'bridged_long_signal_gap'
          : tag === 'transition_candidate'
            ? 'transition_candidate'
            : 'broken_positive_evidence';
  diag.examples.push({
    fromSegmentId: fromId,
    toSegmentId: toId,
    gapMinutes: gapMin,
    action,
    sameTarget,
    warnings,
  });
}

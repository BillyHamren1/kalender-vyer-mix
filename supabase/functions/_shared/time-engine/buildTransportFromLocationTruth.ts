/**
 * Time Engine — buildTransportFromLocationTruth (Location Truth 1.5, del 1)
 * =========================================================================
 *
 * Pure builder. Tar `LocationTruthSegment[]` från `buildLocationTruthTimeline`
 * och avgör VAR transport faktiskt ska skapas — EFTER att platsen är förstådd.
 *
 * Regler (låsta):
 *   - Transport skapas BARA mellan två kända/olika platser (A → B).
 *   - Faktisk haversine-förflyttning mellan platscentrum måste vara
 *     >= TRANSPORT_MIN_DISTANCE_METERS (500 m).
 *   - speed_mps får ALDRIG ensam skapa transport — bara support-evidence.
 *   - Är A === B → bridge som samma plats (ingen transport).
 *   - Avstånd < 500 m → intern rörelse inom session (ingen transport).
 *   - private_residence räknas som plats men förblir aldrig "arbete".
 *
 * Detta lager skriver INGENTING. Det skapar inga work-block. Det skapar
 * inte time_reports/LTE/travel_time_logs. Det är ett rent transformlager
 * som downstream kan läsa.
 */

import { haversine } from '../geofenceEval.ts';
import type { ISODateTime, UUID } from './contracts.ts';
import type { LocationTruthSegment } from './buildLocationTruthTimeline.ts';

/** Hård gräns: under denna är det intern rörelse, inte transport. */
export const TRANSPORT_MIN_DISTANCE_METERS = 500;

export interface TransportSegment {
  id: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  kind: 'transport';
  label: 'Resa';
  fromLabel: string;
  toLabel: string;
  fromTargetId: UUID | null;
  toTargetId: UUID | null;
  fromSegmentId: string;
  toSegmentId: string;
  distanceMeters: number;
  durationMinutes: number;
  /** Endast support-evidence — ALDRIG triggar ensam transport. */
  supportEvidence: {
    maxSpeedMps: number | null;
    sourceMovementSegmentIds: string[];
    sourceSignalGapSegmentIds: string[];
  };
}

export interface InternalMovementAbsorption {
  betweenSegmentIds: [string, string];
  distanceMeters: number;
  reason: 'same_place_bridge' | 'below_min_distance';
}

export interface LocationTransitionDiagnostics {
  transitionsDetectedCount: number;
  transportsCreatedCount: number;
  internalMovementsAbsorbedCount: number;
  /** Hur många gånger en hög hastighet ENSAM ville ge transport — alltid ignorerad. */
  speedIgnoredCount: number;
  examples: Array<{
    fromLabel: string;
    toLabel: string;
    distanceM: number;
    outcome: 'transport_created' | 'absorbed_same_place' | 'absorbed_below_min_distance' | 'speed_only_ignored';
    at: ISODateTime;
  }>;
}

export interface BuildTransportFromLocationTruthInput {
  locationTruthSegments: LocationTruthSegment[];
}

export interface BuildTransportFromLocationTruthResult {
  transportSegments: TransportSegment[];
  internalMovementAbsorptions: InternalMovementAbsorption[];
  diagnostics: LocationTransitionDiagnostics;
}

function isPlace(s: LocationTruthSegment): boolean {
  return s.kind === 'project' || s.kind === 'booking' || s.kind === 'warehouse'
    || s.kind === 'known_location' || s.kind === 'private_residence';
}

function placeKey(s: LocationTruthSegment): string {
  return `${s.targetType ?? 'x'}:${s.targetId ?? s.label.toLowerCase()}`;
}

function pushExample(diag: LocationTransitionDiagnostics, ex: LocationTransitionDiagnostics['examples'][number]) {
  if (diag.examples.length < 20) diag.examples.push(ex);
}

export function buildTransportFromLocationTruth(
  input: BuildTransportFromLocationTruthInput,
): BuildTransportFromLocationTruthResult {
  const segs = (input.locationTruthSegments ?? [])
    .slice()
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const transports: TransportSegment[] = [];
  const absorptions: InternalMovementAbsorption[] = [];
  const diag: LocationTransitionDiagnostics = {
    transitionsDetectedCount: 0,
    transportsCreatedCount: 0,
    internalMovementsAbsorbedCount: 0,
    speedIgnoredCount: 0,
    examples: [],
  };

  // Gå igenom alla par av platssegment (A, B) där A och B är platser och
  // det däremellan finns 0..n movement/signal_gap-segment.
  let prevPlaceIdx: number | null = null;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!isPlace(s)) continue;

    if (prevPlaceIdx == null) {
      prevPlaceIdx = i;
      continue;
    }
    const a = segs[prevPlaceIdx];
    const b = s;

    diag.transitionsDetectedCount += 1;

    // Mellanliggande movement/gap för support-evidence.
    const between = segs.slice(prevPlaceIdx + 1, i);
    const movementIds = between.filter((x) => x.kind === 'movement').map((x) => x.id);
    const gapIds = between.filter((x) => x.kind === 'signal_gap').map((x) => x.id);

    // Distans mellan platscentrum.
    const aLat = a.centerLat;
    const aLng = a.centerLng;
    const bLat = b.centerLat;
    const bLng = b.centerLng;
    const distance = (aLat != null && aLng != null && bLat != null && bLng != null)
      ? Math.round(haversine(aLat, aLng, bLat, bLng))
      : 0;

    const samePlace = placeKey(a) === placeKey(b)
      || (a.label && b.label && a.label.trim().toLowerCase() === b.label.trim().toLowerCase());

    if (samePlace) {
      // Intern rörelse inom samma plats — bridge.
      diag.internalMovementsAbsorbedCount += 1;
      absorptions.push({
        betweenSegmentIds: [a.id, b.id],
        distanceMeters: distance,
        reason: 'same_place_bridge',
      });
      pushExample(diag, {
        fromLabel: a.label, toLabel: b.label, distanceM: distance,
        outcome: 'absorbed_same_place', at: b.startAt,
      });
      prevPlaceIdx = i;
      continue;
    }

    if (distance < TRANSPORT_MIN_DISTANCE_METERS) {
      // Olika plats men för kort förflyttning → intern rörelse.
      diag.internalMovementsAbsorbedCount += 1;
      absorptions.push({
        betweenSegmentIds: [a.id, b.id],
        distanceMeters: distance,
        reason: 'below_min_distance',
      });
      pushExample(diag, {
        fromLabel: a.label, toLabel: b.label, distanceM: distance,
        outcome: 'absorbed_below_min_distance', at: b.startAt,
      });

      // Om mellanliggande movement-segment finns med högt speedMps
      // hade speed-ensam logik velat skapa transport — räkna det.
      if (movementIds.length > 0) {
        diag.speedIgnoredCount += 1;
        pushExample(diag, {
          fromLabel: a.label, toLabel: b.label, distanceM: distance,
          outcome: 'speed_only_ignored', at: b.startAt,
        });
      }

      prevPlaceIdx = i;
      continue;
    }

    // Olika plats + distance >= 500 → äkta transport.
    transports.push({
      id: `tr_${transports.length.toString(36)}`,
      startAt: a.endAt,
      endAt: b.startAt,
      kind: 'transport',
      label: 'Resa',
      fromLabel: a.label,
      toLabel: b.label,
      fromTargetId: a.targetId,
      toTargetId: b.targetId,
      fromSegmentId: a.id,
      toSegmentId: b.id,
      distanceMeters: distance,
      durationMinutes: Math.max(0, Math.round((Date.parse(b.startAt) - Date.parse(a.endAt)) / 60000)),
      supportEvidence: {
        maxSpeedMps: null,
        sourceMovementSegmentIds: movementIds,
        sourceSignalGapSegmentIds: gapIds,
      },
    });
    diag.transportsCreatedCount += 1;
    pushExample(diag, {
      fromLabel: a.label, toLabel: b.label, distanceM: distance,
      outcome: 'transport_created', at: b.startAt,
    });

    prevPlaceIdx = i;
  }

  return { transportSegments: transports, internalMovementAbsorptions: absorptions, diagnostics: diag };
}

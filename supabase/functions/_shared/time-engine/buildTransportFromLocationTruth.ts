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
 * HÅRD GATE (Core memory: transport-requires-own-movement-v1
 * + night-auto-start-guard-v1):
 *   En "Resa" får ALDRIG skapas mellan A och B utan att ALLA dessa gäller:
 *     1. Tidsglappet mellan A.endAt och B.startAt är ≤ MAX_TRANSPORT_GAP_MIN.
 *     2. Personalens EGNA GPS-displacement mellan sista pingen ≤ A.endAt
 *        och första pingen ≥ B.startAt är ≥ TRANSPORT_MIN_DISTANCE_METERS.
 *        Ingen ping på ena sidan → unsafe → ingen transport.
 *     3. Glappet ligger inte i nattfönstret 00:00–05:00 lokal tid (Stockholm).
 *     4. A är inte `private_residence` (hem→annan plats kräver explicit
 *        admin-bekräftelse — vi skapar aldrig "Resa hemifrån" automatiskt).
 *
 * När gaten faller registreras avvisningen i `internalMovementAbsorptions`
 * med ny reason (`rejected_*`) och downstream får ingen transport.
 *
 * Detta lager skriver INGENTING. Det skapar inga work-block. Det skapar
 * inte time_reports/LTE/travel_time_logs. Det är ett rent transformlager
 * som downstream kan läsa.
 */

import { haversine } from '../geofenceEval.ts';
import type { ISODateTime, UUID } from './contracts.ts';
import type { LocationTruthSegment } from './buildLocationTruthTimeline.ts';
import { staffOwnDisplacementMeters } from './staffOwnDisplacement.ts';

/** Hård gräns: under denna är det intern rörelse, inte transport. */
export const TRANSPORT_MIN_DISTANCE_METERS = 500;

/** Hård gräns på glapp-längd. Samma värde som classifyTransportSignalGap. */
export const MAX_TRANSPORT_GAP_MIN = 30;

/** Nattfönster — backend blockerar all auto-start här. */
const NIGHT_GUARD_START_HOUR = 0;
const NIGHT_GUARD_END_HOUR = 5;

export interface TransportPing {
  ts: ISODateTime | string;
  lat: number;
  lng: number;
}

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
    staffOwnDisplacementMeters: number;
  };
}

export type TransportRejectionReason =
  | 'same_place_bridge'
  | 'below_min_distance'
  | 'rejected_no_own_movement'
  | 'rejected_missing_anchor_pings'
  | 'rejected_gap_too_long'
  | 'rejected_night_window'
  | 'rejected_from_private_residence';

export interface InternalMovementAbsorption {
  betweenSegmentIds: [string, string];
  distanceMeters: number;
  reason: TransportRejectionReason;
  /** Optional diagnostics — only populated for `rejected_*`. */
  details?: {
    gapMinutes?: number;
    ownDisplacementMeters?: number | null;
    fromKind?: string;
    nightWindowHours?: [number, number];
  };
}

export interface LocationTransitionDiagnostics {
  transitionsDetectedCount: number;
  transportsCreatedCount: number;
  internalMovementsAbsorbedCount: number;
  /** Hur många gånger en hög hastighet ENSAM ville ge transport — alltid ignorerad. */
  speedIgnoredCount: number;
  /** Hur många transport-kandidater som föll på den hårda gate-kontrollen. */
  hardGateRejections: Partial<Record<TransportRejectionReason, number>>;
  examples: Array<{
    fromLabel: string;
    toLabel: string;
    distanceM: number;
    outcome:
      | 'transport_created'
      | 'absorbed_same_place'
      | 'absorbed_below_min_distance'
      | 'speed_only_ignored'
      | 'rejected_no_own_movement'
      | 'rejected_missing_anchor_pings'
      | 'rejected_gap_too_long'
      | 'rejected_night_window'
      | 'rejected_from_private_residence';
    at: ISODateTime;
  }>;
}

export interface BuildTransportFromLocationTruthInput {
  locationTruthSegments: LocationTruthSegment[];
  /**
   * Råa pings för dagen, sorterade kronologiskt (eller osorterade — vi
   * sorterar defensivt). Krävs för att gate:n ska kunna räkna staffens
   * EGNA GPS-displacement över glappet. Saknas pings → ingen transport
   * skapas alls (rejected_missing_anchor_pings).
   */
  pings?: TransportPing[];
  /**
   * IANA-tidszon för natt-fönstret. Default "Europe/Stockholm".
   */
  timezone?: string;
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

function pushExample(
  diag: LocationTransitionDiagnostics,
  ex: LocationTransitionDiagnostics['examples'][number],
) {
  if (diag.examples.length < 20) diag.examples.push(ex);
}

function bumpRejection(
  diag: LocationTransitionDiagnostics,
  reason: TransportRejectionReason,
) {
  diag.hardGateRejections[reason] = (diag.hardGateRejections[reason] ?? 0) + 1;
}

function hourInTimezone(iso: string, timezone: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(t));
    const hourPart = parts.find((p) => p.type === 'hour');
    if (!hourPart) return null;
    const h = Number(hourPart.value);
    return Number.isFinite(h) ? h % 24 : null;
  } catch {
    return null;
  }
}

function gapOverlapsNightWindow(
  startIso: string,
  endIso: string,
  timezone: string,
): boolean {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return false;
  }
  // Sampla glappet i 15-min-steg och kolla varje sample mot lokal-timme.
  // Glapp som dippar in i 00–05 ska räknas som natt.
  const stepMs = 15 * 60 * 1000;
  for (let t = startMs; t <= endMs; t += stepMs) {
    const h = hourInTimezone(new Date(t).toISOString(), timezone);
    if (h == null) continue;
    if (h >= NIGHT_GUARD_START_HOUR && h < NIGHT_GUARD_END_HOUR) return true;
  }
  // Också ändpunkten, ifall steget hoppade förbi.
  const hEnd = hourInTimezone(endIso, timezone);
  if (hEnd != null && hEnd >= NIGHT_GUARD_START_HOUR && hEnd < NIGHT_GUARD_END_HOUR) {
    return true;
  }
  return false;
}

function sortedPings(pings: TransportPing[] | undefined): TransportPing[] {
  if (!Array.isArray(pings) || pings.length === 0) return [];
  return [...pings].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

function lastPingAtOrBefore(
  pings: TransportPing[],
  iso: string,
): TransportPing | null {
  const limit = Date.parse(iso);
  if (!Number.isFinite(limit)) return null;
  let best: TransportPing | null = null;
  for (const p of pings) {
    const t = Date.parse(p.ts);
    if (!Number.isFinite(t)) continue;
    if (t <= limit) best = p;
    else break;
  }
  return best;
}

function firstPingAtOrAfter(
  pings: TransportPing[],
  iso: string,
): TransportPing | null {
  const limit = Date.parse(iso);
  if (!Number.isFinite(limit)) return null;
  for (const p of pings) {
    const t = Date.parse(p.ts);
    if (!Number.isFinite(t)) continue;
    if (t >= limit) return p;
  }
  return null;
}

export function buildTransportFromLocationTruth(
  input: BuildTransportFromLocationTruthInput,
): BuildTransportFromLocationTruthResult {
  const segs = (input.locationTruthSegments ?? [])
    .slice()
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const pings = sortedPings(input.pings);
  const timezone = input.timezone ?? 'Europe/Stockholm';

  const transports: TransportSegment[] = [];
  const absorptions: InternalMovementAbsorption[] = [];
  const diag: LocationTransitionDiagnostics = {
    transitionsDetectedCount: 0,
    transportsCreatedCount: 0,
    internalMovementsAbsorbedCount: 0,
    speedIgnoredCount: 0,
    hardGateRejections: {},
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

    // ── HÅRD GATE ────────────────────────────────────────────────────────
    const gapMs = Date.parse(b.startAt) - Date.parse(a.endAt);
    const gapMinutes = Math.max(0, Math.round(gapMs / 60000));

    const reject = (
      reason: Exclude<TransportRejectionReason, 'same_place_bridge' | 'below_min_distance'>,
      ownDisplacement: number | null,
    ) => {
      diag.internalMovementsAbsorbedCount += 1;
      bumpRejection(diag, reason);
      absorptions.push({
        betweenSegmentIds: [a.id, b.id],
        distanceMeters: distance,
        reason,
        details: {
          gapMinutes,
          ownDisplacementMeters: ownDisplacement,
          fromKind: a.kind,
          nightWindowHours:
            reason === 'rejected_night_window'
              ? [NIGHT_GUARD_START_HOUR, NIGHT_GUARD_END_HOUR]
              : undefined,
        },
      });
      pushExample(diag, {
        fromLabel: a.label, toLabel: b.label, distanceM: distance,
        outcome: reason, at: b.startAt,
      });
    };

    // Gate 1 — glapp ≤ 30 min.
    if (gapMinutes > MAX_TRANSPORT_GAP_MIN) {
      reject('rejected_gap_too_long', null);
      prevPlaceIdx = i;
      continue;
    }

    // Gate 4 — hem→annan-plats kräver explicit admin-bekräftelse.
    if (a.kind === 'private_residence') {
      reject('rejected_from_private_residence', null);
      prevPlaceIdx = i;
      continue;
    }

    // Gate 3 — nattfönster.
    if (gapOverlapsNightWindow(a.endAt, b.startAt, timezone)) {
      reject('rejected_night_window', null);
      prevPlaceIdx = i;
      continue;
    }

    // Gate 2 — staffens egna GPS-displacement över glappet.
    const lastBefore = lastPingAtOrBefore(pings, a.endAt);
    const firstAfter = firstPingAtOrAfter(pings, b.startAt);
    if (!lastBefore || !firstAfter) {
      reject('rejected_missing_anchor_pings', null);
      prevPlaceIdx = i;
      continue;
    }
    const ownDisplacement = staffOwnDisplacementMeters(lastBefore, firstAfter);
    if (ownDisplacement == null || ownDisplacement < TRANSPORT_MIN_DISTANCE_METERS) {
      reject('rejected_no_own_movement', ownDisplacement);
      prevPlaceIdx = i;
      continue;
    }

    // Olika plats + distance >= 500 + alla gates OK → äkta transport.
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
        staffOwnDisplacementMeters: Math.round(ownDisplacement),
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

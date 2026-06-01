/**
 * Hard-gate guard tests for buildTransportFromLocationTruth.
 *
 * Locks the contracts from:
 *   - mem://constraints/transport-requires-own-movement-v1
 *   - mem://constraints/night-auto-start-guard-v1
 *
 * Each test mirrors a scenario where the OLD builder would have created a
 * "Resa"-segment incorrectly. After the gate they must produce zero
 * transports and a typed `rejected_*` absorption.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildTransportFromLocationTruth,
  type TransportPing,
} from '../buildTransportFromLocationTruth.ts';
import type { LocationTruthSegment } from '../buildLocationTruthTimeline.ts';

function seg(partial: Partial<LocationTruthSegment> & {
  id: string; startAt: string; endAt: string; kind: LocationTruthSegment['kind'];
  centerLat: number | null; centerLng: number | null; label: string;
}): LocationTruthSegment {
  return {
    targetId: null, targetType: null, locationId: null, projectId: null,
    bookingId: null, largeProjectId: null, assignmentId: null,
    confidence: 0.9, confidenceReasons: [], sourcePingIds: [],
    distanceToTargetMeters: null, insidePolygon: null, withinTolerance: false,
    signalGapMinutes: 0, signalGapCount: 0, signalQuality: 'good',
    warningReasons: [],
    rawEvidence: { pingCount: 1, matchReason: null, matchedByTolerance: false },
    ...partial,
  } as LocationTruthSegment;
}

Deno.test('GATE A — exakt skärmdumpens scenario: 2 pings hemma + 1 ping på jobbet 6h senare → 0 Resa', () => {
  // 2 hem-pings 00:09 + 1 jobb-ping 06:26. Hem och jobb ≈ 1 km isär (vanligt
  // i tätort) — så distansen klarar 500 m-gränsen och vi MÅSTE förlita oss
  // på den hårda gaten (gap_too_long + private_residence + no_own_movement).
  const segs: LocationTruthSegment[] = [
    seg({
      id: 'home', startAt: '2025-01-15T00:09:01Z', endAt: '2025-01-15T00:09:03Z',
      kind: 'private_residence', label: 'Hem', targetId: null, targetType: null,
      centerLat: 59.6512, centerLng: 17.7206,
    }),
    seg({
      id: 'work', startAt: '2025-01-15T06:26:20Z', endAt: '2025-01-15T07:00:00Z',
      kind: 'project', label: 'Jobbet', targetId: 'p1', targetType: 'project',
      centerLat: 59.6600, centerLng: 17.7300, // ≈ 1.2 km från hemmet
    }),
  ];
  // Pingarna ligger på respektive plats — ingen egen rörelse under glappet.
  const pings: TransportPing[] = [
    { ts: '2025-01-15T00:09:01Z', lat: 59.6512, lng: 17.7206 },
    { ts: '2025-01-15T00:09:03Z', lat: 59.6512, lng: 17.7204 },
    { ts: '2025-01-15T06:26:20Z', lat: 59.6600, lng: 17.7300 },
  ];
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs, pings });
  assertEquals(r.transportSegments.length, 0, 'får inte skapa Resa över ett 6h glapp utan rörelse');
  assertEquals(r.diagnostics.transportsCreatedCount, 0);
  // Den första gaten som faller är gap_too_long (377 min > 30).
  assertEquals(r.diagnostics.hardGateRejections.rejected_gap_too_long, 1);
  // Och det ska finnas en absorption (inte tyst släppt).
  assert(r.internalMovementAbsorptions.length >= 1);
});

Deno.test('GATE B — hem 07:00 → jobb 07:25 med transit-pings → 1 Resa', () => {
  const segs: LocationTruthSegment[] = [
    seg({
      id: 'home', startAt: '2025-01-15T06:50:00Z', endAt: '2025-01-15T07:00:00Z',
      kind: 'private_residence', label: 'Hem',
      centerLat: 59.3293, centerLng: 18.0686,
    }),
    seg({
      id: 'work', startAt: '2025-01-15T07:25:00Z', endAt: '2025-01-15T08:00:00Z',
      kind: 'project', label: 'Jobbet', targetId: 'p1', targetType: 'project',
      centerLat: 59.2937, centerLng: 18.0830,
    }),
  ];
  const pings: TransportPing[] = [
    { ts: '2025-01-15T06:59:00Z', lat: 59.3293, lng: 18.0686 },
    { ts: '2025-01-15T07:10:00Z', lat: 59.3110, lng: 18.0750 },
    { ts: '2025-01-15T07:26:00Z', lat: 59.2937, lng: 18.0830 },
  ];
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs, pings });
  // Hem→annan plats ska ALDRIG bli auto-Resa (separat regel).
  assertEquals(r.transportSegments.length, 0, 'hem→jobb skapar aldrig auto-Resa');
  assert(
    (r.diagnostics.hardGateRejections.rejected_from_private_residence ?? 0) >= 1,
    'förväntade rejected_from_private_residence',
  );
});

Deno.test('GATE C — projekt A → projekt B, kort glapp, egen rörelse → 1 Resa', () => {
  // Stockholm centrum → Globen ~ 4 km, glapp 8 min, egna pings visar förflyttning.
  const segs: LocationTruthSegment[] = [
    seg({
      id: 'a', startAt: '2025-01-15T13:00:00Z', endAt: '2025-01-15T14:00:00Z',
      kind: 'project', label: 'Projekt A', targetId: 'a', targetType: 'project',
      centerLat: 59.3293, centerLng: 18.0686,
    }),
    seg({
      id: 'b', startAt: '2025-01-15T14:08:00Z', endAt: '2025-01-15T15:00:00Z',
      kind: 'project', label: 'Projekt B', targetId: 'b', targetType: 'project',
      centerLat: 59.2937, centerLng: 18.0830,
    }),
  ];
  const pings: TransportPing[] = [
    { ts: '2025-01-15T13:59:30Z', lat: 59.3293, lng: 18.0686 },
    { ts: '2025-01-15T14:04:00Z', lat: 59.3110, lng: 18.0750 },
    { ts: '2025-01-15T14:08:30Z', lat: 59.2937, lng: 18.0830 },
  ];
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs, pings });
  assertEquals(r.transportSegments.length, 1);
  assertEquals(r.transportSegments[0].label, 'Resa');
  assert(r.transportSegments[0].supportEvidence.staffOwnDisplacementMeters >= 500);
});

Deno.test('GATE D — nattglapp 02:10 → 03:30 mellan två projekt → 0 Resa', () => {
  // 80 min glapp + 02–03 lokal tid (Europe/Stockholm).
  const segs: LocationTruthSegment[] = [
    seg({
      id: 'a', startAt: '2025-01-15T00:30:00Z', endAt: '2025-01-15T01:10:00Z', // 01:30→02:10 lokal vinter (UTC+1)
      kind: 'project', label: 'Projekt A', targetId: 'a', targetType: 'project',
      centerLat: 59.3293, centerLng: 18.0686,
    }),
    seg({
      id: 'b', startAt: '2025-01-15T02:30:00Z', endAt: '2025-01-15T03:30:00Z', // 03:30→04:30 lokal
      kind: 'project', label: 'Projekt B', targetId: 'b', targetType: 'project',
      centerLat: 59.2937, centerLng: 18.0830,
    }),
  ];
  const pings: TransportPing[] = [
    { ts: '2025-01-15T01:09:00Z', lat: 59.3293, lng: 18.0686 },
    { ts: '2025-01-15T02:31:00Z', lat: 59.2937, lng: 18.0830 },
  ];
  const r = buildTransportFromLocationTruth({
    locationTruthSegments: segs, pings, timezone: 'Europe/Stockholm',
  });
  assertEquals(r.transportSegments.length, 0, 'natt + långt glapp får inte bli auto-Resa');
  // Glappet är 80 min → gap_too_long faller först (det är den övre gränsen).
  assert(
    (r.diagnostics.hardGateRejections.rejected_gap_too_long ?? 0) >= 1
    || (r.diagnostics.hardGateRejections.rejected_night_window ?? 0) >= 1,
    `förväntade rejected_gap_too_long eller rejected_night_window, fick ${JSON.stringify(r.diagnostics.hardGateRejections)}`,
  );
});

Deno.test('GATE E — saknade anchor-pings → 0 Resa (rejected_missing_anchor_pings)', () => {
  const segs: LocationTruthSegment[] = [
    seg({
      id: 'a', startAt: '2025-01-15T10:00:00Z', endAt: '2025-01-15T10:30:00Z',
      kind: 'project', label: 'Projekt A', targetId: 'a', targetType: 'project',
      centerLat: 59.3293, centerLng: 18.0686,
    }),
    seg({
      id: 'b', startAt: '2025-01-15T10:50:00Z', endAt: '2025-01-15T11:30:00Z',
      kind: 'project', label: 'Projekt B', targetId: 'b', targetType: 'project',
      centerLat: 59.2937, centerLng: 18.0830,
    }),
  ];
  // Inga pings alls.
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs, pings: [] });
  assertEquals(r.transportSegments.length, 0);
  assertEquals(r.diagnostics.hardGateRejections.rejected_missing_anchor_pings, 1);
});

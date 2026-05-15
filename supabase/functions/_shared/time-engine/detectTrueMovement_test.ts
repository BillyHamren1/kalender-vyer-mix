/**
 * Lager 2.5 tests — detectTrueMovement.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectTrueMovement } from './detectTrueMovement.ts';
import type { LocationTruthSegment } from './buildLocationTruthFromDayEvidence.ts';
import type { NormalizedGpsPing } from './normalizeGpsEvidence.ts';

function seg(opts: {
  id: string;
  start: string;
  end: string;
  targetId: string;
  lat: number;
  lng: number;
}): LocationTruthSegment {
  return {
    id: opts.id,
    staffId: 's1',
    startAt: opts.start,
    endAt: opts.end,
    type: 'known_target',
    matchedTarget: {
      targetType: 'project',
      targetId: opts.targetId,
      label: opts.targetId,
    },
    physicalLocation: {
      lat: opts.lat,
      lng: opts.lng,
      source: 'eventflow_target',
      confidence: 'high',
    },
    confidence: 'high',
    evidence: { pingCount: 10 },
    warnings: [],
    diagnostics: {},
  };
}

function ping(ts: string, lat: number, lng: number): NormalizedGpsPing {
  return {
    id: ts,
    ts,
    lat,
    lng,
    accuracyM: 15,
    speedMps: null,
    accuracyQuality: 'good',
    confidenceWeight: 1,
    hardRejected: false,
    ignoredForLocationLogic: false,
  };
}

Deno.test('A. Warehouse → projekt 20 km med pings emellan → movement skapas', () => {
  const A = seg({ id: 'A', start: '2026-05-15T07:00:00Z', end: '2026-05-15T08:00:00Z', targetId: 'WH', lat: 59.30, lng: 18.00 });
  const B = seg({ id: 'B', start: '2026-05-15T08:30:00Z', end: '2026-05-15T16:00:00Z', targetId: 'P1', lat: 59.40, lng: 18.20 });
  // Pings längs väg
  const pings = [
    ping('2026-05-15T08:05:00Z', 59.32, 18.05),
    ping('2026-05-15T08:15:00Z', 59.36, 18.12),
    ping('2026-05-15T08:25:00Z', 59.39, 18.18),
  ];
  const r = detectTrueMovement([A, B], pings);
  assertEquals(r.diagnostics.movementCreatedCount, 1);
  const movement = r.segments.find((s) => s.type === 'movement');
  assert(movement, 'movement segment skapad');
  // @ts-ignore
  assert((movement!.diagnostics.movementMeta as any).distanceMeters > 5000);
});

Deno.test('B. Samma projekt före/efter med gap → no movement', () => {
  const A = seg({ id: 'A', start: '2026-05-15T07:00:00Z', end: '2026-05-15T08:00:00Z', targetId: 'P1', lat: 59.40, lng: 18.20 });
  const B = seg({ id: 'B', start: '2026-05-15T08:30:00Z', end: '2026-05-15T10:00:00Z', targetId: 'P1', lat: 59.40, lng: 18.20 });
  const r = detectTrueMovement([A, B], []);
  assertEquals(r.diagnostics.movementCreatedCount, 0);
  assertEquals(r.diagnostics.rejectedSameTargetCount, 1);
});

Deno.test('C. 300m rörelse inom site → internal_movement, inget movement-segment', () => {
  const A = seg({ id: 'A', start: '2026-05-15T07:00:00Z', end: '2026-05-15T08:00:00Z', targetId: 'P1', lat: 59.40000, lng: 18.20000 });
  const B = seg({ id: 'B', start: '2026-05-15T08:10:00Z', end: '2026-05-15T10:00:00Z', targetId: 'P2', lat: 59.40270, lng: 18.20000 }); // ~300 m
  const pings = [ping('2026-05-15T08:05:00Z', 59.40135, 18.20000)];
  const r = detectTrueMovement([A, B], pings);
  assertEquals(r.diagnostics.movementCreatedCount, 0);
  assertEquals(r.diagnostics.internalMovementAbsorbedCount, 1);
  assert(A.warnings.includes('internal_movement_same_site'));
});

Deno.test('D. Speed spike men samma plats → no movement (rejected_same_target)', () => {
  const A = seg({ id: 'A', start: '2026-05-15T07:00:00Z', end: '2026-05-15T08:00:00Z', targetId: 'P1', lat: 59.40, lng: 18.20 });
  const B = seg({ id: 'B', start: '2026-05-15T08:01:00Z', end: '2026-05-15T10:00:00Z', targetId: 'P1', lat: 59.40, lng: 18.20 });
  const pings = [{ ...ping('2026-05-15T08:00:30Z', 59.40, 18.20), speedMps: 30 }];
  const r = detectTrueMovement([A, B], pings);
  assertEquals(r.diagnostics.movementCreatedCount, 0);
});

Deno.test('E. Outlier 5km bort och tillbaka → no movement (rejected_outlier_bounce)', () => {
  const A = seg({ id: 'A', start: '2026-05-15T07:00:00Z', end: '2026-05-15T08:00:00Z', targetId: 'P1', lat: 59.40, lng: 18.20 });
  const B = seg({ id: 'B', start: '2026-05-15T08:30:00Z', end: '2026-05-15T10:00:00Z', targetId: 'P1', lat: 59.40, lng: 18.20 });
  const pings = [ping('2026-05-15T08:15:00Z', 59.45, 18.30)]; // outlier far away
  const r = detectTrueMovement([A, B], pings);
  // Same target → rejected_same_target träffar först. Movement ej skapad.
  assertEquals(r.diagnostics.movementCreatedCount, 0);
});

Deno.test('F. Target A → Target B utan pings emellan → transition warning, INGET movement', () => {
  const A = seg({ id: 'A', start: '2026-05-15T07:00:00Z', end: '2026-05-15T08:00:00Z', targetId: 'P1', lat: 59.30, lng: 18.00 });
  const B = seg({ id: 'B', start: '2026-05-15T11:00:00Z', end: '2026-05-15T16:00:00Z', targetId: 'P2', lat: 59.40, lng: 18.20 });
  const r = detectTrueMovement([A, B], []);
  assertEquals(r.diagnostics.movementCreatedCount, 0);
  assertEquals(r.diagnostics.rejectedSignalGapOnlyCount, 1);
  assert(A.warnings.includes('transition_candidate_no_ping_evidence'));
  assert(B.warnings.includes('transition_candidate_no_ping_evidence'));
});

Deno.test('Outlier bounce mellan TVÅ olika targets → no movement', () => {
  const A = seg({ id: 'A', start: '2026-05-15T07:00:00Z', end: '2026-05-15T08:00:00Z', targetId: 'P1', lat: 59.30, lng: 18.00 });
  const B = seg({ id: 'B', start: '2026-05-15T08:30:00Z', end: '2026-05-15T10:00:00Z', targetId: 'P2', lat: 59.40, lng: 18.20 });
  // Pings ligger nära A respektive B → ingen route-ping
  const pings = [
    ping('2026-05-15T08:05:00Z', 59.3001, 18.0001),
    ping('2026-05-15T08:25:00Z', 59.3999, 18.1999),
  ];
  const r = detectTrueMovement([A, B], pings);
  assertEquals(r.diagnostics.movementCreatedCount, 0);
  assertEquals(r.diagnostics.rejectedOutlierBouncesCount, 1);
});

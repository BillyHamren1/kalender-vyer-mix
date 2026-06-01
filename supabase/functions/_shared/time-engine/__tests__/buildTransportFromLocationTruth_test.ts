import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildTransportFromLocationTruth,
  TRANSPORT_MIN_DISTANCE_METERS,
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

Deno.test('transport: same place A→A bridges, no transport', () => {
  const segs: LocationTruthSegment[] = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'project', label: 'Swedish Game Fair', targetId: 'p1', targetType: 'project',
      centerLat: 59.3293, centerLng: 18.0686 }),
    seg({ id: 's2', startAt: '2025-01-01T09:30:00Z', endAt: '2025-01-01T10:00:00Z',
      kind: 'project', label: 'Swedish Game Fair', targetId: 'p1', targetType: 'project',
      centerLat: 59.3294, centerLng: 18.0687 }),
  ];
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs });
  assertEquals(r.transportSegments.length, 0);
  assertEquals(r.diagnostics.internalMovementsAbsorbedCount, 1);
  assertEquals(r.diagnostics.transportsCreatedCount, 0);
});

Deno.test('transport: < 500 m absorbed as internal movement', () => {
  // ~200 m apart
  const segs: LocationTruthSegment[] = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'warehouse', label: 'FA Warehouse', targetId: 'w1', targetType: 'warehouse',
      centerLat: 59.3293, centerLng: 18.0686 }),
    seg({ id: 's2', startAt: '2025-01-01T09:10:00Z', endAt: '2025-01-01T09:30:00Z',
      kind: 'project', label: 'GOPA', targetId: 'p2', targetType: 'project',
      centerLat: 59.3311, centerLng: 18.0686 }),
  ];
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs });
  assertEquals(r.transportSegments.length, 0);
  assertEquals(r.diagnostics.internalMovementsAbsorbedCount, 1);
});

Deno.test('transport: >= 500 m between different places creates Resa', () => {
  // Stockholm centrum → Globen ~ 4 km
  const segs: LocationTruthSegment[] = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'project', label: 'Swedish Game Fair', targetId: 'p1', targetType: 'project',
      centerLat: 59.3293, centerLng: 18.0686 }),
    seg({ id: 's2', startAt: '2025-01-01T09:20:00Z', endAt: '2025-01-01T10:00:00Z',
      kind: 'project', label: 'GOPA', targetId: 'p2', targetType: 'project',
      centerLat: 59.2937, centerLng: 18.0830 }),
  ];
  // Egna pings som täcker glappet och visar verklig förflyttning.
  const pings = [
    { ts: '2025-01-01T08:59:00Z', lat: 59.3293, lng: 18.0686 },
    { ts: '2025-01-01T09:21:00Z', lat: 59.2937, lng: 18.0830 },
  ];
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs, pings });
  assertEquals(r.transportSegments.length, 1);
  assertEquals(r.transportSegments[0].label, 'Resa');
  assertEquals(r.transportSegments[0].fromLabel, 'Swedish Game Fair');
  assertEquals(r.transportSegments[0].toLabel, 'GOPA');
  assert(r.transportSegments[0].distanceMeters >= TRANSPORT_MIN_DISTANCE_METERS);
});

Deno.test('transport: speed alone without distance never creates transport', () => {
  // Movement segment between två punkter < 500m
  const segs: LocationTruthSegment[] = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T08:30:00Z',
      kind: 'project', label: 'A', targetId: 'a', targetType: 'project',
      centerLat: 59.3293, centerLng: 18.0686 }),
    seg({ id: 'm1', startAt: '2025-01-01T08:30:00Z', endAt: '2025-01-01T08:35:00Z',
      kind: 'movement', label: 'Förflyttning', centerLat: 59.3300, centerLng: 18.0686 }),
    seg({ id: 's2', startAt: '2025-01-01T08:35:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'project', label: 'B', targetId: 'b', targetType: 'project',
      centerLat: 59.3300, centerLng: 18.0686 }),
  ];
  const r = buildTransportFromLocationTruth({ locationTruthSegments: segs });
  assertEquals(r.transportSegments.length, 0);
  assert(r.diagnostics.speedIgnoredCount >= 1);
});

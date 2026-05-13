import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildReportBlocksFromLocationTruth } from '../buildReportBlocksFromLocationTruth.ts';
import type { LocationTruthSegment } from '../buildLocationTruthTimeline.ts';

function seg(partial: Partial<LocationTruthSegment> & {
  id: string; startAt: string; endAt: string; kind: LocationTruthSegment['kind']; label: string;
}): LocationTruthSegment {
  return {
    targetId: null, targetType: null, locationId: null, projectId: null,
    bookingId: null, largeProjectId: null, assignmentId: null,
    centerLat: null, centerLng: null,
    confidence: 0.9, confidenceReasons: [], sourcePingIds: [],
    distanceToTargetMeters: null, insidePolygon: null, withinTolerance: false,
    signalGapMinutes: 0, signalGapCount: 0, signalQuality: 'good',
    warningReasons: [],
    rawEvidence: { pingCount: 1, matchReason: null, matchedByTolerance: false },
    ...partial,
  } as LocationTruthSegment;
}

Deno.test('label: project id resolves to human projectName, not Team title', () => {
  const segs = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'project', label: 'Team 1', targetType: 'project', targetId: 'p1', projectId: 'p1' }),
  ];
  const r = buildReportBlocksFromLocationTruth({
    locationTruthSegments: segs,
    nameLookup: { projectName: { p1: 'Swedish Game Fair' } },
  });
  assertEquals(r.reportBlocks[0].title, 'Swedish Game Fair');
  assertEquals(r.reportBlocks[0].resolvedFrom, 'project');
  assertEquals(r.diagnostics.teamTitlesPreventedCount, 1);
});

Deno.test('label: warehouse with id resolves to FA Warehouse', () => {
  const segs = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'warehouse', label: 'LAGER', targetType: 'warehouse', targetId: 'w1', locationId: 'w1' }),
  ];
  const r = buildReportBlocksFromLocationTruth({
    locationTruthSegments: segs,
    nameLookup: { locationName: { w1: 'FA Warehouse' } },
  });
  assertEquals(r.reportBlocks[0].title, 'FA Warehouse');
  assertEquals(r.reportBlocks[0].category, 'LAGER');
});

Deno.test('label: private_residence becomes private, countsAsWork=false', () => {
  const segs = [
    seg({ id: 's1', startAt: '2025-01-01T20:00:00Z', endAt: '2025-01-01T22:00:00Z',
      kind: 'private_residence', label: 'Hem' }),
  ];
  const r = buildReportBlocksFromLocationTruth({ locationTruthSegments: segs });
  assertEquals(r.reportBlocks[0].kind, 'private');
  assertEquals(r.reportBlocks[0].countsAsWork, false);
});

Deno.test('label: long unknown becomes needs_review', () => {
  const segs = [
    seg({ id: 's1', startAt: '2025-01-01T10:00:00Z', endAt: '2025-01-01T10:30:00Z',
      kind: 'unknown_place', label: 'Okänd plats' }),
  ];
  const r = buildReportBlocksFromLocationTruth({ locationTruthSegments: segs });
  assertEquals(r.reportBlocks[0].reviewState, 'needs_review');
  assertEquals(r.reportBlocks[0].title, 'Okänd plats');
});

Deno.test('label: fallback when no human name available and no label', () => {
  const segs = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'project', label: 'Team 1', targetType: 'project', targetId: 'pX' }),
  ];
  const r = buildReportBlocksFromLocationTruth({ locationTruthSegments: segs });
  // No projectName lookup → falls through to location_truth_label using "Team 1" as last resort
  assert(r.reportBlocks[0].title === 'Team 1' || r.reportBlocks[0].title === 'Arbete – okänd plats');
});

Deno.test('label: planned assignment label used as 5th priority', () => {
  const segs = [
    seg({ id: 's1', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T09:00:00Z',
      kind: 'booking', label: 'Team transport', targetType: 'booking', targetId: 'b1', bookingId: 'b1' }),
  ];
  const r = buildReportBlocksFromLocationTruth({
    locationTruthSegments: segs,
    nameLookup: { plannedAssignmentLabel: { 'booking:b1': 'Bergman Event AB' } },
  });
  assertEquals(r.reportBlocks[0].title, 'Bergman Event AB');
  assertEquals(r.reportBlocks[0].resolvedFrom, 'planned_assignment');
});

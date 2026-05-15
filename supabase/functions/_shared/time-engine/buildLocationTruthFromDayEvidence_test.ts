// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLocationTruthFromDayEvidence } from './buildLocationTruthFromDayEvidence.ts';

function makeDayEvidence(overrides: Partial<any> = {}): any {
  return {
    staffId: 'A',
    date: '2026-05-13',
    gps: { locationLogicPingCount: 0 },
    assignments: { assignmentCount: 0, items: [], bookingIds: [], largeProjectIds: [], hasPlannedDay: false },
    knownTargets: { totalCount: 0, withCoordinatesCount: 0, invalidCount: 0, items: [], dataQuality: {} },
    privateResidence: { zoneCount: 0, hasUsableZone: false },
    largeProjects: { count: 0, withOwnGeoCount: 0 },
    dataQuality: {},
    diagnostics: {},
    internal: {
      normalizedPings: [],
      locationLogicPings: [],
      hardRejectedPings: [],
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
    ...overrides,
  };
}

Deno.test('Lager 2.1: 0 pings → empty segments + skippedReason=no_pings', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence());
  assertEquals(r.segments, []);
  assertEquals(r.diagnostics.skippedReason, 'no_pings');
  assertEquals(r.diagnostics.hasUsableEvidence, false);
  assertEquals(r.diagnostics.counts.locationLogicPings, 0);
  assertEquals(r.diagnostics.counts.segments, 0);
  assert(r.diagnostics.warnings.includes('location_truth_no_location_logic_pings'));
});

Deno.test('Lager 2.1: pings men inga targets → skippedReason=no_evidence', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence({
    gps: { locationLogicPingCount: 5 },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: [
        { id: '1', ts: '2026-05-13T08:00:00Z', lat: 59, lng: 17, accuracy: 10 },
      ],
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  assertEquals(r.segments, []);
  assertEquals(r.diagnostics.hasUsableEvidence, true);
  assertEquals(r.diagnostics.skippedReason, 'no_evidence');
});

Deno.test('Lager 2.1: pings + targets → scaffold (not_implemented_yet) + counts korrekta', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence({
    gps: { locationLogicPingCount: 3 },
    knownTargets: { totalCount: 2, withCoordinatesCount: 2, invalidCount: 0, items: [], dataQuality: {} },
    privateResidence: { zoneCount: 1, hasUsableZone: true },
    largeProjects: { count: 1, withOwnGeoCount: 1 },
    assignments: { assignmentCount: 4, items: [], bookingIds: [], largeProjectIds: [], hasPlannedDay: true },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: [
        { id: '1', ts: '2026-05-13T08:00:00Z', lat: 59, lng: 17, accuracy: 10 },
        { id: '2', ts: '2026-05-13T08:01:00Z', lat: 59, lng: 17, accuracy: 10 },
      ],
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  assertEquals(r.segments, []);
  assertEquals(r.diagnostics.hasUsableEvidence, true);
  assertEquals(r.diagnostics.skippedReason, 'not_implemented_yet');
  assertEquals(r.diagnostics.counts.knownTargetsWithCoordinates, 2);
  assertEquals(r.diagnostics.counts.privateZones, 1);
  assertEquals(r.diagnostics.counts.largeProjects, 1);
  assertEquals(r.diagnostics.counts.assignments, 4);
  assertEquals(r.diagnostics.counts.segmentsByType.known_site, 0);
});

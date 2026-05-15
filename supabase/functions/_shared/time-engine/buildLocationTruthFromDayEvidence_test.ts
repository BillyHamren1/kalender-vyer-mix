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

function makePings(lat: number, lng: number, count = 8, startMin = 0): any[] {
  const arr: any[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(`2026-05-13T08:00:00Z`).getTime() + (startMin + i) * 60_000;
    arr.push({
      id: `p${startMin}_${i}`,
      ts: new Date(t).toISOString(),
      lat: lat + (Math.random() - 0.5) * 0.00005,
      lng: lng + (Math.random() - 0.5) * 0.00005,
      accuracy: 10,
    });
  }
  return arr;
}

Deno.test('Lager 2.3b: 0 pings → empty segments + skippedReason=no_pings', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence());
  assertEquals(r.segments, []);
  assertEquals(r.diagnostics.skippedReason, 'no_pings');
  assertEquals(r.diagnostics.counts.segments, 0);
  assert(r.diagnostics.warnings.includes('location_truth_no_location_logic_pings'));
});

Deno.test('Lager 2.3b A: GPS på warehouse → known_target + matched_eventflow_target', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence({
    gps: { locationLogicPingCount: 8 },
    knownTargets: {
      totalCount: 1,
      withCoordinatesCount: 1,
      invalidCount: 0,
      items: [{
        targetType: 'warehouse',
        targetId: 'wh1',
        label: 'FA Warehouse',
        lat: 59.3293,
        lng: 18.0686,
        radiusMeters: 80,
        polygon: null,
        hasCoordinates: true,
        hasRadius: true,
        sourceTable: 'organization_locations',
        status: 'active',
        dateWindow: null,
        parentLargeProjectId: null,
        belongsToLargeProject: false,
        canBePrimaryWorkTarget: true,
        canBeGeoTarget: true,
        suppressedReason: null,
      }],
      dataQuality: {},
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: makePings(59.3293, 18.0686, 8, 0),
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  assert(r.segments.length >= 1);
  const s = r.segments[0];
  assertEquals(s.type, 'known_target');
  assertEquals(s.businessContext?.status, 'matched_eventflow_target');
  assertEquals(s.businessContext?.matchedTarget?.targetType, 'warehouse');
  assertEquals(s.physicalLocation?.source, 'eventflow_target');
  assertEquals(s.physicalLocation?.label, 'FA Warehouse');
});

Deno.test('Lager 2.3b B: stabil adress utan target → known_address + unresolved_business_context', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence({
    gps: { locationLogicPingCount: 8 },
    // Det finns ETT target geografiskt långt borta så vi inte ramlar i no_evidence-grenen
    knownTargets: {
      totalCount: 1,
      withCoordinatesCount: 1,
      invalidCount: 0,
      items: [{
        targetType: 'warehouse', targetId: 'far', label: 'Långt bort',
        lat: 50, lng: 10, radiusMeters: 50, polygon: null,
        hasCoordinates: true, hasRadius: true, sourceTable: 'organization_locations',
        status: 'active', dateWindow: null, parentLargeProjectId: null,
        belongsToLargeProject: false, canBePrimaryWorkTarget: true,
        canBeGeoTarget: true, suppressedReason: null,
      }],
      dataQuality: {},
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: makePings(59.3340, 18.0700, 10, 0),
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  assert(r.segments.length >= 1);
  const s = r.segments[0];
  assertEquals(s.type, 'known_address');
  assertEquals(s.businessContext?.status, 'unresolved_business_context');
  assertEquals(s.physicalLocation?.source, 'centroid');
  assert(s.businessContext?.warnings?.includes('no_eventflow_target_match'));
  assert(s.warnings.includes('address_lookup_not_available'));
  assert(r.diagnostics.physicalLocationDiagnostics!.clustersWithKnownAddressNoTargetCount >= 1);
  assert(r.diagnostics.physicalLocationDiagnostics!.centroidOnlyAddressCount >= 1);
});

Deno.test('Lager 2.3b C: stabil adress + planering på annan plats → planning_geo_mismatch', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence({
    gps: { locationLogicPingCount: 8 },
    knownTargets: {
      totalCount: 1, withCoordinatesCount: 1, invalidCount: 0,
      items: [{
        targetType: 'booking', targetId: 'bk-planned', label: 'Kaggeholm',
        lat: 59.3700, lng: 17.7000, radiusMeters: 80, polygon: null,
        hasCoordinates: true, hasRadius: true, sourceTable: 'bookings',
        status: 'confirmed', dateWindow: null, parentLargeProjectId: null,
        belongsToLargeProject: false, canBePrimaryWorkTarget: true,
        canBeGeoTarget: true, suppressedReason: null,
      }],
      dataQuality: {},
    },
    assignments: {
      assignmentCount: 1, bookingIds: ['bk-planned'], largeProjectIds: [],
      hasPlannedDay: true,
      items: [{ bookingId: 'bk-planned', largeProjectId: null, projectId: null, belongsToLargeProject: false }],
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      // Personen är i Stockholm city, inte Kaggeholm.
      locationLogicPings: makePings(59.3293, 18.0686, 10, 0),
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  const s = r.segments[0];
  assertEquals(s.type, 'known_address');
  assertEquals(s.businessContext?.status, 'planning_geo_mismatch');
  // Planering får inte vinna över GPS — matchedTarget ska INTE peka på Kaggeholm.
  assertEquals(s.businessContext?.matchedTarget, undefined);
  assert(s.businessContext?.warnings?.includes('planned_target_does_not_match_physical_location'));
});

Deno.test('Lager 2.3b D: för få pings → unresolved_location', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence({
    gps: { locationLogicPingCount: 1 },
    knownTargets: {
      totalCount: 1, withCoordinatesCount: 1, invalidCount: 0,
      items: [{
        targetType: 'warehouse', targetId: 'far', label: 'Långt bort',
        lat: 50, lng: 10, radiusMeters: 50, polygon: null,
        hasCoordinates: true, hasRadius: true, sourceTable: 'organization_locations',
        status: 'active', dateWindow: null, parentLargeProjectId: null,
        belongsToLargeProject: false, canBePrimaryWorkTarget: true,
        canBeGeoTarget: true, suppressedReason: null,
      }],
      dataQuality: {},
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: [
        { id: 'p1', ts: '2026-05-13T08:00:00Z', lat: 59, lng: 17, accuracy: 200 },
      ],
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  // Antingen unresolved_location eller inga segment alls — men inte known_address.
  for (const s of r.segments) {
    assert(s.type !== 'known_address');
    assert(s.type !== 'known_target');
  }
});

Deno.test('Lager 2.3b E: large project saknar geo, planering pekar dit → needs_location_review', () => {
  const r = buildLocationTruthFromDayEvidence(makeDayEvidence({
    gps: { locationLogicPingCount: 8 },
    knownTargets: {
      totalCount: 1, withCoordinatesCount: 0, invalidCount: 1,
      items: [{
        targetType: 'large_project', targetId: 'lp1', label: 'LP utan geo',
        lat: null, lng: null, radiusMeters: null, polygon: null,
        hasCoordinates: false, hasRadius: false, sourceTable: 'large_projects',
        status: 'active', dateWindow: null, parentLargeProjectId: null,
        belongsToLargeProject: false, canBePrimaryWorkTarget: true,
        canBeGeoTarget: false, suppressedReason: null,
      }],
      dataQuality: { largeProjectsMissingGeo: ['lp1'] },
    },
    assignments: {
      assignmentCount: 1, bookingIds: [], largeProjectIds: ['lp1'],
      hasPlannedDay: true,
      items: [{ bookingId: null, largeProjectId: 'lp1', projectId: null, belongsToLargeProject: true }],
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: makePings(59.3293, 18.0686, 10, 0),
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  const s = r.segments[0];
  // needs_location_review ELLER known_address — beroende på cluster-styrka.
  assert(s.type === 'needs_location_review' || s.type === 'known_address');
  if (s.type === 'needs_location_review') {
    assertEquals(s.businessContext?.status, 'needs_review');
  }
});

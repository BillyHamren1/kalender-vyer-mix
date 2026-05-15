// @ts-nocheck
/**
 * Lager 2.6 tests — final Location Truth segments.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLocationTruthFromDayEvidence } from './buildLocationTruthFromDayEvidence.ts';

function makePings(lat: number, lng: number, count = 8, startMin = 0, dateIso = '2026-05-13T08:00:00Z'): any[] {
  const arr: any[] = [];
  const base = new Date(dateIso).getTime();
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `p${startMin}_${i}`,
      ts: new Date(base + (startMin + i) * 60_000).toISOString(),
      lat: lat + (Math.random() - 0.5) * 0.00005,
      lng: lng + (Math.random() - 0.5) * 0.00005,
      accuracy: 10,
    });
  }
  return arr;
}

function whTarget(): any {
  return {
    targetType: 'warehouse', targetId: 'wh1', label: 'FA Warehouse',
    lat: 59.3293, lng: 18.0686, radiusMeters: 80, polygon: null,
    hasCoordinates: true, hasRadius: true,
    sourceTable: 'organization_locations', status: 'active',
    dateWindow: null, parentLargeProjectId: null, belongsToLargeProject: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: true, suppressedReason: null,
  };
}
function projTarget(id: string, label: string, lat: number, lng: number): any {
  return {
    targetType: 'project', targetId: id, label,
    lat, lng, radiusMeters: 80, polygon: null,
    hasCoordinates: true, hasRadius: true,
    sourceTable: 'projects', status: 'active',
    dateWindow: null, parentLargeProjectId: null, belongsToLargeProject: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: true, suppressedReason: null,
  };
}

function dayEvidence(overrides: any = {}): any {
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
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: [],
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
    ...overrides,
  };
}

Deno.test('Lager 2.6 A: warehouse-pings → final known_site + summary räknar 1', () => {
  const pings = makePings(59.3293, 18.0686, 10, 0);
  const r = buildLocationTruthFromDayEvidence(dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    knownTargets: { totalCount: 1, withCoordinatesCount: 1, invalidCount: 0, items: [whTarget()], dataQuality: {} },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));

  assert(r.segments.length >= 1);
  for (const s of r.segments) {
    assert(['known_site', 'movement', 'private_residence', 'unresolved_location', 'known_address', 'needs_location_review'].includes(s.finalType));
  }
  const sum = r.diagnostics.locationTruthSummary!;
  assertEquals(sum.knownSiteSegmentCount, sum.finalSegmentsByType.known_site);
  assert(sum.knownSiteSegmentCount >= 1);
  assertEquals(sum.movementSegmentCount, 0);
});

Deno.test('Lager 2.6 B: stabil okänd adress → final known_address eller unresolved_location', () => {
  const pings = makePings(59.5000, 18.1234, 10, 0);
  const r = buildLocationTruthFromDayEvidence(dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  const sum = r.diagnostics.locationTruthSummary!;
  assert(sum.knownAddressSegmentCount >= 1);
  for (const s of r.segments) {
    assert(s.finalType !== 'known_site');
  }
});

Deno.test('Lager 2.6 C: Projekt A → Projekt B med pings emellan → known_site + movement + known_site', () => {
  const pingsA = makePings(59.30, 18.00, 10, 0); // 08:00–08:09
  const pingsRoute = [
    { id: 'r1', ts: '2026-05-13T08:15:00Z', lat: 59.32, lng: 18.05, accuracy: 12 },
    { id: 'r2', ts: '2026-05-13T08:25:00Z', lat: 59.36, lng: 18.12, accuracy: 12 },
    { id: 'r3', ts: '2026-05-13T08:35:00Z', lat: 59.39, lng: 18.18, accuracy: 12 },
  ];
  const pingsB = makePings(59.40, 18.20, 10, 50); // 08:50–08:59
  const all = [...pingsA, ...pingsRoute, ...pingsB];
  const r = buildLocationTruthFromDayEvidence(dayEvidence({
    gps: { locationLogicPingCount: all.length },
    knownTargets: {
      totalCount: 2, withCoordinatesCount: 2, invalidCount: 0,
      items: [
        projTarget('P1', 'Projekt A', 59.30, 18.00),
        projTarget('P2', 'Projekt B', 59.40, 18.20),
      ],
      dataQuality: {},
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: all,
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  const sum = r.diagnostics.locationTruthSummary!;
  assert(sum.knownSiteSegmentCount >= 2, `expected >=2 known_site, got ${sum.knownSiteSegmentCount}`);
  assert(sum.movementSegmentCount >= 1, `expected movement, got ${sum.movementSegmentCount}`);
});

Deno.test('Lager 2.6 D: 0 pings → tom timeline + summary nollställd', () => {
  const r = buildLocationTruthFromDayEvidence(dayEvidence());
  const sum = r.diagnostics.locationTruthSummary!;
  assertEquals(sum.finalSegmentCount, 0);
  assertEquals(sum.knownSiteSegmentCount, 0);
  assertEquals(sum.movementSegmentCount, 0);
});

Deno.test('Lager 2.6: alla segment har giltig finalType', () => {
  const pings = makePings(59.3293, 18.0686, 8, 0);
  const r = buildLocationTruthFromDayEvidence(dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    knownTargets: { totalCount: 1, withCoordinatesCount: 1, invalidCount: 0, items: [whTarget()], dataQuality: {} },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-13T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-13T23:59:59.999Z',
    },
  }));
  for (const s of r.segments) {
    assert(typeof s.finalType === 'string');
    assert(['known_site', 'movement', 'private_residence', 'unresolved_location', 'known_address', 'needs_location_review'].includes(s.finalType));
  }
});

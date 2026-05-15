// @ts-nocheck
/**
 * Lager 2.11D — Sluta använda unknown_area för stabil fysisk plats.
 *
 * A. matcher returnerar 'no_eventflow_target_match' (inte 'unknown_area')
 *    när inget target träffas inom radie.
 * B. Stabilt kluster utan target → segment.type='known_address',
 *    physicalLocation.source='centroid', businessContext.status='no_target_match'
 *    eller 'unresolved_business_context', warning 'no_eventflow_target_match'.
 * C. Svagt kluster (för få pings) → segment.type='unresolved_location'.
 * D. needs_location_review används endast vid riktig konflikt
 *    (här: LP assigned men saknar egen geo).
 * E. Inga segment har type 'unknown_area' (typen finns inte längre).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLocationTruthFromDayEvidence } from './buildLocationTruthFromDayEvidence.ts';
import { matchClusterToKnownTarget } from './matchClusterToKnownTarget.ts';

function makePings(lat: number, lng: number, count = 12, startMin = 0, dateIso = '2026-05-15T08:00:00Z'): any[] {
  const arr: any[] = [];
  const base = new Date(dateIso).getTime();
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `p${startMin}_${i}`,
      ts: new Date(base + (startMin + i) * 60_000).toISOString(),
      lat: lat + (Math.random() - 0.5) * 0.00003,
      lng: lng + (Math.random() - 0.5) * 0.00003,
      accuracy: 8,
    });
  }
  return arr;
}

function dayEvidence(overrides: any = {}): any {
  return {
    staffId: 'A',
    date: '2026-05-15',
    gps: { locationLogicPingCount: 0 },
    assignments: { assignmentCount: 0, items: [], bookingIds: [], largeProjectIds: [], hasPlannedDay: false },
    knownTargets: { totalCount: 0, withCoordinatesCount: 0, invalidCount: 0, items: [], dataQuality: {} },
    privateResidence: { zoneCount: 0, hasUsableZone: false },
    largeProjects: { count: 0, withOwnGeoCount: 0 },
    dataQuality: {}, diagnostics: {},
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: [],
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
    ...overrides,
  };
}

Deno.test('Lager 2.11D — A: matcher returnerar no_eventflow_target_match (inte unknown_area)', () => {
  const cluster: any = {
    id: 'c1', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T08:20:00Z',
    centroidLat: 59.5000, centroidLng: 18.5000,
    radiusMeters: 25, pingCount: 12, isStable: true,
    confidence: 'high', sourcePingIds: [], medianAccuracyMeters: 8,
  };
  const r = matchClusterToKnownTarget({
    cluster, knownTargets: [], assignments: [],
    privateResidence: { hasUsableZone: false },
  });
  assertEquals(r.matchedTarget.type, 'no_eventflow_target_match');
  assert(r.matchedTarget.targetId === null);
});

Deno.test('Lager 2.11D — B: stabilt kluster utan target → known_address + centroid', () => {
  const pings = makePings(59.5000, 18.5000);
  const ev = dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
  });
  const r = buildLocationTruthFromDayEvidence(ev);
  const seg = r.segments.find((s: any) => s.type === 'known_address');
  assert(seg, `expected a known_address segment, got types: ${r.segments.map((s: any) => s.type).join(',')}`);
  assertEquals(seg.physicalLocation?.source, 'centroid');
  const status = seg.businessContext?.status;
  assert(
    status === 'no_target_match' || status === 'unresolved_business_context',
    `unexpected status: ${status}`,
  );
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('no_eventflow_target_match'), `missing warning: ${w}`);
  // finalType ska vara known_address (inte review).
  assertEquals(seg.finalType, 'known_address');
});

Deno.test('Lager 2.11D — C: svagt kluster (spridda pings) → ingen known_address', () => {
  // Två pings flera km isär — kan aldrig bilda stabilt kluster.
  const base = new Date('2026-05-15T08:00:00Z').getTime();
  const pings = [
    { id: 'p1', ts: new Date(base).toISOString(), lat: 59.6000, lng: 18.6000, accuracy: 8 },
    { id: 'p2', ts: new Date(base + 5 * 60_000).toISOString(), lat: 59.6500, lng: 18.6500, accuracy: 8 },
  ];
  const ev = dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
  });
  const r = buildLocationTruthFromDayEvidence(ev);
  const types = new Set(r.segments.map((s: any) => s.type));
  // Får ej skapa known_address från svagt/instabilt kluster och får aldrig
  // använda den borttagna typen unknown_area.
  assert(!types.has('known_address'), `should not create known_address from weak cluster: ${[...types]}`);
  assert(!types.has('unknown_area' as any), 'unknown_area type should not exist');
});

Deno.test('Lager 2.11D — D: needs_location_review endast vid riktig konflikt (LP assigned utan geo)', () => {
  const pings = makePings(59.7000, 18.7000);
  // LP utan geo, assignment pekar på LP.
  const lpNoGeo: any = {
    targetType: 'large_project', targetId: 'lp1', label: 'LP utan geo',
    lat: null, lng: null, radiusMeters: null, polygon: null,
    hasCoordinates: false, hasRadius: false,
    sourceTable: 'large_projects', status: 'active',
    dateWindow: null, parentLargeProjectId: null, belongsToLargeProject: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: false, suppressedReason: null,
  };
  const ev = dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    knownTargets: { totalCount: 1, withCoordinatesCount: 0, invalidCount: 1, items: [lpNoGeo], dataQuality: {} },
    assignments: {
      assignmentCount: 1,
      items: [{ bookingId: null, projectId: null, largeProjectId: 'lp1', belongsToLargeProject: false }],
      bookingIds: [], largeProjectIds: ['lp1'], hasPlannedDay: true,
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
  });
  const r = buildLocationTruthFromDayEvidence(ev);
  // Kan vara antingen segment.type='needs_location_review' (svagt kluster)
  // eller known_address med needs_review-status (stabilt kluster).
  const seg = r.segments[0];
  assert(seg, 'expected at least one segment');
  const isReview =
    seg.type === 'needs_location_review' ||
    seg.businessContext?.status === 'needs_review';
  assert(isReview, `expected review path, got type=${seg.type} status=${seg.businessContext?.status}`);
});

Deno.test('Lager 2.11D — E: typen unknown_area existerar inte i något segment', () => {
  const pings = makePings(59.8000, 18.8000);
  const ev = dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
  });
  const r = buildLocationTruthFromDayEvidence(ev);
  for (const s of r.segments) {
    assert(s.type !== ('unknown_area' as any), `segment ${s.id} has forbidden type unknown_area`);
  }
});

// @ts-nocheck
/**
 * Lager 2.11E — Large project utan geo gör inte fysisk plats okänd.
 *
 * A. LP utan geo + stabil GPS → known_address + needs_review +
 *    warnings large_project_missing_geo, business_target_missing_geo,
 *    assigned_large_project_missing_geo. matchedTarget får INTE vara child.
 * B. LP utan geo + GPS matchar warehouse → warehouse vinner som matchedTarget,
 *    status planning_geo_mismatch, warning planned_target_missing_geo.
 * C. LP utan geo + child booking har geo → child fungerar INTE som fallback
 *    (canBePrimaryWorkTarget=false). Resultat: known_address (LP-data-quality).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLocationTruthFromDayEvidence } from './buildLocationTruthFromDayEvidence.ts';

function makePings(lat: number, lng: number, count = 12, startMin = 0): any[] {
  const arr: any[] = [];
  const base = new Date('2026-05-15T08:00:00Z').getTime();
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

function dayEvidence(o: any = {}): any {
  return {
    staffId: 'A', date: '2026-05-15',
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
    ...o,
  };
}

function lpNoGeo(): any {
  return {
    targetType: 'large_project', targetId: 'lp1', label: 'LP utan geo',
    lat: null, lng: null, radiusMeters: null, polygon: null,
    hasCoordinates: false, hasRadius: false,
    sourceTable: 'large_projects', status: 'active',
    dateWindow: null, parentLargeProjectId: null, belongsToLargeProject: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: false, suppressedReason: null,
  };
}

function childBooking(lat: number, lng: number): any {
  return {
    targetType: 'booking', targetId: 'b1', label: 'Child booking',
    lat, lng, radiusMeters: 80, polygon: null,
    hasCoordinates: true, hasRadius: true,
    sourceTable: 'bookings', status: 'active',
    dateWindow: null, parentLargeProjectId: 'lp1', belongsToLargeProject: true,
    // suppressed because child of LP
    canBePrimaryWorkTarget: false, canBeGeoTarget: false,
    suppressedReason: 'child_of_large_project',
  };
}

function warehouseTgt(): any {
  return {
    targetType: 'warehouse', targetId: 'wh1', label: 'Lager',
    lat: 59.3293, lng: 18.0686, radiusMeters: 80, polygon: null,
    hasCoordinates: true, hasRadius: true,
    sourceTable: 'organization_locations', status: 'active',
    dateWindow: null, parentLargeProjectId: null, belongsToLargeProject: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: true, suppressedReason: null,
  };
}

function build(targets: any[], assignments: any[], lat: number, lng: number) {
  const pings = makePings(lat, lng);
  return buildLocationTruthFromDayEvidence(dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    knownTargets: {
      totalCount: targets.length,
      withCoordinatesCount: targets.filter((t) => t.hasCoordinates).length,
      invalidCount: targets.filter((t) => !t.hasCoordinates).length,
      items: targets, dataQuality: {},
    },
    assignments: {
      assignmentCount: assignments.length, items: assignments,
      bookingIds: [], largeProjectIds: [], hasPlannedDay: assignments.length > 0,
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
  }));
}

Deno.test('Lager 2.11E — A: LP utan geo + stabil GPS → known_address med data-quality warnings', () => {
  const r = build(
    [lpNoGeo()],
    [{ bookingId: null, projectId: null, largeProjectId: 'lp1', belongsToLargeProject: false }],
    59.7000, 18.7000,
  );
  const seg = r.segments[0];
  assert(seg, 'expected a segment');
  assertEquals(seg.type, 'known_address');
  assertEquals(seg.businessContext?.status, 'needs_review');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('large_project_missing_geo'), `missing large_project_missing_geo: ${w}`);
  assert(w.includes('business_target_missing_geo'), `missing business_target_missing_geo: ${w}`);
  assert(w.includes('assigned_large_project_missing_geo'), `missing assigned_large_project_missing_geo: ${w}`);
  // Ingen matchedTarget eller iaf inte child.
  assert(seg.matchedTarget?.targetType !== 'booking', 'should not fall back to child booking');
  assert(seg.matchedTarget?.targetType !== 'project', 'should not fall back to child project');
});

Deno.test('Lager 2.11E — B: LP utan geo + GPS matchar warehouse → warehouse vinner', () => {
  const wh = warehouseTgt();
  const r = build(
    [lpNoGeo(), wh],
    [{ bookingId: null, projectId: null, largeProjectId: 'lp1', belongsToLargeProject: false, startAt: '2026-05-15T07:30:00Z', endAt: '2026-05-15T09:00:00Z' }],
    wh.lat, wh.lng,
  );
  const seg = r.segments[0];
  assert(seg, 'expected a segment');
  assertEquals(seg.type, 'known_target');
  assertEquals(seg.matchedTarget?.targetType, 'warehouse');
  assertEquals(seg.matchedTarget?.targetId, 'wh1');
  assertEquals(seg.businessContext?.status, 'planning_geo_mismatch');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('planned_target_does_not_match_physical_location'), `missing mismatch warning: ${w}`);
  assert(w.includes('planned_target_missing_geo'), `missing planned_target_missing_geo: ${w}`);
});

Deno.test('Lager 2.11E — C: LP utan geo + child booking med geo → child blir aldrig fallback', () => {
  // GPS hamnar på child boookings koordinat — men child är canBePrimaryWorkTarget=false.
  const child = childBooking(59.8000, 18.8000);
  const r = build(
    [lpNoGeo(), child],
    [{ bookingId: 'b1', projectId: null, largeProjectId: 'lp1', belongsToLargeProject: true }],
    child.lat, child.lng,
  );
  const seg = r.segments[0];
  assert(seg, 'expected a segment');
  // Child får ALDRIG bli matchedTarget.
  assert(
    seg.matchedTarget?.targetId !== 'b1',
    `child booking blev matchedTarget (forbjudet): ${JSON.stringify(seg.matchedTarget)}`,
  );
  // Stabil position → known_address.
  assertEquals(seg.type, 'known_address');
  assertEquals(seg.businessContext?.status, 'needs_review');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('large_project_missing_geo'), `missing LP-warning: ${w}`);
  assert(w.includes('assigned_large_project_missing_geo'), `missing assigned-warning: ${w}`);
});

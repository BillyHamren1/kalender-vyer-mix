// @ts-nocheck
/**
 * Lager 2.11C — businessContext per targetType utan assignment.
 *
 * A. Supplier utan assignment, ingen planering → status 'supplier_visit',
 *    warning supplier_visit_without_project_context, INTE staff_not_assigned_to_matched_target.
 * B. Supplier utan assignment, planerad på annat projekt → 'supplier_visit',
 *    warning supplier_visit_during_planned_project.
 * C. Warehouse utan assignment, ingen planering → 'warehouse_presence',
 *    INTE staff_not_assigned_to_matched_target.
 * D. Warehouse utan assignment, planerad på projekt → warning warehouse_presence_during_planned_project.
 * E. Organization_location utan assignment → 'organization_location_presence',
 *    INTE staff_not_assigned_to_matched_target.
 * F. Project utan assignment → 'unassigned_known_target_presence' + warning.
 * G. Planning på project A men GPS på warehouse B → 'planning_geo_mismatch'
 *    + warning planned_target_does_not_match_physical_location, GPS-target vinner.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLocationTruthFromDayEvidence } from './buildLocationTruthFromDayEvidence.ts';

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

function tgt(targetType: string, id: string, lat: number, lng: number, label: string, sourceTable = 'x'): any {
  return {
    targetType, targetId: id, label,
    lat, lng, radiusMeters: 100, polygon: null,
    hasCoordinates: true, hasRadius: true,
    sourceTable, status: 'active',
    dateWindow: null, parentLargeProjectId: null, belongsToLargeProject: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: true, suppressedReason: null,
  };
}

function buildAt(target: any, opts: { assignments?: any[]; extraTargets?: any[] } = {}) {
  const items = [target, ...(opts.extraTargets ?? [])];
  const pings = makePings(target.lat, target.lng);
  const ev = dayEvidence({
    gps: { locationLogicPingCount: pings.length },
    knownTargets: { totalCount: items.length, withCoordinatesCount: items.length, invalidCount: 0, items, dataQuality: {} },
    assignments: {
      assignmentCount: opts.assignments?.length ?? 0,
      items: opts.assignments ?? [],
      bookingIds: [], largeProjectIds: [], hasPlannedDay: !!opts.assignments?.length,
    },
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
  });
  return buildLocationTruthFromDayEvidence(ev);
}

function findKnownTargetSeg(res: any) {
  return res.segments.find((s: any) => s.type === 'known_target');
}

Deno.test('Lager 2.11C — A: supplier utan assignment + ingen planering', () => {
  const sup = tgt('supplier', 'sup1', 59.3400, 18.0600, 'Acme', 'external_suppliers');
  const r = buildAt(sup);
  const seg = findKnownTargetSeg(r);
  assert(seg, 'should have known_target segment');
  assertEquals(seg.businessContext?.status, 'supplier_visit');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('supplier_visit_without_project_context'), `missing without_project_context: ${w}`);
  assert(!w.includes('staff_not_assigned_to_matched_target'), 'should NOT have staff_not_assigned for supplier');
});

Deno.test('Lager 2.11C — B: supplier utan assignment, planerad på projekt', () => {
  const sup = tgt('supplier', 'sup1', 59.3400, 18.0600, 'Acme', 'external_suppliers');
  const r = buildAt(sup, {
    assignments: [{ bookingId: 'b1', projectId: null, largeProjectId: null, belongsToLargeProject: false, startAt: '2026-05-15T07:30:00Z', endAt: '2026-05-15T09:00:00Z' }],
  });
  const seg = findKnownTargetSeg(r);
  assertEquals(seg.businessContext?.status, 'supplier_visit');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('supplier_visit_during_planned_project'), `missing during_planned: ${w}`);
  assert(!w.includes('staff_not_assigned_to_matched_target'));
});

Deno.test('Lager 2.11C — C: warehouse utan assignment, ingen planering', () => {
  const wh = tgt('warehouse', 'wh1', 59.3293, 18.0686, 'Lager', 'organization_locations');
  const r = buildAt(wh);
  const seg = findKnownTargetSeg(r);
  assertEquals(seg.businessContext?.status, 'warehouse_presence');
  const w = seg.businessContext?.warnings ?? [];
  assert(!w.includes('staff_not_assigned_to_matched_target'), `should NOT have staff_not_assigned: ${w}`);
  assert(!w.includes('warehouse_presence_during_planned_project'));
});

Deno.test('Lager 2.11C — D: warehouse utan assignment, planerad på projekt', () => {
  const wh = tgt('warehouse', 'wh1', 59.3293, 18.0686, 'Lager', 'organization_locations');
  const r = buildAt(wh, {
    assignments: [{ bookingId: null, projectId: 'pX', largeProjectId: null, belongsToLargeProject: false, startAt: '2026-05-15T07:30:00Z', endAt: '2026-05-15T09:00:00Z' }],
  });
  const seg = findKnownTargetSeg(r);
  assertEquals(seg.businessContext?.status, 'warehouse_presence');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('warehouse_presence_during_planned_project'), `missing warning: ${w}`);
  assert(!w.includes('staff_not_assigned_to_matched_target'));
});

Deno.test('Lager 2.11C — E: organization_location utan assignment', () => {
  const ol = tgt('organization_location', 'ol1', 59.3500, 18.0700, 'HQ', 'organization_locations');
  const r = buildAt(ol);
  const seg = findKnownTargetSeg(r);
  assertEquals(seg.businessContext?.status, 'organization_location_presence');
  const w = seg.businessContext?.warnings ?? [];
  assert(!w.includes('staff_not_assigned_to_matched_target'));
});

Deno.test('Lager 2.11C — F: project utan assignment → unassigned_known_target_presence', () => {
  const pr = tgt('project', 'p1', 59.3600, 18.0800, 'Project A', 'projects');
  const r = buildAt(pr);
  const seg = findKnownTargetSeg(r);
  assertEquals(seg.businessContext?.status, 'unassigned_known_target_presence');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('staff_not_assigned_to_matched_target'), `missing warning: ${w}`);
});

Deno.test('Lager 2.11C — G: planning på A men GPS på B → planning_geo_mismatch, GPS vinner', () => {
  // GPS på warehouse, men assignment pekar på project A (långt bort).
  const wh = tgt('warehouse', 'wh1', 59.3293, 18.0686, 'Lager', 'organization_locations');
  const projA = tgt('project', 'pA', 59.5000, 18.5000, 'Project A långt bort', 'projects');
  const r = buildAt(wh, {
    assignments: [{ bookingId: null, projectId: 'pA', largeProjectId: null, belongsToLargeProject: false }],
    extraTargets: [projA],
  });
  const seg = findKnownTargetSeg(r);
  assert(seg, 'should have known_target segment');
  // GPS-target vinner
  assertEquals(seg.matchedTarget?.targetType, 'warehouse');
  assertEquals(seg.matchedTarget?.targetId, 'wh1');
  assertEquals(seg.businessContext?.status, 'planning_geo_mismatch');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('planned_target_does_not_match_physical_location'), `missing mismatch warning: ${w}`);
});

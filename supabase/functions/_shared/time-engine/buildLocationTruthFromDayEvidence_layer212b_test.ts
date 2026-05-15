// @ts-nocheck
/**
 * Lager 2.12B — Tidsbaserade planning warnings.
 *
 * Day-level "har en assignment idag" räcker inte längre — assignment måste
 * tidsmässigt överlappa segmentet (cluster.startAt/endAt) för att trigga
 * planning_geo_mismatch / supplier_visit_during_planned_project /
 * warehouse_presence_during_planned_project.
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

function buildAt(items: any[], pings: any[], assignments: any[] = []) {
  const ev = {
    staffId: 'A', date: '2026-05-15',
    gps: { locationLogicPingCount: pings.length },
    assignments: {
      assignmentCount: assignments.length, items: assignments,
      bookingIds: [], largeProjectIds: [], hasPlannedDay: !!assignments.length,
    },
    knownTargets: { totalCount: items.length, withCoordinatesCount: items.length, invalidCount: 0, items, dataQuality: {} },
    privateResidence: { zoneCount: 0, hasUsableZone: false },
    largeProjects: { count: 0, withOwnGeoCount: 0 },
    dataQuality: {}, diagnostics: {},
    internal: {
      normalizedPings: [], hardRejectedPings: [],
      locationLogicPings: pings,
      dayWindowStartUtc: '2026-05-15T00:00:00.000Z',
      dayWindowEndUtc: '2026-05-15T23:59:59.999Z',
    },
  };
  return buildLocationTruthFromDayEvidence(ev);
}

function findKnown(r: any) {
  return r.segments.find((s: any) => s.type === 'known_target');
}

// Pings utan startMin börjar 08:00 UTC och håller på i 12 minuter.
// Assignment 06:00–07:00 ⇒ INGEN overlap.
// Assignment 07:30–09:00 ⇒ overlap.

Deno.test('Lager 2.12B — supplier-besök 15:00 utan overlapp med planering 08–10 → INGEN during_planned warning', () => {
  const sup = tgt('supplier', 'sup1', 59.34, 18.06, 'Acme', 'external_suppliers');
  // Pings vid 15:00 UTC → segment ~15:00–15:12.
  const pings = makePings(59.34, 18.06, 12, 0, '2026-05-15T15:00:00Z');
  const r = buildAt([sup], pings, [{
    bookingId: 'b1', projectId: null, largeProjectId: null,
    belongsToLargeProject: false,
    startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z',
  }]);
  const seg = findKnown(r);
  assert(seg, 'should have known_target seg');
  assertEquals(seg.businessContext?.status, 'supplier_visit');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('supplier_visit_without_project_context'), `missing without_project: ${w}`);
  assert(!w.includes('supplier_visit_during_planned_project'), `should NOT have during_planned: ${w}`);

  const physDiag = r.diagnostics.physicalLocationDiagnostics;
  assertEquals(physDiag.overlappingAssignmentCount, 0);
  assertEquals(physDiag.nonOverlappingAssignmentIgnoredCount, 1);
  assert(physDiag.planningWarningsSuppressedNoOverlapCount >= 1);
});

Deno.test('Lager 2.12B — supplier-besök 08:00 MED overlap → during_planned_project warning', () => {
  const sup = tgt('supplier', 'sup1', 59.34, 18.06, 'Acme', 'external_suppliers');
  const pings = makePings(59.34, 18.06, 12, 0, '2026-05-15T08:00:00Z');
  const r = buildAt([sup], pings, [{
    bookingId: 'b1', projectId: null, largeProjectId: null,
    belongsToLargeProject: false,
    startAt: '2026-05-15T07:30:00Z', endAt: '2026-05-15T10:00:00Z',
  }]);
  const seg = findKnown(r);
  assertEquals(seg.businessContext?.status, 'supplier_visit');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('supplier_visit_during_planned_project'), `missing during_planned: ${w}`);

  const physDiag = r.diagnostics.physicalLocationDiagnostics;
  assertEquals(physDiag.overlappingAssignmentCount, 1);
});

Deno.test('Lager 2.12B — warehouse utan overlap → ingen warehouse_presence_during_planned_project', () => {
  const wh = tgt('warehouse', 'wh1', 59.33, 18.07, 'Lager', 'organization_locations');
  const pings = makePings(59.33, 18.07, 12, 0, '2026-05-15T15:00:00Z');
  const r = buildAt([wh], pings, [{
    bookingId: null, projectId: 'pX', largeProjectId: null,
    belongsToLargeProject: false,
    startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z',
  }]);
  const seg = findKnown(r);
  assertEquals(seg.businessContext?.status, 'warehouse_presence');
  const w = seg.businessContext?.warnings ?? [];
  assert(!w.includes('warehouse_presence_during_planned_project'), `should NOT have warning: ${w}`);
});

Deno.test('Lager 2.12B — planning_geo_mismatch suppressas när assignment inte överlappar', () => {
  // GPS på warehouse 15:00. Assignment på projekt A 08–10 (utanför segmentet).
  const wh = tgt('warehouse', 'wh1', 59.33, 18.07, 'Lager', 'organization_locations');
  const projA = tgt('project', 'pA', 59.50, 18.50, 'Långt bort', 'projects');
  const pings = makePings(59.33, 18.07, 12, 0, '2026-05-15T15:00:00Z');
  const r = buildAt([wh, projA], pings, [{
    bookingId: null, projectId: 'pA', largeProjectId: null,
    belongsToLargeProject: false,
    startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z',
  }]);
  const seg = findKnown(r);
  // Status ska INTE vara planning_geo_mismatch när planeringen inte överlappar.
  assert(seg.businessContext?.status !== 'planning_geo_mismatch',
    `expected non-mismatch, got ${seg.businessContext?.status}`);
  const w = seg.businessContext?.warnings ?? [];
  assert(!w.includes('planned_target_does_not_match_physical_location'),
    `should NOT have mismatch warning: ${w}`);

  const physDiag = r.diagnostics.physicalLocationDiagnostics;
  assert(physDiag.planningWarningsSuppressedNoOverlapCount >= 1);
});

Deno.test('Lager 2.12B — assignment utan startAt/endAt räknas som weak context', () => {
  const sup = tgt('supplier', 'sup1', 59.34, 18.06, 'Acme', 'external_suppliers');
  const pings = makePings(59.34, 18.06, 12, 0, '2026-05-15T08:00:00Z');
  const r = buildAt([sup], pings, [{
    bookingId: 'b1', projectId: null, largeProjectId: null,
    belongsToLargeProject: false,
    // saknar startAt/endAt
  }]);
  const seg = findKnown(r);
  assertEquals(seg.businessContext?.status, 'supplier_visit');
  const w = seg.businessContext?.warnings ?? [];
  // Weak context → ingen during_planned, vi får without_project_context.
  assert(w.includes('supplier_visit_without_project_context'));
  assert(!w.includes('supplier_visit_during_planned_project'));

  const physDiag = r.diagnostics.physicalLocationDiagnostics;
  assert(physDiag.assignmentMissingTimeWindowCount >= 1);
});

Deno.test('Lager 2.12B — diagnostics-fälten initialiseras alltid', () => {
  const sup = tgt('supplier', 'sup1', 59.34, 18.06, 'Acme', 'external_suppliers');
  const pings = makePings(59.34, 18.06);
  const r = buildAt([sup], pings, []);
  const physDiag = r.diagnostics.physicalLocationDiagnostics;
  assertEquals(typeof physDiag.overlappingAssignmentCount, 'number');
  assertEquals(typeof physDiag.nonOverlappingAssignmentIgnoredCount, 'number');
  assertEquals(typeof physDiag.assignmentMissingTimeWindowCount, 'number');
  assertEquals(typeof physDiag.planningWarningsSuppressedNoOverlapCount, 'number');
});

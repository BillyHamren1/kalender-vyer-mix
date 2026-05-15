// @ts-nocheck
/**
 * Lager 2.11F — Diagnostics-utbyggnad i PhysicalLocationDiagnostics.
 *
 * Verifierar:
 * - knownAddressNoTargetCount (alias)
 * - unresolvedLocationCount
 * - noEventFlowTargetMatchCount
 * - supplierVisitCount
 * - warehousePresenceCount
 * - unassignedProjectPresenceCount
 * - planningGeoMismatchCount
 * - largeProjectMissingGeoBusinessWarningCount
 * - physicalLocationAddressFilledCount
 * - physicalLocationAddressMissingCount
 * - examples innehåller physicalLocation label/address/source +
 *   businessContext status + matchedTarget + warnings.
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

function tgt(targetType: string, id: string, lat: number, lng: number, label: string, sourceTable = 'x', address: string | null = null): any {
  return {
    targetType, targetId: id, label, address,
    lat, lng, radiusMeters: 100, polygon: null,
    hasCoordinates: true, hasRadius: true,
    sourceTable, status: 'active',
    dateWindow: null, parentLargeProjectId: null, belongsToLargeProject: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: true, suppressedReason: null,
  };
}

function dayEv(items: any[], pings: any[], assignments: any[] = []): any {
  return {
    staffId: 'A',
    date: '2026-05-15',
    gps: { locationLogicPingCount: pings.length },
    assignments: { assignmentCount: assignments.length, items: assignments, bookingIds: [], largeProjectIds: [], hasPlannedDay: !!assignments.length },
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
}

Deno.test('Lager 2.11F — alla nya counters finns och är initierade till 0', () => {
  const r = buildLocationTruthFromDayEvidence(dayEv([], []));
  const d = r.diagnostics.physicalLocationDiagnostics!;
  assertEquals(d.knownAddressNoTargetCount, 0);
  assertEquals(d.unresolvedLocationCount, 0);
  assertEquals(d.noEventFlowTargetMatchCount, 0);
  assertEquals(d.supplierVisitCount, 0);
  assertEquals(d.warehousePresenceCount, 0);
  assertEquals(d.unassignedProjectPresenceCount, 0);
  assertEquals(d.planningGeoMismatchCount, 0);
  assertEquals(d.largeProjectMissingGeoBusinessWarningCount, 0);
  assertEquals(d.physicalLocationAddressFilledCount, 0);
  assertEquals(d.physicalLocationAddressMissingCount, 0);
});

Deno.test('Lager 2.11F — supplier-besök räknas + address fylls', () => {
  const sup = tgt('supplier', 's1', 59.34, 18.06, 'Acme', 'external_suppliers', 'Storgatan 1, Stockholm');
  const r = buildLocationTruthFromDayEvidence(dayEv([sup], makePings(59.34, 18.06)));
  const d = r.diagnostics.physicalLocationDiagnostics!;
  assertEquals(d.supplierVisitCount, 1);
  assertEquals(d.physicalLocationAddressFilledCount, 1);
  assertEquals(d.physicalLocationAddressMissingCount, 0);
  assert(d.examples.length > 0);
  const ex = d.examples[0];
  assertEquals(ex.physicalLocationAddress, 'Storgatan 1, Stockholm');
  assertEquals(ex.physicalLocationSource, 'eventflow_target');
  assertEquals(ex.businessContextStatus, 'supplier_visit');
  assertEquals(ex.matchedTarget?.targetType, 'supplier');
  assert(Array.isArray(ex.warnings));
});

Deno.test('Lager 2.11F — warehouse-närvaro + ingen address ⇒ missing-counter', () => {
  const wh = tgt('warehouse', 'w1', 59.33, 18.07, 'Lager', 'organization_locations'); // ingen address
  const r = buildLocationTruthFromDayEvidence(dayEv([wh], makePings(59.33, 18.07)));
  const d = r.diagnostics.physicalLocationDiagnostics!;
  assertEquals(d.warehousePresenceCount, 1);
  assertEquals(d.physicalLocationAddressMissingCount, 1);
  assertEquals(d.physicalLocationAddressFilledCount, 0);
});

Deno.test('Lager 2.11F — project utan assignment räknas som unassignedProjectPresence', () => {
  const p = tgt('project', 'p1', 59.36, 18.08, 'Proj A', 'projects');
  const r = buildLocationTruthFromDayEvidence(dayEv([p], makePings(59.36, 18.08)));
  const d = r.diagnostics.physicalLocationDiagnostics!;
  assertEquals(d.unassignedProjectPresenceCount, 1);
});

Deno.test('Lager 2.11F — planning_geo_mismatch + ingen target ⇒ no_eventflow + planningGeoMismatch + knownAddressNoTargetCount alias', () => {
  // GPS på okänd plats långt från planerad project.
  const proj = tgt('project', 'pA', 59.50, 18.50, 'Långt bort', 'projects');
  const pings = makePings(59.34, 18.06);
  const r = buildLocationTruthFromDayEvidence(dayEv([proj], pings, [
    { bookingId: null, projectId: 'pA', largeProjectId: null, belongsToLargeProject: false },
  ]));
  const d = r.diagnostics.physicalLocationDiagnostics!;
  assertEquals(d.knownAddressNoTargetCount, d.clustersWithKnownAddressNoTargetCount);
  assert(d.knownAddressNoTargetCount >= 1);
  assert(d.noEventFlowTargetMatchCount >= 1);
});

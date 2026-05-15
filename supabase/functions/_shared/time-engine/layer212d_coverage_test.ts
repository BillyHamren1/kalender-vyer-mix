// @ts-nocheck
/**
 * Lager 2.12D — Täckningstester för 2.12A (supplier-fetch) och 2.12B
 * (tidsbaserade planning warnings). Testfallen 1, 2 (single-table) och 8
 * (planning_geo_mismatch MED overlap) som inte täcks av tidigare svit.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildKnownTargetsEvidence } from './buildKnownTargetsEvidence.ts';
import { buildLocationTruthFromDayEvidence } from './buildLocationTruthFromDayEvidence.ts';

// ── Supplier-fetch helpers (samma stub som 212a-test) ────────────────────

function makeAdmin(tables: Record<string, any[] | { error: string }>): any {
  return {
    from(table: string) {
      const t = tables[table];
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        in() { return builder; },
        then(resolve: (r: any) => void) {
          if (t && (t as any).error) {
            resolve({ data: null, error: { message: (t as any).error } });
          } else {
            resolve({ data: (t as any[] | undefined) ?? [], error: null });
          }
        },
      };
      return builder;
    },
  };
}

const ORG = '00000000-0000-0000-0000-000000000001';

// ── Test 1: external_suppliers med geo ───────────────────────────────────
Deno.test('2.12D #1: external_suppliers med supplier-rad + geo → supplier target skapas', async () => {
  const admin = makeAdmin({
    external_suppliers: [{
      id: 'es-1', name: 'Cramo', is_active: true,
      raw: { latitude: 59.32, longitude: 18.05, radius_meters: 120 },
    }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-15',
  });
  assertEquals(r.diagnostics.supplierCount, 1);
  assertEquals(r.diagnostics.supplierTableUsed, 'external_suppliers');
  assertEquals(r.diagnostics.supplierTablesSkippedBecauseTooBroad.length, 0);
  const sup = r.items.find((i) => i.targetType === 'supplier');
  assert(sup, 'supplier target should exist');
  assertEquals(sup!.targetId, 'es-1');
  assert(sup!.hasCoordinates);
});

// ── Test 2: companies utan supplier-marker (single-table) ───────────────
Deno.test('2.12D #2: companies utan supplier-markörer → inga supplier targets, requires_filter', async () => {
  const admin = makeAdmin({
    companies: [
      { id: 'co1', name: 'Kund AB', company_type: 'customer' },
      { id: 'co2', name: 'Bolag X' },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-15',
  });
  assertEquals(r.diagnostics.supplierCount, 0);
  assertEquals(r.items.filter((i) => i.targetType === 'supplier').length, 0);
  assert(r.diagnostics.supplierTablesSkippedBecauseTooBroad.includes('companies'));
  assert(r.diagnostics.supplierRowsSkippedNoSupplierMarker >= 2);
  assert(r.diagnostics.supplierTableRequiresFilterWarnings.some((w: string) => w.includes('companies')));
  assert(r.diagnostics.warnings.includes('no_safe_supplier_source_found'));
});

// ── Test 3 (cross-check spec #4): contacts utan markörer ────────────────
Deno.test('2.12D #4: contacts utan supplier-markörer → inga supplier targets', async () => {
  const admin = makeAdmin({
    contacts: [{ id: 'c1', name: 'Anna', type: 'customer' }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-15',
  });
  assertEquals(r.items.filter((i) => i.targetType === 'supplier').length, 0);
  assert(r.diagnostics.supplierTablesSkippedBecauseTooBroad.includes('contacts'));
});

// ── Planning-mismatch helpers (samma form som 212b) ──────────────────────

function makePings(lat: number, lng: number, count = 12, dateIso = '2026-05-15T10:30:00Z'): any[] {
  const arr: any[] = [];
  const base = new Date(dateIso).getTime();
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `p_${i}`,
      ts: new Date(base + i * 60_000).toISOString(),
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
  return buildLocationTruthFromDayEvidence({
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
  } as any);
}

// ── Test 8: planning_geo_mismatch MED overlap ───────────────────────────
Deno.test('2.12D #8: planning mismatch MED tidsöverlapp → planning_geo_mismatch sätts', () => {
  // Assignment på projekt A 10:00–12:00, GPS på projekt B 10:30–10:42 → overlap.
  const projA = tgt('project', 'pA', 59.50, 18.50, 'A', 'projects');
  const projB = tgt('project', 'pB', 59.34, 18.07, 'B', 'projects');
  const pings = makePings(projB.lat, projB.lng, 12, '2026-05-15T10:30:00Z');
  const r = buildAt([projA, projB], pings, [{
    bookingId: null, projectId: 'pA', largeProjectId: null,
    belongsToLargeProject: false,
    startAt: '2026-05-15T10:00:00Z', endAt: '2026-05-15T12:00:00Z',
  }]);
  const seg = r.segments.find((s: any) => s.type === 'known_target');
  assert(seg, 'should have known_target seg');
  assertEquals(seg.matchedTarget?.targetId, 'pB');
  assertEquals(seg.businessContext?.status, 'planning_geo_mismatch');
  const w = seg.businessContext?.warnings ?? [];
  assert(
    w.includes('planned_target_does_not_match_physical_location'),
    `expected mismatch warning, got ${JSON.stringify(w)}`,
  );
  const physDiag = r.diagnostics.physicalLocationDiagnostics;
  assertEquals(physDiag.overlappingAssignmentCount, 1);
});

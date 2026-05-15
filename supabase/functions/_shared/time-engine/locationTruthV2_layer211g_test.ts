// @ts-nocheck
/**
 * Lager 2.11G — Umbrella-tester för Location Truth V2.
 *
 * Täcker alla 9 scenarier i Lager 2.11G-specen:
 *  1. Supplier fetch (tabellordning, geo top-level/raw, missing geo, default radius)
 *  2. Address propagation (supplier/warehouse/project)
 *  3. Supplier visit utan assignment
 *  4. Warehouse presence utan assignment
 *  5. Project utan assignment → unassigned_known_target_presence + warning
 *  6. No target match (stabilt kluster) → known_address + no_eventflow_target_match
 *  7. Weak cluster → unresolved_location
 *  8. Large project missing geo → known_address + needs_review + child blir inte fallback
 *  9. Planning mismatch → GPS vinner + planning_geo_mismatch
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildLocationTruthFromDayEvidence } from './buildLocationTruthFromDayEvidence.ts';
import { buildKnownTargetsEvidence } from './buildKnownTargetsEvidence.ts';

// ── Mocks ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeAdmin(tables: Record<string, Row[] | { error: string }>): any {
  return {
    from(table: string) {
      const t = tables[table];
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        in() { return builder; },
        or() { return builder; },
        then(resolve: (r: any) => void) {
          if (t && (t as any).error) {
            resolve({ data: null, error: { message: (t as any).error } });
          } else {
            resolve({ data: (t as Row[] | undefined) ?? [], error: null });
          }
        },
      };
      return builder;
    },
  };
}

const ORG = '00000000-0000-0000-0000-000000000001';

function makePings(lat: number, lng: number, count = 12, dateIso = '2026-05-15T08:00:00Z'): any[] {
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

function tgt(targetType: string, id: string, lat: number | null, lng: number | null, label: string, opts: any = {}): any {
  const hasCoords = lat !== null && lng !== null;
  return {
    targetType, targetId: id, label,
    address: opts.address ?? null,
    lat, lng,
    radiusMeters: hasCoords ? 100 : null,
    polygon: null,
    hasCoordinates: hasCoords, hasRadius: hasCoords,
    sourceTable: opts.sourceTable ?? 'x',
    status: 'active',
    dateWindow: null,
    parentLargeProjectId: opts.parentLargeProjectId ?? null,
    belongsToLargeProject: !!opts.parentLargeProjectId,
    canBePrimaryWorkTarget: opts.canBePrimaryWorkTarget ?? hasCoords,
    canBeGeoTarget: opts.canBeGeoTarget ?? hasCoords,
    suppressedReason: opts.suppressedReason ?? null,
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

const findSeg = (r: any, type: string) => r.segments.find((s: any) => s.type === type);
const findFinal = (r: any, ft: string) => r.segments.find((s: any) => s.finalType === ft);

// ── 1. Supplier fetch ────────────────────────────────────────────────────

Deno.test('Lager 2.11G #1a — external_suppliers TOM + suppliers har data → suppliers används', async () => {
  const admin = makeAdmin({
    external_suppliers: [],
    suppliers: [{ id: 's1', name: 'Acme', is_active: true, latitude: 59.3, longitude: 18.0, radius_meters: 200 }],
  });
  const r = await buildKnownTargetsEvidence({ supabaseAdmin: admin, organizationId: ORG, staffId: 's', date: '2026-05-15' });
  assertEquals(r.diagnostics.supplierTableUsed, 'suppliers');
  assert(r.diagnostics.supplierTablesTried.includes('external_suppliers'));
  assert(r.diagnostics.supplierTablesTried.includes('suppliers'));
  assertEquals(r.diagnostics.supplierCount, 1);
});

Deno.test('Lager 2.11G #1b — supplier geo från top-level lat/lng', async () => {
  const admin = makeAdmin({
    suppliers: [{ id: 's1', name: 'TopLevel', is_active: true, latitude: 59.3, longitude: 18.0, radius_meters: 100 }],
  });
  const r = await buildKnownTargetsEvidence({ supabaseAdmin: admin, organizationId: ORG, staffId: 's', date: '2026-05-15' });
  const sup = r.items.find((i) => i.targetType === 'supplier')!;
  assertEquals(sup.lat, 59.3);
  assertEquals(sup.lng, 18.0);
  assertEquals(sup.hasCoordinates, true);
  assertEquals(sup.radiusSource, 'native');
});

Deno.test('Lager 2.11G #1c — supplier geo från raw/metadata', async () => {
  const admin = makeAdmin({
    suppliers: [{ id: 's1', name: 'FromRaw', is_active: true, raw: { lat: 59.5, lng: 18.5, radius_meters: 80 } }],
  });
  const r = await buildKnownTargetsEvidence({ supabaseAdmin: admin, organizationId: ORG, staffId: 's', date: '2026-05-15' });
  const sup = r.items.find((i) => i.targetType === 'supplier')!;
  assertEquals(sup.lat, 59.5);
  assertEquals(sup.lng, 18.5);
  assertEquals(sup.radiusSource, 'native');
});

Deno.test('Lager 2.11G #1d — supplier saknar geo → suppliersMissingCoordinates', async () => {
  const admin = makeAdmin({
    suppliers: [{ id: 's1', name: 'NoGeo', is_active: true }],
  });
  const r = await buildKnownTargetsEvidence({ supabaseAdmin: admin, organizationId: ORG, staffId: 's', date: '2026-05-15' });
  assertEquals(r.diagnostics.suppliersMissingGeoCount, 1);
  assertEquals(r.dataQuality.suppliersMissingCoordinates.length, 1);
});

Deno.test('Lager 2.11G #1e — supplier saknar radius → default_supplier_radius + diagnostics', async () => {
  const admin = makeAdmin({
    suppliers: [{ id: 's1', name: 'NoRadius', is_active: true, latitude: 59.3, longitude: 18.0 }],
  });
  const r = await buildKnownTargetsEvidence({ supabaseAdmin: admin, organizationId: ORG, staffId: 's', date: '2026-05-15' });
  const sup = r.items.find((i) => i.targetType === 'supplier')!;
  assertEquals(sup.radiusMeters, 150);
  assertEquals(sup.radiusSource, 'default_supplier_radius');
  assertEquals(r.diagnostics.defaultSupplierRadiusAppliedCount, 1);
});

// ── 2. Address propagation ───────────────────────────────────────────────

Deno.test('Lager 2.11G #2 — matched supplier/warehouse/project med address → physicalLocation.address', () => {
  for (const tt of ['supplier', 'warehouse', 'project'] as const) {
    const t = tgt(tt, 'x1', 59.34, 18.06, 'L', { address: 'Storgatan 1, Stockholm' });
    const r = buildLocationTruthFromDayEvidence(dayEv([t], makePings(59.34, 18.06)));
    const seg = findSeg(r, 'known_target')!;
    assertEquals(seg.physicalLocation?.address, 'Storgatan 1, Stockholm', `address saknas för ${tt}`);
  }
});

// ── 3. Supplier visit utan assignment ────────────────────────────────────

Deno.test('Lager 2.11G #3 — GPS på supplier utan assignment → supplier_visit (ej staff_not_assigned)', () => {
  const sup = tgt('supplier', 's1', 59.34, 18.06, 'Acme', { sourceTable: 'external_suppliers' });
  const r = buildLocationTruthFromDayEvidence(dayEv([sup], makePings(59.34, 18.06)));
  const seg = findSeg(r, 'known_target')!;
  assertEquals(seg.matchedTarget?.targetType, 'supplier');
  assertEquals(seg.businessContext?.status, 'supplier_visit');
  const w = seg.businessContext?.warnings ?? [];
  assert(!w.includes('staff_not_assigned_to_matched_target'));
});

// ── 4. Warehouse presence utan assignment ────────────────────────────────

Deno.test('Lager 2.11G #4 — GPS på warehouse utan assignment → warehouse_presence (ej staff_not_assigned)', () => {
  const wh = tgt('warehouse', 'w1', 59.33, 18.07, 'Lager', { sourceTable: 'organization_locations' });
  const r = buildLocationTruthFromDayEvidence(dayEv([wh], makePings(59.33, 18.07)));
  const seg = findSeg(r, 'known_target')!;
  assertEquals(seg.businessContext?.status, 'warehouse_presence');
  const w = seg.businessContext?.warnings ?? [];
  assert(!w.includes('staff_not_assigned_to_matched_target'));
});

// ── 5. Project utan assignment ───────────────────────────────────────────

Deno.test('Lager 2.11G #5 — GPS på project utan assignment → unassigned_known_target_presence + warning', () => {
  const p = tgt('project', 'p1', 59.36, 18.08, 'Proj A');
  const r = buildLocationTruthFromDayEvidence(dayEv([p], makePings(59.36, 18.08)));
  const seg = findSeg(r, 'known_target')!;
  assertEquals(seg.businessContext?.status, 'unassigned_known_target_presence');
  assert((seg.businessContext?.warnings ?? []).includes('staff_not_assigned_to_matched_target'));
});

// ── 6. No target match → known_address ───────────────────────────────────

Deno.test('Lager 2.11G #6 — stabilt kluster utan target → known_address + no_eventflow_target_match (ej unresolved_location)', () => {
  const r = buildLocationTruthFromDayEvidence(dayEv([], makePings(59.40, 18.10, 20)));
  const seg = findSeg(r, 'known_address');
  assert(seg, 'expected known_address segment');
  const w = seg!.businessContext?.warnings ?? [];
  assert(w.includes('no_eventflow_target_match'), `missing warning: ${w}`);
  // Får inte vara unresolved_location för stabilt kluster
  assert(!findSeg(r, 'unresolved_location'), 'stabilt kluster ska INTE bli unresolved_location');
});

// ── 7. Weak cluster → unresolved_location ────────────────────────────────

Deno.test('Lager 2.11G #7 — för få/spridda pings → unresolved_location, ingen known_address', () => {
  // Två pings långt isär → instabilt kluster
  const pings = [
    { id: 'p1', ts: '2026-05-15T08:00:00Z', lat: 59.30, lng: 18.00, accuracy: 8 },
    { id: 'p2', ts: '2026-05-15T08:30:00Z', lat: 59.40, lng: 18.30, accuracy: 8 },
  ];
  const r = buildLocationTruthFromDayEvidence(dayEv([], pings));
  // Får inte finnas known_address för svagt kluster
  assert(!findSeg(r, 'known_address'), 'weak cluster ska INTE bli known_address');
});

// ── 8. Large project missing geo ─────────────────────────────────────────

Deno.test('Lager 2.11G #8 — assignment på LP utan geo + stabil centroid → known_address/needs_review + child blir inte fallback', () => {
  // LP utan geo (suppressed). Child booking med geo finns men får inte vara primary.
  const lp = tgt('large_project', 'lp1', null, null, 'LP utan geo', {
    canBePrimaryWorkTarget: true, canBeGeoTarget: false, suppressedReason: 'large_project_missing_geo',
  });
  const child = tgt('booking', 'b1', 59.34, 18.06, 'Child booking', {
    parentLargeProjectId: 'lp1',
    canBePrimaryWorkTarget: false, canBeGeoTarget: false,
    suppressedReason: 'child_booking_inside_large_project',
  });
  const assignments = [{ bookingId: null, projectId: null, largeProjectId: 'lp1', belongsToLargeProject: true }];
  const r = buildLocationTruthFromDayEvidence(dayEv([lp, child], makePings(59.34, 18.06, 20), assignments));
  const seg = findSeg(r, 'known_address') ?? findSeg(r, 'needs_location_review');
  assert(seg, 'expected known_address eller needs_location_review');
  // Child får ALDRIG bli matchedTarget
  assert(seg!.matchedTarget?.targetId !== 'b1', 'child booking får inte bli fallback');
  const w = seg!.businessContext?.warnings ?? [];
  assert(w.some((x: string) => x.includes('large_project_missing_geo')), `missing LP-geo warning: ${w}`);
});

// ── 9. Planning mismatch ─────────────────────────────────────────────────

Deno.test('Lager 2.11G #9 — planering target A, GPS target B → GPS vinner + planning_geo_mismatch', () => {
  const wh = tgt('warehouse', 'wh1', 59.33, 18.07, 'Lager', { sourceTable: 'organization_locations' });
  const projA = tgt('project', 'pA', 59.50, 18.50, 'Långt bort');
  const r = buildLocationTruthFromDayEvidence(dayEv([wh, projA], makePings(59.33, 18.07), [
    { bookingId: null, projectId: 'pA', largeProjectId: null, belongsToLargeProject: false },
  ]));
  const seg = findSeg(r, 'known_target')!;
  assertEquals(seg.matchedTarget?.targetId, 'wh1', 'GPS-target ska vinna');
  assertEquals(seg.businessContext?.status, 'planning_geo_mismatch');
  const w = seg.businessContext?.warnings ?? [];
  assert(w.includes('planned_target_does_not_match_physical_location'));
});

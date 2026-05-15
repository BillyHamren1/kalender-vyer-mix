/**
 * Lager 1.13 — Suppliers/samarbetspartners som known targets.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildKnownTargetsEvidence } from './buildKnownTargetsEvidence.ts';

type Row = Record<string, unknown>;

function makeAdmin(tables: Record<string, Row[] | { error: string }>): any {
  return {
    from(table: string) {
      const t = tables[table];
      const builder: any = {
        _filter: () => builder,
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        in() { return builder; },
        // promise-like — sista await:
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

Deno.test('Lager 1.13 A: supplier med geo i raw → known target med hasCoordinates', async () => {
  const admin = makeAdmin({
    suppliers: [{
      id: 'sup-1',
      name: 'Bauhaus Sätra',
      address_line1: 'Ekgården 7',
      postal_code: '12745', city: 'Skärholmen', country: 'SE',
      is_active: true,
      raw: { latitude: 59.275, longitude: 17.910, radius_meters: 120 },
    }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const sup = r.items.find((i) => i.targetType === 'supplier');
  assert(sup, 'expected supplier item');
  assertEquals(sup!.targetId, 'sup-1');
  assertEquals(sup!.label, 'Bauhaus Sätra');
  assertEquals(sup!.hasCoordinates, true);
  assertEquals(sup!.hasRadius, true);
  assertEquals(sup!.canBeGeoTarget, true);
  assertEquals(sup!.canBePrimaryWorkTarget, true);
  assertEquals(sup!.suppressedReason, null);
  assertEquals(sup!.sourceTable, 'suppliers');
  assert(sup!.address?.includes('Ekgården 7'));
  assertEquals(r.diagnostics.supplierCount, 1);
  assertEquals(r.diagnostics.suppliersWithGeoCount, 1);
  assertEquals(r.diagnostics.suppliersMissingGeoCount, 0);
});

Deno.test('Lager 1.13 B: supplier utan geo → suppressed=missing_coordinates + dq.suppliersMissingCoordinates', async () => {
  const admin = makeAdmin({
    suppliers: [{
      id: 'sup-2', name: 'AB Foo', address_line1: 'Vägen 1', city: 'Sthlm',
      is_active: true, raw: {},
    }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const sup = r.items.find((i) => i.targetType === 'supplier')!;
  assertEquals(sup.hasCoordinates, false);
  assertEquals(sup.suppressedReason, 'missing_coordinates');
  assertEquals(sup.canBeGeoTarget, false);
  assertEquals(sup.canBePrimaryWorkTarget, false);
  assertEquals(r.diagnostics.suppliersMissingGeoCount, 1);
  assertEquals(r.dataQuality.suppliersMissingCoordinates.length, 1);
  assertEquals(r.dataQuality.suppliersMissingCoordinates[0].targetId, 'sup-2');
});

Deno.test('Lager 1.13 C: supplier med koordinater men utan radius → suppressed=missing_radius_and_polygon + dq.suppliersMissingRadius', async () => {
  const admin = makeAdmin({
    suppliers: [{
      id: 'sup-3', name: 'XYZ', is_active: true,
      raw: { lat: 59.3, lng: 18.0 },
    }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const sup = r.items.find((i) => i.targetType === 'supplier')!;
  assertEquals(sup.hasCoordinates, true);
  assertEquals(sup.hasRadius, false);
  assertEquals(sup.suppressedReason, 'missing_radius_and_polygon');
  assertEquals(sup.canBeGeoTarget, false);
  assertEquals(r.diagnostics.suppliersMissingRadiusCount, 1);
  assertEquals(r.dataQuality.suppliersMissingRadius.length, 1);
});

Deno.test('Lager 1.13 D: ingen supplier-tabell (error) → krasch ej, warning + supplierCount=0', async () => {
  const admin = makeAdmin({ suppliers: { error: 'relation "suppliers" does not exist' } });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 0);
  assert(r.diagnostics.warnings.some((w) => w.includes('supplier_table_not_found_or_not_configured')));
  assertEquals(r.items.filter((i) => i.targetType === 'supplier').length, 0);
});

Deno.test('Lager 1.13 E: supplier blandas inte med booking/project (egen targetType)', async () => {
  const admin = makeAdmin({
    suppliers: [{ id: 'sup-X', name: 'Hyrcenter', is_active: true, raw: { latitude: 59.0, longitude: 18.0, radius_meters: 100 } }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const sup = r.items.find((i) => i.targetId === 'sup-X')!;
  assertEquals(sup.targetType, 'supplier');
  assert(sup.targetType !== 'booking');
  assert(sup.targetType !== 'project');
  assert(sup.targetType !== 'large_project');
});

Deno.test('Lager 1.13 F: supplierExamples max 5', async () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: `sup-${i}`, name: `S${i}`, is_active: true, raw: {},
  }));
  const admin = makeAdmin({ suppliers: rows });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 8);
  assertEquals(r.diagnostics.supplierExamples.length, 5);
});

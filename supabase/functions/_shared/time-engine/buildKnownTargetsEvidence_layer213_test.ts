/**
 * Lager 2.13 — Säkra supplier target-source: org-scope + business_partners broad + geo-target separation.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildKnownTargetsEvidence } from './buildKnownTargetsEvidence.ts';

type Row = Record<string, unknown>;

/**
 * Mock som låtsas att en viss tabell BARA har vissa org-scope-kolumner.
 * `tables[name].orgScopeColumns` listar de kolumner som NOT errar.
 * .eq(col, val) filtrerar rader på den kolumnen om col finns i orgScopeColumns.
 * Annars returneras error "column <col> does not exist".
 */
function makeAdmin(tables: Record<string, {
  rows: Row[];
  orgScopeColumns?: string[]; // default ['organization_id']
}>): any {
  return {
    from(table: string) {
      const t = tables[table];
      let pendingError: string | null = null;
      let filtered: Row[] | null = null;
      const cols = t?.orgScopeColumns ?? ['organization_id'];
      const builder: any = {
        select() { return builder; },
        eq(col: string, val: unknown) {
          if (!t) return builder;
          if (!cols.includes(col)) {
            pendingError = `column "${col}" does not exist`;
            return builder;
          }
          filtered = (filtered ?? t.rows).filter((r) => r[col] === val);
          return builder;
        },
        is() { return builder; },
        in() { return builder; },
        then(resolve: (r: any) => void) {
          if (pendingError) return resolve({ data: null, error: { message: pendingError } });
          if (!t) return resolve({ data: [], error: null });
          resolve({ data: filtered ?? t.rows, error: null });
        },
      };
      return builder;
    },
  };
}

const ORG = '00000000-0000-0000-0000-000000000001';
const OTHER_ORG = '00000000-0000-0000-0000-000000000099';

Deno.test('Lager 2.13 A: tabell med organization_id filtreras på org', async () => {
  const admin = makeAdmin({
    suppliers: {
      orgScopeColumns: ['organization_id'],
      rows: [
        { id: 's-mine', organization_id: ORG, name: 'Mitt', raw: { latitude: 59.3, longitude: 18.0 } },
        { id: 's-other', organization_id: OTHER_ORG, name: 'Andras', raw: { latitude: 59.3, longitude: 18.0 } },
      ],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const supplierIds = r.items.filter((i) => i.targetType === 'supplier').map((i) => i.targetId);
  assertEquals(supplierIds, ['s-mine']);
  assert(r.diagnostics.supplierTablesUsed.includes('suppliers'));
});

Deno.test('Lager 2.13 B: tabell utan org-scope hoppas över', async () => {
  const admin = makeAdmin({
    suppliers: {
      orgScopeColumns: [], // ingen org-kolumn alls
      rows: [{ id: 's1', name: 'Global', raw: { latitude: 59.3, longitude: 18.0 } }],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 0);
  assert(r.diagnostics.supplierTablesSkippedMissingOrgScope.includes('suppliers'));
  assert(r.diagnostics.warnings.some((w) => w.startsWith('supplier_table_skipped_missing_org_scope:suppliers')));
});

Deno.test('Lager 2.13 C: business_partners utan supplier-marker skapas inte som supplier', async () => {
  const admin = makeAdmin({
    business_partners: {
      orgScopeColumns: ['organization_id'],
      rows: [
        { id: 'bp1', organization_id: ORG, name: 'Random partner', relation_type: 'customer' },
      ],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 0);
  assert(r.diagnostics.supplierTablesSkippedBecauseTooBroad.includes('business_partners'));
});

Deno.test('Lager 2.13 D: business_partners med is_supplier=true skapas som supplier', async () => {
  const admin = makeAdmin({
    business_partners: {
      orgScopeColumns: ['organization_id'],
      rows: [
        { id: 'bp1', organization_id: ORG, name: 'Hyrcenter', is_supplier: true,
          raw: { latitude: 59.3, longitude: 18.0 } },
      ],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 1);
  assertEquals(r.diagnostics.supplierTableUsed, 'business_partners');
  assert(r.diagnostics.supplierTablesUsed.includes('business_partners'));
});

Deno.test('Lager 2.13 E: supplier med geo → primary + geo target', async () => {
  const admin = makeAdmin({
    suppliers: {
      orgScopeColumns: ['organization_id'],
      rows: [{ id: 's1', organization_id: ORG, name: 'Bauhaus',
        raw: { latitude: 59.3, longitude: 18.0, radius_meters: 100 } }],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const sup = r.items.find((i) => i.targetType === 'supplier')!;
  assertEquals(sup.canBePrimaryWorkTarget, true);
  assertEquals(sup.canBeGeoTarget, true);
});

Deno.test('Lager 2.13 F: supplier utan geo → primary=true, geo=false, suppliersMissingCoordinates', async () => {
  const admin = makeAdmin({
    suppliers: {
      orgScopeColumns: ['organization_id'],
      rows: [{ id: 's1', organization_id: ORG, name: 'Bauhaus utan koordinater' }],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const sup = r.items.find((i) => i.targetType === 'supplier')!;
  assertEquals(sup.canBePrimaryWorkTarget, true);
  assertEquals(sup.canBeGeoTarget, false);
  assertEquals(r.dataQuality.suppliersMissingCoordinates.length, 1);
  assertEquals(r.diagnostics.suppliersMissingGeoCount, 1);
});

Deno.test('Lager 2.13 G: alternativ org-kolumn (tenant_id) accepteras', async () => {
  const admin = makeAdmin({
    suppliers: {
      orgScopeColumns: ['tenant_id'],
      rows: [{ id: 's1', tenant_id: ORG, name: 'Tenant-scoped',
        raw: { latitude: 59.3, longitude: 18.0 } }],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 1);
});

Deno.test('Lager 2.13 H: supplier-examples innehåller table+hasOrgScope+supplierMarkerFound', async () => {
  const admin = makeAdmin({
    suppliers: {
      orgScopeColumns: ['organization_id'],
      rows: [{ id: 's1', organization_id: ORG, name: 'Bauhaus',
        raw: { latitude: 59.3, longitude: 18.0 } }],
    },
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  const ex = r.diagnostics.supplierExamples[0];
  assertEquals(ex.table, 'suppliers');
  assertEquals(ex.hasOrgScope, true);
  assertEquals(ex.supplierMarkerFound, true); // narrow → trivially true
  assertEquals(ex.hasGeo, true);
});

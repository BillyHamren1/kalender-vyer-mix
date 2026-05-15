/**
 * Lager 2.12A — Säkra supplier-fetch så kunder/kontakter inte blir suppliers.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildKnownTargetsEvidence } from './buildKnownTargetsEvidence.ts';

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

Deno.test('Lager 2.12A: narrow tabell suppliers används normalt', async () => {
  const admin = makeAdmin({
    suppliers: [{
      id: 'sup-1', name: 'Bauhaus', is_active: true,
      raw: { latitude: 59.3, longitude: 18.0, radius_meters: 100 },
    }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 1);
  assertEquals(r.diagnostics.supplierTableUsed, 'suppliers');
  assertEquals(r.diagnostics.supplierTablesSkippedBecauseTooBroad.length, 0);
  assertEquals(r.diagnostics.supplierRowsSkippedNoSupplierMarker, 0);
});

Deno.test('Lager 2.12A: bred tabell contacts utan markörer hoppas över', async () => {
  const admin = makeAdmin({
    contacts: [
      { id: 'c1', name: 'Kalle Kund', type: 'customer' },
      { id: 'c2', name: 'Lisa Lead', category: 'lead' },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 0);
  assertEquals(r.diagnostics.supplierTableUsed, null);
  assert(r.diagnostics.supplierTablesSkippedBecauseTooBroad.includes('contacts'));
  assertEquals(r.diagnostics.supplierRowsSkippedNoSupplierMarker, 2);
  assert(r.diagnostics.supplierTableRequiresFilterWarnings.some((w) => w.includes('contacts')));
  assert(r.diagnostics.warnings.includes('no_safe_supplier_source_found'));
});

Deno.test('Lager 2.12A: bred tabell companies med supplier-markör accepteras, övriga filtreras', async () => {
  const admin = makeAdmin({
    companies: [
      { id: 'co1', name: 'Acme Kund', company_type: 'customer' },
      { id: 'co2', name: 'Hyrcenter', company_type: 'supplier',
        raw: { latitude: 59.3, longitude: 18.0, radius_meters: 120 } },
      { id: 'co3', name: 'Logistik AB', is_supplier: true,
        raw: { latitude: 59.31, longitude: 18.01 } },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 2);
  assertEquals(r.diagnostics.supplierTableUsed, 'companies');
  // 1 av 3 rader filtrerades bort
  assertEquals(r.diagnostics.supplierRowsSkippedNoSupplierMarker, 1);
  // Tabellen fanns med suppliers så den ska INTE listas i skipped
  assertEquals(r.diagnostics.supplierTablesSkippedBecauseTooBroad.length, 0);
  const ids = r.items.filter((i) => i.targetType === 'supplier').map((i) => i.targetId);
  assert(ids.includes('co2'));
  assert(ids.includes('co3'));
  assert(!ids.includes('co1'));
});

Deno.test('Lager 2.12A: ingen säker källa → no_safe_supplier_source_found, supplierCount=0', async () => {
  const admin = makeAdmin({
    contacts: [{ id: 'x', name: 'N', type: 'customer' }],
    companies: [{ id: 'y', name: 'M', company_type: 'customer' }],
    partners: [{ id: 'z', name: 'P', relation_type: 'lead' }],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 0);
  assert(r.diagnostics.warnings.includes('no_safe_supplier_source_found'));
  assertEquals(r.diagnostics.supplierTablesSkippedBecauseTooBroad.length, 3);
});

Deno.test('Lager 2.12A: partners med metadata.is_supplier accepteras', async () => {
  const admin = makeAdmin({
    partners: [
      { id: 'p1', name: 'Foo', metadata: { is_supplier: true },
        raw: { latitude: 59.3, longitude: 18.0 } },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: admin, organizationId: ORG, staffId: 's1', date: '2026-05-13',
  });
  assertEquals(r.diagnostics.supplierCount, 1);
  assertEquals(r.diagnostics.supplierTableUsed, 'partners');
});

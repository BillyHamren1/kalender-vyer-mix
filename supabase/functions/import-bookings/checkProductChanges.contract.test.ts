// Deno test: verifies checkProductChanges detects price/notes/vat edits,
// not just add/remove/quantity, and preserves the transient-empty guard.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkProductChanges } from './index.ts';

// Minimal in-memory supabase stub — only implements what checkProductChanges uses.
function makeSupabaseStub(existing: any[]) {
  return {
    from(table: string) {
      if (table === 'booking_products') {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: string) {
                return Promise.resolve({ data: existing, error: null });
              },
            };
          },
        };
      }
      if (table === 'sync_audit_log') {
        return { insert: (_row: any) => Promise.resolve({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const baseExisting = [
  { id: 'p1', name: 'Tent 6x6', quantity: 1, unit_price: 1000, total_price: 1000, notes: 'nope', sku: 'A1', vat_rate: 25, discount: 0, tags: [] },
];

Deno.test('price-only change → changed=true', async () => {
  const s = makeSupabaseStub(baseExisting);
  const res = await checkProductChanges(s as any, 'b1', [
    { name: 'Tent 6x6', quantity: 1, unit_price: 1500 },
  ]);
  assert(res.changed, 'expected changed=true for price change');
  assertEquals(res.updated.length, 1);
});

Deno.test('notes-only change → changed=true', async () => {
  const s = makeSupabaseStub(baseExisting);
  const res = await checkProductChanges(s as any, 'b1', [
    { name: 'Tent 6x6', quantity: 1, unit_price: 1000, notes: 'REVIDERAT' },
  ]);
  assert(res.changed);
});

Deno.test('vat_rate-only change → changed=true', async () => {
  const s = makeSupabaseStub(baseExisting);
  const res = await checkProductChanges(s as any, 'b1', [
    { name: 'Tent 6x6', quantity: 1, unit_price: 1000, vat_rate: 12 },
  ]);
  assert(res.changed);
});

Deno.test('identical products → changed=false', async () => {
  const s = makeSupabaseStub(baseExisting);
  const res = await checkProductChanges(s as any, 'b1', [
    { name: 'Tent 6x6', quantity: 1, unit_price: 1000, notes: 'nope', sku: 'A1' },
  ]);
  assertEquals(res.changed, false);
});

Deno.test('empty external + local rows → changed=false (guard held)', async () => {
  const s = makeSupabaseStub(baseExisting);
  const res = await checkProductChanges(s as any, 'b1', []);
  assertEquals(res.changed, false);
  assertEquals(res.added.length, 0);
  assertEquals(res.removed.length, 0);
});

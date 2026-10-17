import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isCacheableBatch, writeEconomyCache } from './economyCache.ts';

Deno.test('sparar inte svar med upstream-fel eller utan produktkostnad', () => {
  assertEquals(isCacheableBatch({ product_costs: {} }), true);
  assertEquals(isCacheableBatch({ product_costs: {}, _errors: { budget: { code: 'x' } } }), false);
  assertEquals(isCacheableBatch({ product_costs: null }), false);
});

Deno.test('skriver bara kompletta rader, med organisation', async () => {
  let written: any[] = [];
  const db = { from: () => ({ upsert: (rows: any[]) => { written = rows; return Promise.resolve({ error: null }); } }) };
  await writeEconomyCache(db, 'org-1', { a: { product_costs: {} }, b: { product_costs: null } });
  assertEquals(written.map((r) => [r.booking_id, r.organization_id]), [['a', 'org-1']]);
});

import { invalidateEconomyCache, isCacheableBatch, writeEconomyCache } from './economyCache.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

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

Deno.test('invaliderar bara angivna bokningar inom rätt organisation', async () => {
  const calls: unknown[][] = [];
  const query: any = {
    delete: () => query,
    eq: (column: string, value: string) => { calls.push(['eq', column, value]); return query; },
    in: (column: string, values: string[]) => {
      calls.push(['in', column, values]);
      return Promise.resolve({ error: null });
    },
  };
  const db = { from: (table: string) => { calls.push(['from', table]); return query; } };

  await invalidateEconomyCache(db, 'org-1', ['booking-a', 'booking-a', 'booking-b']);

  assertEquals(calls, [
    ['from', 'economy_cache'],
    ['eq', 'organization_id', 'org-1'],
    ['in', 'booking_id', ['booking-a', 'booking-b']],
  ]);
});

Deno.test('misslyckad cacheinvalidering stoppar refreshen', async () => {
  const query: any = {
    delete: () => query,
    eq: () => query,
    in: () => Promise.resolve({ error: new Error('database unavailable') }),
  };
  const db = { from: () => query };

  let threw = false;
  try {
    await invalidateEconomyCache(db, 'org-1', ['booking-a']);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

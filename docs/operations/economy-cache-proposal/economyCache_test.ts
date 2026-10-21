import { claimEconomyCacheRefresh, isCacheableBatch, writeEconomyCacheIfCurrent, refreshEconomyCache } from './economyCache.ts';

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

Deno.test('claimar unika bokningar med organisation och returnerar generationer', async () => {
  const calls: unknown[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      return { data: [
        { booking_id: 'booking-a', generation: 4 },
        { booking_id: 'booking-b', generation: 8 },
      ], error: null };
    },
  };

  const generations = await claimEconomyCacheRefresh(db, 'org-1', ['booking-b', 'booking-a', 'booking-b']);

  assertEquals(generations, { 'booking-a': 4, 'booking-b': 8 });
  assertEquals(calls, [[
    'claim_economy_cache_refresh',
    { p_organization_id: 'org-1', p_booking_ids: ['booking-a', 'booking-b'] },
  ]]);
});

Deno.test('failed older claim never deletes the latest cached value', async () => {
  const latest = { product_costs: { costs: 250 } };
  let value = latest;
  const db = {
    rpc: async () => ({ data: null, error: new Error('timeout') }),
    from: () => { value = { product_costs: { costs: 0 } }; throw new Error('unsafe delete'); },
  };
  let failed = false;
  try { await claimEconomyCacheRefresh(db, 'org-a', ['booking-a']); } catch { failed = true; }
  assertEquals(failed, true);
  assertEquals(value, latest);
});

Deno.test('en långsam äldre refresh kan inte skriva över en senare uppdatering', async () => {
  let currentGeneration = 0;
  let cachedData: Record<string, unknown> | null = null;
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'claim_economy_cache_refresh') {
        currentGeneration += 1;
        cachedData = null;
        return {
          data: [{ booking_id: 'booking-a', generation: currentGeneration }],
          error: null,
        };
      }
      if (fn === 'write_economy_cache_if_current') {
        if (args.p_generation !== currentGeneration) return { data: false, error: null };
        cachedData = args.p_data as Record<string, unknown>;
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${fn}`);
    },
  };
  const oldGeneration = await claimEconomyCacheRefresh(db, 'org-1', ['booking-a']);
  const latestGeneration = await claimEconomyCacheRefresh(db, 'org-1', ['booking-a']);
  const oldPayload = { product_costs: { costs: 100 } };
  const latestPayload = { product_costs: { costs: 250 } };

  // The newer request finishes first; the older upstream response arrives last.
  const latestWrite = await writeEconomyCacheIfCurrent(db, 'org-1', 'booking-a', latestGeneration['booking-a'], latestPayload);
  const oldWrite = await writeEconomyCacheIfCurrent(db, 'org-1', 'booking-a', oldGeneration['booking-a'], oldPayload);

  assertEquals(latestWrite, true);
  assertEquals(oldWrite, false);
  assertEquals(cachedData, latestPayload);
});

Deno.test('tenant-scoped write failure propagates to caller', async () => {
  const db = { rpc: async () => ({ data: null, error: new Error('tenant conflict') }) };
  let threw = false;
  try {
    await writeEconomyCacheIfCurrent(db, 'org-1', 'booking-a', 2, { product_costs: {} });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test('superseded refresh cannot return its obsolete fetched amounts', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ summary: { costs: 100 } }));
  try {
    const db = {
      rpc: async (name: string) => name === 'claim_economy_cache_refresh'
        ? { data: [{ booking_id: 'booking-a', generation: 1 }], error: null }
        : { data: false, error: null },
    };
    let message = '';
    try { await refreshEconomyCache(db, 'url', 'key', 'org-a', ['booking-a']); } catch (e) { message = (e as Error).message; }
    assertEquals(message, 'economy_refresh_superseded:retryable');
  } finally { globalThis.fetch = original; }
});

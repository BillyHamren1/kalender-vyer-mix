import { claimEconomyCacheRefresh, isCacheableBatch, writeEconomyCacheIfCurrent } from './economyCache.ts';

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
      return { data: [{ booking_id: 'booking-a', generation: 4 }], error: null };
    },
  };

  const generations = await claimEconomyCacheRefresh(db, 'org-1', ['booking-a', 'booking-a']);

  assertEquals(generations, { 'booking-a': 4 });
  assertEquals(calls, [[
    'claim_economy_cache_refresh',
    { p_organization_id: 'org-1', p_booking_ids: ['booking-a'] },
  ]]);
});

Deno.test('claim-fel rensar bara cacheposter i samma organisation innan felet kastas', async () => {
  const calls: unknown[] = [];
  const query: any = {
    delete: () => query,
    eq: (column: string, value: string) => { calls.push(['eq', column, value]); return query; },
    in: async (column: string, values: string[]) => {
      calls.push(['in', column, values]);
      return { error: null };
    },
  };
  const db = {
    rpc: async () => ({ data: null, error: new Error('database unavailable') }),
    from: (table: string) => { calls.push(['from', table]); return query; },
  };
  let threw = false;
  try {
    await claimEconomyCacheRefresh(db, 'org-1', ['booking-a']);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(calls, [
    ['from', 'economy_cache'],
    ['eq', 'organization_id', 'org-1'],
    ['in', 'booking_id', ['booking-a']],
  ]);
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

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ensureActivePackingNotEmpty } from './emptyPackingSafetyNet.ts';

const BOOKING_ID = 'booking-1';
const ORG_ID = 'org-1';
const PACKING_ID = 'packing-1';

type TableBehavior =
  | { kind: 'maybeSingle'; data: unknown; error?: { message: string } }
  | { kind: 'count'; count: number | null; error?: { message: string } };

/** Kedjebar mock av Supabase-querybyggaren som loggar alla anrop. */
function makeMockSupabase(behaviors: Record<string, TableBehavior>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const supabase = {
    calls,
    from(table: string) {
      const behavior = behaviors[table];
      if (!behavior) throw new Error(`unexpected table: ${table}`);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return builder;
        };
      }
      // Dessa muterande metoder ska ALDRIG anropas på denna väg.
      for (const m of ['delete', 'update', 'insert', 'upsert']) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          throw new Error(`forbidden mutation ${m} on ${table}`);
        };
      }
      builder.maybeSingle = () => {
        calls.push({ table, method: 'maybeSingle', args: [] });
        if (behavior.kind !== 'maybeSingle') throw new Error('maybeSingle on count behavior');
        return Promise.resolve({ data: behavior.data, error: behavior.error ?? null });
      };
      // Thenable för count/head-frågan (await av kedjan).
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        calls.push({ table, method: 'await', args: [] });
        if (behavior.kind !== 'count') return reject(new Error('await on maybeSingle behavior'));
        return Promise.resolve({ data: null, count: behavior.count, error: behavior.error ?? null }).then(resolve, reject);
      };
      return builder;
    },
  };
  return supabase;
}

function repairOk() {
  const calls: unknown[][] = [];
  return {
    calls,
    fn: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve({ ok: true as const, inserted: 17, total: 17, source: 'wms' });
    },
  };
}

function repairFail() {
  const calls: unknown[][] = [];
  return {
    calls,
    fn: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve({ ok: false as const, code: 'wms_reservation_not_found', error: 'Ingen reservation' });
    },
  };
}

function noMutations(supabase: ReturnType<typeof makeMockSupabase>) {
  const mutations = supabase.calls.filter((c) => ['delete', 'update', 'insert', 'upsert'].includes(c.method));
  assertEquals(mutations, [], 'inga delete/update/insert/upsert får finnas på safety-net-vägen');
}

Deno.test('nonempty packing => no-op, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'planning' } },
    packing_list_items: { kind: 'count', count: 5 },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res, { kind: 'noop', reason: 'nonempty', packingId: PACKING_ID, count: 5 });
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('exakt 0 rader => repairPackingItems anropas med rätt packing+org', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'in_progress' } },
    packing_list_items: { kind: 'count', count: 0 },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res, { kind: 'repaired', packingId: PACKING_ID, inserted: 17, total: 17, source: 'wms' });
  assertEquals(repair.calls.length, 1);
  assertEquals(repair.calls[0][1], PACKING_ID);
  assertEquals(repair.calls[0][2], ORG_ID);
  noMutations(supabase);
});

Deno.test('läsfel på packing_projects => fail-closed, aldrig tolkat som noll', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: null, error: { message: 'db down' } },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res.kind, 'failed');
  if (res.kind === 'failed') {
    assertEquals(res.code, 'packing_project_read_failed');
    assertStringIncludes(res.error, 'db down');
  }
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('läsfel på radantalet => fail-closed, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'planning' } },
    packing_list_items: { kind: 'count', count: null, error: { message: 'permission denied' } },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res.kind, 'failed');
  if (res.kind === 'failed') {
    assertEquals(res.code, 'packing_row_count_failed');
    assertStringIncludes(res.error, 'permission denied');
  }
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('repair-misslyckande => failed med stabilt prefixat fel, inga mutationer', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'planning' } },
    packing_list_items: { kind: 'count', count: 0 },
  });
  const repair = repairFail();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res.kind, 'failed');
  if (res.kind === 'failed') {
    assertEquals(res.code, 'packing_repair_failed:wms_reservation_not_found');
  }
  noMutations(supabase);
});

Deno.test('inaktiv packing-status => no-op, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'completed' } },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res, { kind: 'noop', reason: 'inactive_status', packingId: PACKING_ID, status: 'completed' });
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('ingen packing => no-op, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: null },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res, { kind: 'noop', reason: 'no_packing_project', packingId: null });
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('uppslagningen är exakt scopad på booking_id + organization_id', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: null },
  });
  await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repairOk().fn as never });
  const eqCalls = supabase.calls.filter((c) => c.table === 'packing_projects' && c.method === 'eq');
  assertEquals(eqCalls, [
    { table: 'packing_projects', method: 'eq', args: ['booking_id', BOOKING_ID] },
    { table: 'packing_projects', method: 'eq', args: ['organization_id', ORG_ID] },
  ]);
  noMutations(supabase);
});

Deno.test('null count utan fel => fail-closed, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'planning' } },
    packing_list_items: { kind: 'count', count: null },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res.kind, 'failed');
  if (res.kind === 'failed') {
    assertEquals(res.code, 'packing_row_count_invalid');
  }
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('ogiltigt radantal: NaN => fail-closed, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'planning' } },
    packing_list_items: { kind: 'count', count: NaN },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res.kind, 'failed');
  if (res.kind === 'failed') {
    assertEquals(res.code, 'packing_row_count_invalid');
  }
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('ogiltigt radantal: negativt => fail-closed, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'planning' } },
    packing_list_items: { kind: 'count', count: -3 },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res.kind, 'failed');
  if (res.kind === 'failed') {
    assertEquals(res.code, 'packing_row_count_invalid');
  }
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

Deno.test('ogiltigt radantal: decimaltal => fail-closed, repair anropas inte', async () => {
  const supabase = makeMockSupabase({
    packing_projects: { kind: 'maybeSingle', data: { id: PACKING_ID, status: 'planning' } },
    packing_list_items: { kind: 'count', count: 1.5 },
  });
  const repair = repairOk();
  const res = await ensureActivePackingNotEmpty(supabase, BOOKING_ID, ORG_ID, { repairPackingItems: repair.fn as never });
  assertEquals(res.kind, 'failed');
  if (res.kind === 'failed') {
    assertEquals(res.code, 'packing_row_count_invalid');
  }
  assertEquals(repair.calls.length, 0);
  noMutations(supabase);
});

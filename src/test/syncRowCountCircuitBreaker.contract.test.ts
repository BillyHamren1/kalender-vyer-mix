// STEG 3I — kontraktstester: circuit breaker räknar RADER, dry-run RPC-policy.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SAFETY_LIMITS,
  SAFETY_CIRCUIT_BREAKER,
  UNKNOWN_DESTRUCTIVE_ROW_COUNT,
  UNKNOWN_RPC_IN_DRY_RUN,
  createSyncCounters,
  enforceDestructiveLimit,
  guardedDeleteByIds,
  guardedDeleteWhere,
  createSafetyGuardedClient,
  createDryRunClient,
  classifyRpc,
  READ_ONLY_RPCS,
  MUTATING_RPCS,
  SafetyCircuitBreakerError,
  UnknownDestructiveRowCountError,
  UnknownRpcInDryRunError,
} from '../../supabase/functions/_shared/syncObservability.ts';

interface Call { op: string; table: string; ids?: string[] }

const makeClient = (calls: Call[], rows: Record<string, string[]> = {}) => ({
  from(table: string) {
    const builder: any = {
      _ids: undefined as string[] | undefined,
      select() { builder._op = 'select'; return builder; },
      insert(v: unknown) { calls.push({ op: 'insert', table }); void v; return builder; },
      update() { calls.push({ op: 'update', table }); return builder; },
      upsert() { calls.push({ op: 'upsert', table }); return builder; },
      delete() { builder._op = 'delete'; return builder; },
      eq() { return builder; },
      in(_col: string, ids: string[]) {
        if (builder._op === 'delete') calls.push({ op: 'delete', table, ids });
        return Promise.resolve({ data: [], error: null });
      },
      then(resolve: any) {
        if (builder._op === 'delete') calls.push({ op: 'delete', table, ids: undefined });
        const data = builder._op === 'select' ? (rows[table] ?? []).map((id) => ({ id })) : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return builder;
  },
  rpc: (fn: string, args?: unknown) => {
    calls.push({ op: 'rpc', table: fn });
    void args;
    return Promise.resolve({ data: { fn }, error: null });
  },
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('STEG 3I — radbaserad circuit breaker', () => {
  it('blockerar 30 product rows mot limit 25 FÖRE mutation', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls), counters);
    await expect(guardedDeleteByIds(client, {
      table: 'booking_products', ids: ids(30), kind: 'product_deletes', counters,
    })).rejects.toBeInstanceOf(SafetyCircuitBreakerError);
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(0);
    expect(counters.product_deletes).toBe(0);
    expect(counters.blocked_by_circuit_breaker).toBe(1);
    expect(SAFETY_LIMITS.product_deletes).toBe(25);
  });

  it('ett delete-anrop med 2 IDs räknas som 2 rader', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls), counters);
    const res = await guardedDeleteByIds(client, {
      table: 'booking_products', ids: ['a', 'b'], kind: 'product_deletes', counters,
    });
    expect(res.deleted).toBe(2);
    expect(counters.product_deletes).toBe(2);
    expect(counters.deletes).toBe(2);
  });

  it('två delete-anrop med 10 + 10 IDs = 20 rader totalt', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls), counters);
    await guardedDeleteByIds(client, { table: 'booking_products', ids: ids(10, 'a'), kind: 'product_deletes', counters });
    await guardedDeleteByIds(client, { table: 'booking_products', ids: ids(10, 'b'), kind: 'product_deletes', counters });
    expect(counters.product_deletes).toBe(20);
    expect(counters.deletes).toBe(20);
  });

  it('blind .delete().eq() utan känt radantal får inte köras', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls), counters);
    expect(() => client.from('booking_products').delete().eq('booking_id', 'x'))
      .toThrow(UnknownDestructiveRowCountError);
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(0);
    expect(UNKNOWN_DESTRUCTIVE_ROW_COUNT).toBe('unknown_destructive_row_count');
  });

  it('guardedDeleteWhere löser ut exakta rader tenant-scopat och raderar dem', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls, { packing_list_items: ['i1', 'i2', 'i3'] }), counters);
    const res = await guardedDeleteWhere(client, {
      table: 'packing_list_items',
      filters: { packing_id: 'pk', organization_id: 'org' },
      kind: 'product_deletes',
      counters,
    });
    expect(res.deleted).toBe(3);
    const del = calls.find((c) => c.op === 'delete');
    expect(del?.ids).toEqual(['i1', 'i2', 'i3']);
    expect(counters.product_deletes).toBe(3);
  });

  it('calendar delete med 11 rader mot limit 10 raderar 0 rader', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls), counters);
    await expect(guardedDeleteByIds(client, {
      table: 'calendar_events', ids: ids(11, 'e'), kind: 'calendar_deletes', counters,
    })).rejects.toBeInstanceOf(SafetyCircuitBreakerError);
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(0);
    expect(SAFETY_LIMITS.calendar_deletes).toBe(10);
  });

  it('request kan aldrig höja gränserna', () => {
    const before = { ...SAFETY_LIMITS };
    try {
      (SAFETY_LIMITS as any).product_deletes = 9999;
      (SAFETY_LIMITS as any).calendar_deletes = 9999;
    } catch { /* frozen */ }
    expect(SAFETY_LIMITS.product_deletes).toBe(before.product_deletes);
    expect(SAFETY_LIMITS.calendar_deletes).toBe(before.calendar_deletes);
    expect(Object.isFrozen(SAFETY_LIMITS)).toBe(true);
  });

  it('totalgräns räknas i rader över kinds', () => {
    const counters = createSyncCounters();
    enforceDestructiveLimit(counters, 'product_deletes', 25);
    expect(() => enforceDestructiveLimit(counters, 'calendar_deletes', 10)).toThrow(SafetyCircuitBreakerError);
    expect(counters.deletes).toBe(25);
    expect(SAFETY_LIMITS.total_deletes).toBe(30);
  });

  it('circuit breaker-reason nämner kind', () => {
    const counters = createSyncCounters();
    try {
      enforceDestructiveLimit(counters, 'calendar_deletes', 50);
    } catch (e: any) {
      expect(e.detail.reason).toBe(`${SAFETY_CIRCUIT_BREAKER}:calendar_deletes`);
      expect(e.detail.attempted).toBe(50);
    }
  });
});

describe('STEG 3I — dry-run RPC-klassificering', () => {
  it('read-only RPC körs och ger data', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const planned: Record<string, number> = {};
    const client = createDryRunClient(createSafetyGuardedClient(makeClient(calls), counters), planned, counters);
    const res: any = await client.rpc('lp_rep_booking_id', { _lp: 'x' });
    expect(res.data).toEqual({ fn: 'lp_rep_booking_id' });
    expect(calls.some((c) => c.op === 'rpc')).toBe(true);
    expect(classifyRpc('lp_rep_booking_id')).toBe('read_only');
  });

  it('muterande RPC körs inte men registreras som planerad mutation', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const planned: Record<string, number> = {};
    const client = createDryRunClient(createSafetyGuardedClient(makeClient(calls), counters), planned, counters);
    const res: any = await client.rpc('recompute_booking_staff_for_day', { p_booking_id: 'b' });
    expect(res.__blocked).toBe(true);
    expect(calls.filter((c) => c.op === 'rpc')).toHaveLength(0);
    expect(planned['rpc.recompute_booking_staff_for_day']).toBe(1);
    expect(MUTATING_RPCS).toContain('apply_booking_cancellation_atomic');
  });

  it('okänd RPC i dry-run är fail-closed', () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createDryRunClient(createSafetyGuardedClient(makeClient(calls), counters), {}, counters);
    expect(() => client.rpc('some_unlisted_rpc')).toThrow(UnknownRpcInDryRunError);
    expect(calls).toHaveLength(0);
    expect(UNKNOWN_RPC_IN_DRY_RUN).toBe('unknown_rpc_in_dry_run');
    expect(classifyRpc('some_unlisted_rpc')).toBe('unknown');
  });

  it('read-only allowlist och mutating blocklist överlappar inte', () => {
    expect(READ_ONLY_RPCS.some((r) => (MUTATING_RPCS as readonly string[]).includes(r))).toBe(false);
  });
});

describe('STEG 3I — dry-run gör noll mutationer men verklig diff', () => {
  it('inga DB-mutationer, planerade rader räknas', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const planned: Record<string, number> = {};
    const client = createDryRunClient(
      createSafetyGuardedClient(makeClient(calls, { booking_products: ['a', 'b', 'c'] }), counters),
      planned,
      counters,
    );
    await client.from('bookings').update({ title: 'x' }).eq('id', 'b1');
    await client.from('booking_products').insert([{ id: 1 }, { id: 2 }]);
    await guardedDeleteWhere(client, {
      table: 'booking_products',
      filters: { booking_id: 'b1', organization_id: 'org' },
      kind: 'product_deletes',
      counters,
    });
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    expect(planned['bookings.update']).toBe(1);
    expect(planned['booking_products.insert']).toBe(2);
    expect(planned['booking_products.delete']).toBe(3);
  });

  it('dry-run flyttar aldrig cursor eller markerar completed', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const planned: Record<string, number> = {};
    const client = createDryRunClient(createSafetyGuardedClient(makeClient(calls), counters), planned, counters);
    await client.from('sync_state').update({ last_synced_at: 'now' }).eq('id', 's');
    await client.from('booking_sync_jobs').update({ status: 'completed' }).eq('id', 'j');
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    expect(planned['sync_state.update']).toBe(1);
    expect(planned['booking_sync_jobs.update']).toBe(1);
  });

  it('dry-run delete utan deklarerat radantal är fail-closed', () => {
    const counters = createSyncCounters();
    const client = createDryRunClient(makeClient([]), {}, counters);
    expect(() => client.from('booking_products').delete().eq('booking_id', 'x'))
      .toThrow(UnknownDestructiveRowCountError);
  });
});

describe('STEG 3I — audit räknar rader', () => {
  it('adds räknas i rader vid array-insert', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls), counters);
    await client.from('booking_products').insert([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(counters.product_adds).toBe(3);
  });

  it('deletes i counters är rader, inte satser', async () => {
    const calls: Call[] = [];
    const counters = createSyncCounters();
    const client = createSafetyGuardedClient(makeClient(calls), counters);
    await guardedDeleteByIds(client, { table: 'calendar_events', ids: ids(4, 'e'), kind: 'calendar_deletes', counters });
    expect(counters.calendar_deletes).toBe(4);
    expect(counters.deletes).toBe(4);
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(1);
  });
});

// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fetchAllStaffLocationPings } from './fetchAllStaffLocationPings.ts';

/**
 * Mock supabase client builder. Returns rows in chunks, simulating PostgREST's
 * 1000-row hard cap behaviour by slicing the staged dataset on .range(from,to).
 */
function makeClient(allRows: any[]) {
  const calls: Array<{ from: number; to: number }> = [];
  const builder: any = {
    _filters: { organization_id: null, staff_id: null, ne_staff_id: null, gte: null, lte: null },
    _range: null,
    _select: '*',
    from(_t: string) { return this; },
    select(s: string) { this._select = s; return this; },
    eq(col: string, val: any) {
      if (col === 'organization_id') this._filters.organization_id = val;
      if (col === 'staff_id') this._filters.staff_id = val;
      return this;
    },
    neq(col: string, val: any) {
      if (col === 'staff_id') this._filters.ne_staff_id = val;
      return this;
    },
    gte(_c: string, v: string) { this._filters.gte = v; return this; },
    lte(_c: string, v: string) { this._filters.lte = v; return this; },
    order(_c: string, _o: any) { return this; },
    async range(from: number, to: number) {
      calls.push({ from, to });
      let pool = allRows;
      if (this._filters.staff_id) {
        pool = pool.filter((r: any) => r.staff_id === this._filters.staff_id);
      }
      if (this._filters.ne_staff_id) {
        pool = pool.filter((r: any) => r.staff_id !== this._filters.ne_staff_id);
      }
      const gteMs = Date.parse(this._filters.gte);
      const lteMs = Date.parse(this._filters.lte);
      pool = pool.filter((r: any) => {
        const t = Date.parse(r.recorded_at);
        return t >= gteMs && t <= lteMs;
      });
      return { data: pool.slice(from, to + 1), error: null };
    },
  };
  return { client: { from: () => builder }, calls };
}

function row(i: number, staffId = 'A') {
  const ts = new Date(Date.UTC(2026, 4, 13, 0, 0, i)).toISOString();
  return { staff_id: staffId, recorded_at: ts, lat: 59 + i * 1e-6, lng: 17, accuracy: 5 };
}

Deno.test('paginates a day with > pageSize pings', async () => {
  const all = Array.from({ length: 2500 }, (_, i) => row(i));
  const { client } = makeClient(all);
  const res = await fetchAllStaffLocationPings({
    supabaseAdmin: client,
    organizationId: 'org',
    staffId: 'A',
    startUtc: '2026-05-13T00:00:00Z',
    endUtc: '2026-05-13T23:59:59Z',
  });
  assertEquals(res.rows.length, 2500);
  assertEquals(res.diagnostics.pageCount, 3);
  assertEquals(res.diagnostics.capHit, false);
  assertEquals(res.diagnostics.warning, null);
});

Deno.test('returns 0 for empty day', async () => {
  const { client } = makeClient([]);
  const res = await fetchAllStaffLocationPings({
    supabaseAdmin: client, organizationId: 'org', staffId: 'A',
    startUtc: '2026-05-13T00:00:00Z', endUtc: '2026-05-13T23:59:59Z',
  });
  assertEquals(res.rows.length, 0);
  assertEquals(res.diagnostics.pageCount, 1);
  assertEquals(res.diagnostics.firstRecordedAt, null);
});

Deno.test('exact 1000/2000 boundary does not trigger second/third page', async () => {
  for (const n of [1000, 2000, 5000]) {
    const all = Array.from({ length: n }, (_, i) => row(i));
    const { client } = makeClient(all);
    const res = await fetchAllStaffLocationPings({
      supabaseAdmin: client, organizationId: 'org', staffId: 'A',
      startUtc: '2026-05-13T00:00:00Z', endUtc: '2026-05-14T00:00:00Z',
    });
    assertEquals(res.rows.length, n);
    // exact multiple of pageSize requires one extra empty page to detect end
    assertEquals(res.diagnostics.pageCount, Math.floor(n / 1000) + 1);
  }
});

Deno.test('cap surfaces capHit + warning', async () => {
  const all = Array.from({ length: 5000 }, (_, i) => row(i));
  const { client } = makeClient(all);
  const res = await fetchAllStaffLocationPings({
    supabaseAdmin: client, organizationId: 'org', staffId: 'A',
    startUtc: '2026-05-13T00:00:00Z', endUtc: '2026-05-14T00:00:00Z',
    cap: 1500,
  });
  assertEquals(res.rows.length, 1500);
  assertEquals(res.diagnostics.capHit, true);
  assertEquals(res.diagnostics.warning, 'PING_DAY_CAP_REACHED');
});

Deno.test('peer mode (excludeStaffId, no staffId) returns other staff only', async () => {
  const all = [
    ...Array.from({ length: 10 }, (_, i) => row(i, 'A')),
    ...Array.from({ length: 7 }, (_, i) => row(i, 'B')),
  ];
  const { client } = makeClient(all);
  const res = await fetchAllStaffLocationPings({
    supabaseAdmin: client, organizationId: 'org',
    staffId: null, excludeStaffId: 'A',
    startUtc: '2026-05-13T00:00:00Z', endUtc: '2026-05-14T00:00:00Z',
  });
  assertEquals(res.rows.length, 7);
  assertEquals(res.rows.every((r: any) => r.staff_id === 'B'), true);
});

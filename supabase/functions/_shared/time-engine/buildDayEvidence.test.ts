// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildDayEvidence } from './buildDayEvidence.ts';

function makeClient(allRows: any[]) {
  const builder: any = {
    _filters: { staff_id: null, ne_staff_id: null, gte: null, lte: null },
    from(_t: string) { return this; },
    select(_s: string) { return this; },
    eq(col: string, val: any) {
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
      let pool = allRows;
      if (this._filters.staff_id) pool = pool.filter((r: any) => r.staff_id === this._filters.staff_id);
      const gteMs = Date.parse(this._filters.gte);
      const lteMs = Date.parse(this._filters.lte);
      pool = pool.filter((r: any) => {
        const t = Date.parse(r.recorded_at);
        return t >= gteMs && t <= lteMs;
      });
      return { data: pool.slice(from, to + 1), error: null };
    },
  };
  return { from: () => builder };
}

function row(i: number) {
  const ts = new Date(Date.UTC(2026, 4, 13, 0, 0, i)).toISOString();
  return { staff_id: 'A', recorded_at: ts, lat: 59 + i * 1e-6, lng: 17, accuracy: 5 };
}

Deno.test('buildDayEvidence: 0 pings → empty gps + diagnostics present', async () => {
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient([]),
    organizationId: 'org',
    staffId: 'A',
    date: '2026-05-13',
  });
  assertEquals(ev.gps.pingCount, 0);
  assertEquals(ev.dataQuality.gpsAvailable, false);
  assert(ev.diagnostics.gpsFetchDiagnostics !== null);
  assertEquals(ev.diagnostics.gpsFetchDiagnostics.totalFetched, 0);
  assertEquals(ev.diagnostics.gpsFetchDiagnostics.capHit, false);
});

Deno.test('buildDayEvidence: > 1000 pings → paginated, first/last set, gpsFetchDiagnostics counts pages', async () => {
  const all = Array.from({ length: 1500 }, (_, i) => row(i));
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient(all),
    organizationId: 'org',
    staffId: 'A',
    date: '2026-05-13',
  });
  assertEquals(ev.gps.pingCount, 1500);
  assertEquals(ev.dataQuality.gpsAvailable, true);
  assertEquals(ev.diagnostics.counts.pings, 1500);
  assert(ev.diagnostics.gpsFetchDiagnostics !== null);
  assert(ev.diagnostics.gpsFetchDiagnostics.pageCount >= 2);
  assertEquals(ev.diagnostics.gpsFetchDiagnostics.totalFetched, 1500);
  assertEquals(ev.gps.firstPingAt, all[0].recorded_at);
  assertEquals(ev.gps.lastPingAt, all[1499].recorded_at);
});

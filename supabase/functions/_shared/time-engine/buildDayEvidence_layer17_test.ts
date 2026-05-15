// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildDayEvidence } from './buildDayEvidence.ts';

function makeClient(allRows: any[]) {
  const builder: any = {
    _filters: { staff_id: null, gte: null, lte: null },
    from(_t: string) { return this; },
    select(_s: string) { return this; },
    eq(col: string, val: any) {
      if (col === 'staff_id') this._filters.staff_id = val;
      return this;
    },
    neq() { return this; },
    gte(_c: string, v: string) { this._filters.gte = v; return this; },
    lte(_c: string, v: string) { this._filters.lte = v; return this; },
    order() { return this; },
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

const DATE = '2026-05-13';
function ts(hour: number, min = 0, sec = 0) {
  // UTC; för Stockholm sommartid (UTC+2): UTC 19:00 = lokal 21:00.
  return new Date(Date.UTC(2026, 4, 13, hour, min, sec)).toISOString();
}
function ping(opts: { hour: number; min?: number; sec?: number; lat?: number; lng?: number; acc?: number }) {
  return {
    staff_id: 'A',
    recorded_at: ts(opts.hour, opts.min ?? 0, opts.sec ?? 0),
    lat: opts.lat ?? 59.0,
    lng: opts.lng ?? 17.0,
    accuracy: opts.acc ?? 30,
  };
}

Deno.test('Lager 1.7: 0 pings → all gps fields safely zero', async () => {
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient([]), organizationId: 'org', staffId: 'A', date: DATE,
  });
  assertEquals(ev.gps.locationLogicPingCount, 0);
  assertEquals(ev.gps.coverageRatio, 0);
  assertEquals(ev.gps.longGapCount, 0);
  assertEquals(ev.gps.maxGapMinutes, null);
  assertEquals(ev.gps.hasNightActivity, false);
  assertEquals(ev.gps.normalizedPingsSummary.count, 0);
  assertEquals(ev.gps.locationLogicPingsSummary.count, 0);
  assert(ev.diagnostics.gps !== null);
  assertEquals(ev.diagnostics.gps!.locationLogicPingCount, 0);
});

Deno.test('Lager 1.7: many pings → counts + summaries populated', async () => {
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push(ping({ hour: 8, min: i }));
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient(rows), organizationId: 'org', staffId: 'A', date: DATE,
  });
  assertEquals(ev.gps.fetchedPingCount, 60);
  assertEquals(ev.gps.normalizedPingCount, 60);
  assertEquals(ev.gps.locationLogicPingCount, 60);
  assertEquals(ev.gps.hardRejectedPingCount, 0);
  assert(ev.gps.coverageRatio > 0);
  assertEquals(ev.gps.normalizedPingsSummary.qualityCounts.excellent, 60);
  assertEquals(ev.diagnostics.gps!.normalizedPingCount, 60);
});

Deno.test('Lager 1.7: low accuracy retained but counted', async () => {
  const rows = [
    ping({ hour: 9, min: 0, acc: 20 }),
    ping({ hour: 9, min: 1, acc: 1500 }), // very_weak
    ping({ hour: 9, min: 2, acc: 20 }),
  ];
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient(rows), organizationId: 'org', staffId: 'A', date: DATE,
  });
  assertEquals(ev.gps.normalizedPingCount, 3);
  assert(ev.gps.normalizedPingsSummary.retainedLowAccuracyCount >= 1);
  // Inga hard rejects bara pga accuracy.
  assertEquals(ev.gps.hardRejectedPingCount, 0);
});

Deno.test('Lager 1.7: outlier spike → ignored from locationLogic but kept in diagnostics', async () => {
  // Stable plats A, en spike 5 km bort, tillbaka direkt.
  const rows = [
    ping({ hour: 10, min: 0, lat: 59.0, lng: 17.0 }),
    ping({ hour: 10, min: 1, lat: 59.0, lng: 17.0 }),
    ping({ hour: 10, min: 2, lat: 59.045, lng: 17.0 }), // ~5 km bort
    ping({ hour: 10, min: 3, lat: 59.0, lng: 17.0 }),
    ping({ hour: 10, min: 4, lat: 59.0, lng: 17.0 }),
  ];
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient(rows), organizationId: 'org', staffId: 'A', date: DATE,
  });
  assertEquals(ev.gps.normalizedPingCount, 5);
  assert(ev.gps.ignoredOutlierPingCount >= 1, 'spike ska markeras outlier');
  assertEquals(ev.gps.locationLogicPingCount, 5 - ev.gps.ignoredOutlierPingCount);
  assert(ev.diagnostics.gpsOutlierDiagnostics!.examples.length >= 1);
});

Deno.test('Lager 1.7: long gap → longGapCount + maxGapMinutes', async () => {
  const rows = [
    ping({ hour: 8, min: 0 }),
    ping({ hour: 8, min: 5 }),
    ping({ hour: 10, min: 0 }), // 115 min gap
    ping({ hour: 10, min: 5 }),
  ];
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient(rows), organizationId: 'org', staffId: 'A', date: DATE,
  });
  assertEquals(ev.gps.longGapCount, 1);
  assert(ev.gps.maxGapMinutes !== null && ev.gps.maxGapMinutes >= 110);
});

Deno.test('Lager 1.7: night activity detected (Stockholm 22:00 lokal = UTC 20)', async () => {
  const rows = [ping({ hour: 20, min: 30 })]; // sommartid → 22:30 lokal
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient(rows), organizationId: 'org', staffId: 'A', date: DATE,
  });
  assertEquals(ev.gps.hasNightActivity, true);
});

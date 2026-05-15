// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildDayEvidence } from './buildDayEvidence.ts';

function makeClient(rows: any[]) {
  const builder: any = {
    _f: { staff: null, gte: null, lte: null },
    from() { return this; },
    select() { return this; },
    eq(c: string, v: any) { if (c === 'staff_id') this._f.staff = v; return this; },
    neq() { return this; },
    gte(_c: string, v: string) { this._f.gte = v; return this; },
    lte(_c: string, v: string) { this._f.lte = v; return this; },
    order() { return this; },
    async range(from: number, to: number) {
      let pool = rows;
      if (this._f.staff) pool = pool.filter((r: any) => r.staff_id === this._f.staff);
      const a = Date.parse(this._f.gte), b = Date.parse(this._f.lte);
      pool = pool.filter((r: any) => {
        const t = Date.parse(r.recorded_at);
        return t >= a && t <= b;
      });
      return { data: pool.slice(from, to + 1), error: null };
    },
  };
  return { from: () => builder };
}

Deno.test('Lager 1.12: 0 pings → shape complete (arrays + numbers + diagnostics)', async () => {
  const ev = await buildDayEvidence({
    supabaseAdmin: makeClient([]), organizationId: 'org', staffId: 'A', date: '2026-05-13',
  });
  // arrays
  assert(Array.isArray(ev.internal.normalizedPings));
  assert(Array.isArray(ev.internal.locationLogicPings));
  assert(Array.isArray(ev.internal.hardRejectedPings));
  // numbers
  for (const k of [
    'rawPingCount','fetchedPingCount','normalizedPingCount',
    'locationLogicPingCount','hardRejectedPingCount','ignoredOutlierPingCount',
    'longGapCount','coverageRatio',
  ]) {
    assertEquals(typeof (ev.gps as any)[k], 'number');
  }
  // dataQuality arrays — alla 14 ska finnas
  const dq: any = ev.knownTargets.dataQuality;
  for (const k of [
    'targetsMissingCoordinates','targetsMissingRadius','largeProjectsMissingGeo',
    'bookingsInsideLargeProjects','projectsInsideLargeProjects',
    'childBookingsSuppressedAsTargets','childProjectsSuppressedAsTargets',
    'ambiguousLargeProjectChildProjects','assignmentsWithoutMatchingTarget',
    'calendarEventsWithoutTarget','calendarEventsWithLargeProjectContext',
    'calendarEventsPointingToChildBooking','calendarEventsPointingToMissingGeoLargeProject',
    'targetsWithNullRadius',
  ]) {
    assert(Array.isArray(dq[k]), `dataQuality.${k} ska vara array`);
  }
  // diagnostics-objektet finns
  assert(ev.diagnostics);
  assertEquals(typeof ev.diagnostics.buildDurationMs, 'number');
});

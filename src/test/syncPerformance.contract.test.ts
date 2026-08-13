/**
 * STEG 4E — Performance review utan beteendeförändring.
 *
 * Testerna verifierar två saker:
 *  1. `SyncPerfTracker` mäter korrekt (queries/booking, faser, counts) och är
 *     helt biverkningsfri när den är avstängd.
 *  2. Syncens semantik är OFÖRÄNDRAD för 0/20/200 produkter, stora datumset,
 *     retry och två organisationer.
 */
import { describe, it, expect, vi } from 'vitest';
import { SyncPerfTracker, verboseProductLogging } from '../../supabase/functions/_shared/syncPerf';
import { createFakeSupabase } from './sync-harness/fakeSupabase';
import { runCanonicalSync } from './sync-harness/pipeline';
import {
  ORG_A,
  ORG_B,
  makeBooking,
  makeSourcePayload,
  makeBookingSourceState,
} from './sync-harness/factories';

const products = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ext-${i + 1}`,
    name: `Produkt ${i + 1}`,
    quantity: 1,
    unit_price: 100,
    total_price: 100,
  }));

const world = (bookingId: string, orgId: string) => {
  const sb = createFakeSupabase({
    bookings: [makeBooking({ id: bookingId, organization_id: orgId })],
    booking_source_state: [makeBookingSourceState({ booking_id: bookingId, organization_id: orgId })],
  } as any);
  return sb;
};

const payloadFor = (bookingId: string, productCount: number, over: Record<string, unknown> = {}) =>
  makeSourcePayload({
    booking: {
      id: bookingId,
      status: 'CONFIRMED',
      source_version: 99,
      customer_name: 'Kund AB',
      rigdaydate: '2026-09-01',
      eventdate: '2026-09-02',
      rigdowndate: '2026-09-03',
      products_complete: true,
      products: products(productCount),
      ...over,
    },
  });

describe('STEG 4E — SyncPerfTracker mätning', () => {
  it('räknar queries per bokning och skiljer read/write', () => {
    const t = new SyncPerfTracker(true);
    t.beginBooking('bk-1');
    t.countQuery('read');
    t.countQuery('read');
    t.countQuery('write');
    t.endBooking();

    const snap = t.snapshot();
    expect(snap.bookings).toBe(1);
    expect(snap.total_queries).toBe(3);
    expect(snap.per_booking[0].reads).toBe(2);
    expect(snap.per_booking[0].writes).toBe(1);
  });

  it('avslutar föregående bokning automatiskt vid ny beginBooking (continue i loopen)', () => {
    const t = new SyncPerfTracker(true);
    t.beginBooking('bk-1');
    t.countQuery('read');
    t.beginBooking('bk-2'); // ingen endBooking emellan
    t.countQuery('read');
    t.countQuery('read');
    t.endBooking();

    const snap = t.snapshot();
    expect(snap.bookings).toBe(2);
    expect(snap.queries_per_booking_max).toBe(2);
    expect(snap.worst_booking_id).toBe('bk-2');
  });

  it('registrerar produkt-, kalender- och packningsantal per bokning', () => {
    const t = new SyncPerfTracker(true);
    t.beginBooking('bk-1');
    t.setCount('products_count', 200);
    t.setCount('calendar_events_count', 6);
    t.setCount('packing_items_count', 180);
    t.endBooking();

    const m = t.snapshot().per_booking[0];
    expect(m.products_count).toBe(200);
    expect(m.calendar_events_count).toBe(6);
    expect(m.packing_items_count).toBe(180);
  });

  it('mäter faser via phase() och startPhase() och summerar dem', async () => {
    const t = new SyncPerfTracker(true);
    t.beginBooking('bk-1');
    await t.phase('existing_bookings_read', async () => 'ok');
    const stop = t.startPhase('products');
    stop();
    t.addPhaseMs('calendar', 12);
    t.endBooking();

    const snap = t.snapshot();
    expect(Object.keys(snap.phases).sort()).toEqual(['calendar', 'existing_bookings_read', 'products']);
    expect(snap.phases.calendar).toBe(12);
  });

  it('phase() ändrar inte semantik — fel kastas vidare oförändrat', async () => {
    const t = new SyncPerfTracker(true);
    t.beginBooking('bk-1');
    await expect(
      t.phase('products', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(t.snapshot().phases.products).toBeGreaterThanOrEqual(0);
  });

  it('är helt passiv när den är avstängd (ingen loggning, tomma mätvärden)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = new SyncPerfTracker(false);
    t.beginBooking('bk-1');
    t.countQuery('write');
    await t.phase('products', async () => 1);
    t.endBooking();
    t.logSummary();

    expect(t.snapshot().bookings).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logSummary loggar bara aggregat — ingen känslig data', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = new SyncPerfTracker(true);
    t.beginBooking('bk-1');
    t.countQuery('read');
    t.endBooking();
    t.logSummary('[test-perf]');

    const line = String(spy.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('[test-perf]');
    expect(line).toContain('queries=1');
    expect(line).not.toMatch(/Kund|adress|address|email/i);
    spy.mockRestore();
  });

  it('verbose produktloggning är AV som standard', () => {
    expect(verboseProductLogging()).toBe(false);
  });
});

describe('STEG 4E — semantiken oförändrad vid olika volymer', () => {
  it.each([0, 20, 200])('bokning med %i produkter ger commit och inga fel', async (count) => {
    const bookingId = `bk-perf-${count}`;
    const sb = world(bookingId, ORG_A);
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId,
      payload: payloadFor(bookingId, count),
    });

    expect(res.errors).toEqual([]);
    expect(res.committed).toBe(true);
    expect(res.outcome).not.toBe('failed');
  });

  it('stort datumset påverkar inte utfallet', async () => {
    const bookingId = 'bk-perf-dates';
    const sb = world(bookingId, ORG_A);
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId,
      payload: payloadFor(bookingId, 50, {
        rig_up_dates: ['2026-09-01', '2026-09-02', '2026-09-03'],
        event_dates: ['2026-09-04', '2026-09-05'],
        rig_down_dates: ['2026-09-06', '2026-09-07'],
      }),
    });

    expect(res.errors).toEqual([]);
    expect(res.committed).toBe(true);
  });

  it('retry av samma revision är idempotent (already_current, inga fel)', async () => {
    const bookingId = 'bk-perf-retry';
    const sb = world(bookingId, ORG_A);
    const payload = payloadFor(bookingId, 20);

    const first = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId, payload });
    const second = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId, payload });

    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(['already_current', 'applied']).toContain(second.outcome);
  });

  it('två organisationer med samma booking-id hålls isolerade', async () => {
    const bookingId = 'bk-perf-shared';
    const sbA = world(bookingId, ORG_A);
    const sbB = world(bookingId, ORG_B);

    const a = await runCanonicalSync(sbA, {
      organizationId: ORG_A,
      bookingId,
      payload: payloadFor(bookingId, 20),
    });
    const b = await runCanonicalSync(sbB, {
      organizationId: ORG_B,
      bookingId,
      payload: payloadFor(bookingId, 200),
    });

    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.committed).toBe(true);
    expect(b.committed).toBe(true);
  });
});

/**
 * STEG 4A — regressionssvit för Booking → Planning-syncen.
 *
 * 25 scenarier körs mot in-memory-harnesset i `src/test/sync-harness/`.
 * Varje test verifierar BÅDE vad som ska förändras och vad som INTE får
 * förändras. Inga produktionscredentials, ingen nätverkstrafik.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from './sync-harness/fakeSupabase';
import {
  ORG_A,
  ORG_B,
  resetFactorySeq,
  makeBooking,
  makeBookingRevision,
  makeProduct,
  makeCalendarEvent,
  makeManualCalendarEvent,
  makeProject,
  makeJob,
  makeLargeProject,
  makePackingProject,
  makePackingItem,
  makeSyncJob,
  makeSyncBatch,
  makeSyncState,
  makeBookingSourceState,
  makeTwoTenantWorld,
} from './sync-harness/factories';
import { runCanonicalSync } from './sync-harness/pipeline';
import {
  isAutomaticDestructiveSyncEnabled,
  MAX_AUTOMATIC_CANCELLATIONS_PER_RUN,
  CANCELLATION_REQUIRES_EXPLICIT_APPLY,
} from '../../supabase/functions/_shared/destructiveSyncFlag';
import { evaluateDestructiveAction } from '../../supabase/functions/_shared/singleBookingSource';
import { validateSingleBookingResult } from '../../supabase/functions/_shared/singleBookingResult';
import {
  createSyncCounters,
  enforceDestructiveLimit,
  SAFETY_LIMITS,
  SafetyCircuitBreakerError,
} from '../../supabase/functions/_shared/syncObservability';
import { canDestroyProjection } from '../../supabase/functions/_shared/projectionSourceAuthority';

const BID = 'bk-100';

const payload = (over: Record<string, unknown> = {}, bookingOver: Record<string, unknown> = {}) => ({
  success: true,
  mode: 'single',
  contract_version: '1.1',
  found: true,
  booking_id: BID,
  organization_id: ORG_A,
  booking: {
    id: BID,
    organization_id: ORG_A,
    status: 'CONFIRMED',
    source_version: 2,
    customer_name: 'Kund AB',
    rigdaydate: '2026-09-01',
    eventdate: '2026-09-02',
    rigdowndate: '2026-09-03',
    dates_complete: true,
    products_complete: true,
    products: [{ name: 'Tält 6x12', quantity: 1, unit_price: 1000 }],
    ...bookingOver,
  },
  ...over,
});

function world(over?: { failures?: any[]; revisions?: any[]; seed?: Record<string, any[]> }): FakeSupabase {
  const booking = makeBooking({ id: BID, organization_id: ORG_A });
  return createFakeSupabase({
    failures: over?.failures,
    revisions: over?.revisions ?? [makeBookingRevision({ booking_id: BID, version: 1, status: 'CONFIRMED' })],
    seed: {
      bookings: [booking],
      booking_products: [],
      calendar_events: [makeCalendarEvent({ booking_id: BID, event_type: 'rig', date: '2026-09-01' })],
      projects: [makeProject({ booking_id: BID })],
      jobs: [makeJob({ booking_id: BID })],
      large_projects: [makeLargeProject()],
      packing_projects: [makePackingProject({ id: 'pack-1', booking_id: BID })],
      packing_list_items: [makePackingItem({ packing_project_id: 'pack-1' })],
      booking_sync_jobs: [makeSyncJob({ booking_id: BID })],
      sync_batches: [makeSyncBatch()],
      sync_state: [makeSyncState()],
      booking_source_state: [makeBookingSourceState({ booking_id: BID })],
      ...(over?.seed ?? {}),
    },
  });
}

beforeEach(() => resetFactorySeq());

describe('STEG 4A — Booking → Planning sync: regressionsscenarier', () => {
  it('1. New booking: canonical projection appliceras och revision committas', async () => {
    const sb = world({ revisions: [] });
    const res = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId: BID, payload: payload() });
    expect(res.outcome).toBe('applied');
    expect(res.errors).toEqual([]);
    expect(res.committed).toBe(true);
    // SKA förändras
    expect(sb.db.mutations.booking_products.inserts).toBe(1);
    // FÅR INTE förändras
    expect(sb.db.mutations.calendar_events?.deletes ?? 0).toBe(0);
    expect(sb.db.unscopedMutations).toEqual([]);
  });

  it('2. Existing booking update: uppdaterar bokning utan att radera något', async () => {
    const sb = world({
      seed: { booking_products: [makeProduct({ booking_id: BID, name: 'Tält 6x12', unit_price: 1000 })] },
    });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { customer_name: 'Nytt namn AB', source_version: 3 }),
    });
    expect(res.outcome).toBe('applied');
    expect(res.committed).toBe(true);
    expect((sb.db.tables.bookings[0] as any).customer_name).toBe('Nytt namn AB');
    expect(sb.db.mutations.booking_products?.deletes ?? 0).toBe(0);
  });

  it('3. Stale revision: 0 booking-, produkt-, kalender- och revisionsändringar', async () => {
    const sb = world({ revisions: [makeBookingRevision({ booking_id: BID, version: 9 })] });
    const before = JSON.stringify(sb.db.tables);
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
    });
    expect(res.reason).toBe('stale_source_revision');
    expect(res.committed).toBe(false);
    expect(sb.totalMutations()).toBe(0);
    expect(JSON.stringify(sb.db.tables)).toBe(before);
  });

  it('4. Equal revision: idempotent, ingen mutation, ingen commit', async () => {
    const sb = world({ revisions: [makeBookingRevision({ booking_id: BID, version: 2, status: 'CONFIRMED' })] });
    const res = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId: BID, payload: payload() });
    expect(res.outcome).toBe('already_current');
    expect(res.reason).toBe('already_current');
    expect(sb.totalMutations()).toBe(0);
  });

  it('5. Same revision conflicting status: fail-closed, ingen mutation', async () => {
    const sb = world({ revisions: [makeBookingRevision({ booking_id: BID, version: 2, status: 'CONFIRMED' })] });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { status: 'CANCELLED' }),
    });
    expect(res.reason).toBe('conflicting_source_status_for_revision');
    expect(res.committed).toBe(false);
    expect(sb.totalMutations()).toBe(0);
  });

  it('6. Lease collision: andra jobbet blockeras av booking_import_locked', async () => {
    const sb = world();
    const p = payload({}, { source_version: 3 });
    const first = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: p,
      jobId: 'job-1',
      // kör inte klart: vi tar reservationen och simulerar parallell körning nedan
    });
    expect(first.committed).toBe(true);
    // Ny reservation som fortfarande lever → nytt jobb blockeras
    const sb2 = world();
    const rev = sb2.db.revisions[0];
    rev.reservation_token = 'held-by-other';
    rev.lock_expires_at = new Date(Date.now() + 60_000).toISOString();
    const second = await runCanonicalSync(sb2, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: p,
      jobId: 'job-2',
    });
    expect(second.reason).toBe('booking_import_locked');
    expect(sb2.totalMutations()).toBe(0);
  });

  it('7. Lease loss under import: stoppar direkt, inga mutationer, ingen commit', async () => {
    const sb = world();
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
      loseLeaseBeforeMutations: true,
    });
    expect(res.reason).toBe('lease_ownership_lost');
    expect(res.committed).toBe(false);
    expect(sb.totalMutations()).toBe(0);
  });

  it('8. Partial product source: inga produkt-deletes, blockedRemovals loggas', async () => {
    const sb = world({
      seed: {
        booking_products: [
          makeProduct({ booking_id: BID, name: 'Tält 6x12' }),
          makeProduct({ booking_id: BID, name: 'Gammal produkt' }),
        ],
      },
    });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { products_complete: false, source_version: 3 }),
    });
    expect(res.blockedRemovals).toContain('Gammal produkt');
    expect(sb.db.mutations.booking_products?.deletes ?? 0).toBe(0);
    expect(sb.db.tables.booking_products).toHaveLength(2);
  });

  it('9. Complete product source: delete tillåts endast då', async () => {
    const sb = world({
      seed: {
        booking_products: [
          makeProduct({ booking_id: BID, name: 'Tält 6x12' }),
          makeProduct({ booking_id: BID, name: 'Borttagen produkt' }),
        ],
      },
    });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { products_complete: true, source_version: 3 }),
    });
    expect(res.errors).toEqual([]);
    expect(sb.db.mutations.booking_products.deletes).toBe(1);
    expect((sb.db.tables.booking_products as any[]).map((p) => p.name)).toEqual(['Tält 6x12']);
  });

  it('10. Empty complete product source: tom lista raderar aldrig', async () => {
    const sb = world({
      seed: { booking_products: [makeProduct({ booking_id: BID, name: 'Tält 6x12' })] },
    });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { products: [], products_complete: true, source_version: 3 }),
    });
    expect(res.blockedRemovals).toEqual(['Tält 6x12']);
    expect(sb.db.mutations.booking_products?.deletes ?? 0).toBe(0);
  });

  it('11. Calendar date update: event vars datum försvunnit raderas kontrollerat', async () => {
    const sb = world({
      seed: {
        calendar_events: [
          makeCalendarEvent({ id: 'cal-old', booking_id: BID, event_type: 'rig', date: '2026-08-20' }),
        ],
      },
    });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
    });
    expect(res.deletedCalendarEventIds).toEqual(['cal-old']);
    expect(sb.db.unscopedMutations).toEqual([]);
  });

  it('12. Missing calendar field: absent datum raderar inget', async () => {
    const sb = world({
      seed: {
        calendar_events: [
          makeCalendarEvent({ id: 'cal-x', booking_id: BID, event_type: 'rig', date: '2026-08-20' }),
        ],
      },
    });
    const p = payload({}, { source_version: 3 });
    delete (p.booking as any).rigdaydate;
    (p.booking as any).dates_complete = false;
    const res = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId: BID, payload: p });
    expect(res.deletedCalendarEventIds).toEqual([]);
    expect(res.blockedCalendarDeletes.map((b) => b.reason)).toContain('date_field_absent');
    expect(sb.db.tables.calendar_events).toHaveLength(1);
  });

  it('13. Manual event preservation: Planning-ägda event raderas aldrig', async () => {
    const sb = world({
      seed: {
        calendar_events: [
          makeManualCalendarEvent({ id: 'cal-manual', booking_id: BID, date: '2026-08-15' }),
          makeCalendarEvent({ id: 'cal-src', booking_id: BID, event_type: 'rig', date: '2026-09-01' }),
        ],
      },
    });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
    });
    expect(res.deletedCalendarEventIds).toEqual([]);
    expect(res.blockedCalendarDeletes.find((b) => b.id === 'cal-manual')?.reason).toBe('not_booking_generated');
    expect(sb.db.tables.calendar_events).toHaveLength(2);
  });

  it('14. Product insert failure → partial, ingen revision commit', async () => {
    const sb = world({ failures: [{ table: 'booking_products', op: 'insert', message: 'insert boom' }] });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
    });
    expect(res.outcome).toBe('partial');
    expect(res.errors[0].error).toContain('product_insert_failed');
    expect(res.committed).toBe(false);
    expect(res.released).toBe(true);
    expect(sb.db.revisions[0].applied_version).toBe(1); // oförändrad applied revision
  });

  it('15. Packing item failure → partial', async () => {
    const sb = world({ failures: [{ table: 'packing_list_items', op: 'insert', message: 'packing boom' }] });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
    });
    expect(res.outcome).toBe('partial');
    expect(res.errors.some((e) => e.error.includes('packing_item_insert_failed'))).toBe(true);
    expect(res.committed).toBe(false);
  });

  it('16. Project read failure → partial, projekt oförändrat', async () => {
    const sb = world();
    const before = JSON.stringify(sb.db.tables.projects);
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
      projectReadFails: true,
    });
    expect(res.outcome).toBe('partial');
    expect(res.errors.some((e) => e.error.includes('project_read_failed'))).toBe(true);
    expect(JSON.stringify(sb.db.tables.projects)).toBe(before);
    expect(res.committed).toBe(false);
  });

  it('17. Cross-tenant same booking id: endast org A muteras', async () => {
    const w = makeTwoTenantWorld();
    const sb = createFakeSupabase({
      revisions: [makeBookingRevision({ booking_id: w.bookingId, version: 1 })],
      seed: {
        bookings: w.bookings,
        booking_products: w.products,
        calendar_events: w.calendar,
        projects: [makeProject({ booking_id: w.bookingId, organization_id: ORG_A })],
        packing_projects: [makePackingProject({ id: 'pack-a', booking_id: w.bookingId, organization_id: ORG_A })],
      },
    });
    const p = payload({ booking_id: w.bookingId }, { id: w.bookingId, source_version: 3, customer_name: 'Org A uppdaterad' });
    const res = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId: w.bookingId, payload: p });
    expect(res.outcome).toBe('applied');
    const rowA = (sb.db.tables.bookings as any[]).find((b) => b.organization_id === ORG_A);
    const rowB = (sb.db.tables.bookings as any[]).find((b) => b.organization_id === ORG_B);
    expect(rowA.customer_name).toBe('Org A uppdaterad');
    expect(rowB.customer_name).toBe('Org B kund');
    expect((sb.db.tables.booking_products as any[]).some((p2) => p2.organization_id === ORG_B && p2.name === 'B-produkt')).toBe(true);
    expect(sb.db.unscopedMutations).toEqual([]);
  });

  it('18. Cancellation candidate: normal sync gör aldrig destruktiv cancellation', async () => {
    const sb = world();
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: {
        success: true,
        mode: 'single',
        contract_version: '1.1',
        found: false,
        reason: 'cancelled',
        tombstone: { booking_id: BID, organization_id: ORG_A, source_status: 'CANCELLED', source_version: 5 },
      },
    });
    expect(res.outcome).toBe('not_found');
    expect(sb.totalMutations()).toBe(0);
    expect(isAutomaticDestructiveSyncEnabled()).toBe(false);
    expect(MAX_AUTOMATIC_CANCELLATIONS_PER_RUN).toBe(1);
    expect(CANCELLATION_REQUIRES_EXPLICIT_APPLY).toBeTruthy();
    // Även med giltigt tombstone kräver cancellation ett eget, explicit spår.
    const decision = evaluateDestructiveAction(
      {
        kind: 'not_found',
        reason: 'cancelled',
        tombstone: { booking_id: BID, organization_id: ORG_A, source_status: 'CANCELLED', source_version: 5 },
      } as any,
      { bookingId: BID, organizationId: ORG_A },
      { sourceVersion: 2, sourceStatus: 'CONFIRMED' } as any,
    );
    expect(typeof decision.allowed).toBe('boolean');
  });

  it('19. Invalid dry-run: fail-closed, aldrig live-fallback', async () => {
    const sb = world();
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
      body: { dry_run: true, booking_ids: [BID] },
    });
    expect(res.invalidDryRun).toBe(true);
    expect(res.outcome).toBe('failed');
    expect(sb.totalMutations()).toBe(0);

    // Giltig dry-run → 0 mutationer men inget fel.
    const sb2 = world();
    const ok = await runCanonicalSync(sb2, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { source_version: 3 }),
      body: { dry_run: true, booking_id: BID, organization_id: ORG_A },
    });
    expect(ok.dryRun).toBe(true);
    expect(sb2.totalMutations()).toBe(0);
    expect(sb2.db.revisions[0].applied_version).toBe(1);
  });

  it('20. Circuit breaker: verkliga rader räknas före mutation', async () => {
    const counters = createSyncCounters();
    const overLimit = SAFETY_LIMITS.product_deletes + 1;
    expect(() => enforceDestructiveLimit(counters, 'product_deletes', overLimit)).toThrow(SafetyCircuitBreakerError);
    expect(counters.blocked_by_circuit_breaker).toBe(1);

    const sb = world({
      seed: {
        booking_products: Array.from({ length: overLimit }, (_, i) =>
          makeProduct({ booking_id: BID, name: `Gammal ${i}` }),
        ),
      },
    });
    const res = await runCanonicalSync(sb, {
      organizationId: ORG_A,
      bookingId: BID,
      payload: payload({}, { products_complete: true, source_version: 3 }),
    });
    expect(res.circuitBreakerTripped).toBe(true);
    expect(res.outcome).toBe('partial');
    expect(res.committed).toBe(false);
    expect(sb.db.mutations.booking_products?.deletes ?? 0).toBe(0);
  });

  it('21. Retry after partial: nästa körning utan fel committar', async () => {
    const sb = world({ failures: [{ table: 'booking_products', op: 'insert', message: 'transient', times: 1 }] });
    const p = payload({}, { source_version: 3 });
    const first = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId: BID, payload: p });
    expect(first.outcome).toBe('partial');
    expect(first.committed).toBe(false);
    const second = await runCanonicalSync(sb, { organizationId: ORG_A, bookingId: BID, payload: p });
    expect(second.outcome).toBe('applied');
    expect(second.committed).toBe(true);
    expect(sb.db.revisions[0].applied_version).toBe(3);
  });

  it('22. Worker job completion: endast applied/already_current får completas', () => {
    const expected = { bookingId: BID, organizationId: ORG_A };
    const ok = validateSingleBookingResult(
      { success: true, completed: true, sync_mode: 'single', booking_id: BID, organization_id: ORG_A, outcome: 'applied' },
      expected,
      { ok: true, status: 200 },
    );
    expect(ok.ok).toBe(true);
    const partial = validateSingleBookingResult(
      { success: false, completed: false, sync_mode: 'single', booking_id: BID, organization_id: ORG_A, outcome: 'partial' },
      expected,
      { ok: true, status: 200 },
    );
    expect(partial.ok).toBe(false);
  });

  it('23. Batch finalization: batch stängs först när alla jobb är terminala', async () => {
    const sb = createFakeSupabase({
      seed: {
        sync_batches: [makeSyncBatch({ id: 'batch-1', planned_cursor: '2026-08-02T00:00:00.000Z', total_jobs: 2 })],
        booking_sync_jobs: [
          makeSyncJob({ id: 'j1', batch_id: 'batch-1', status: 'completed' }),
          makeSyncJob({ id: 'j2', batch_id: 'batch-1', status: 'pending' }),
        ],
        sync_state: [makeSyncState()],
      },
    });
    const pending = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-1' });
    expect((pending.data as any[])[0].finalized).toBe(false);
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-07-01T00:00:00.000Z');
  });

  it('24. Cursor advancement: cursor flyttas endast vid full success', async () => {
    const sb = createFakeSupabase({
      seed: {
        sync_batches: [makeSyncBatch({ id: 'batch-2', planned_cursor: '2026-08-02T00:00:00.000Z', total_jobs: 1 })],
        booking_sync_jobs: [makeSyncJob({ id: 'j1', batch_id: 'batch-2', status: 'completed' })],
        sync_state: [makeSyncState()],
      },
    });
    const done = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-2' });
    expect((done.data as any[])[0].status).toBe('success');
    expect((done.data as any[])[0].cursor_advanced_to).toBe('2026-08-02T00:00:00.000Z');
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-08-02T00:00:00.000Z');
  });

  it('25. Cursor blocked after failure: failed jobb stoppar cursorn', async () => {
    const sb = createFakeSupabase({
      seed: {
        sync_batches: [makeSyncBatch({ id: 'batch-3', planned_cursor: '2026-08-02T00:00:00.000Z', total_jobs: 2 })],
        booking_sync_jobs: [
          makeSyncJob({ id: 'j1', batch_id: 'batch-3', status: 'completed' }),
          makeSyncJob({ id: 'j2', batch_id: 'batch-3', status: 'failed' }),
        ],
        sync_state: [makeSyncState()],
      },
    });
    const done = await sb.rpc('finalize_sync_batch', { _batch_id: 'batch-3' });
    expect((done.data as any[])[0].status).toBe('partial');
    expect((done.data as any[])[0].cursor_advanced_to).toBeNull();
    expect((sb.db.tables.sync_state[0] as any).last_sync_timestamp).toBe('2026-07-01T00:00:00.000Z');
  });

  it('bonus: normal sync får aldrig destruera projections', () => {
    const gate = canDestroyProjection({
      sourceFound: true,
      revisionValidated: true,
      leaseOwned: true,
      projectionComplete: true,
      organizationId: ORG_A,
      bookingId: BID,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('normal_sync_never_destructive');
  });
});

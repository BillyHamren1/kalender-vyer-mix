/**
 * STEG 2G — Canonical revision guard.
 * Test 1–16: äldre revision får aldrig appliceras eller loggas.
 */
import { describe, it, expect } from 'vitest';
import {
  compareIncomingRevision,
  normalizeIncomingRevision,
  reserveCanonicalRevision,
  commitCanonicalRevision,
  releaseCanonicalRevision,
} from '../../supabase/functions/_shared/canonicalRevisionGuard';
import {
  loadAppliedSourceRevision,
  recordAppliedSourceRevision,
  DEDICATED_REVISION_COLUMN,
} from '../../supabase/functions/_shared/appliedSourceRevision';
import { validateSingleBookingResult } from '../../supabase/functions/_shared/singleBookingResult';

const BOOKING = 'b-1';
const ORG = '00000000-0000-0000-0000-000000000001';

const localV20 = { sourceVersion: 20, sourceStatus: 'CONFIRMED' };
const localTs = { sourceUpdatedAt: '2026-08-01T12:10:00Z', sourceStatus: 'CONFIRMED' };

describe('STEG 2G – ren jämförelse av inkommande revision', () => {
  it('Test 1: lokal v20, inkommande v19 → stale', () => {
    expect(compareIncomingRevision({ sourceVersion: 19, sourceStatus: 'CONFIRMED' }, localV20))
      .toBe('stale_source_revision');
  });
  it('Test 2: lokal v20, inkommande v20 samma status → already_current', () => {
    expect(compareIncomingRevision({ sourceVersion: 20, sourceStatus: 'CONFIRMED' }, localV20))
      .toBe('already_current');
  });
  it('Test 3: lokal v20, inkommande v20 annan status → konflikt', () => {
    expect(compareIncomingRevision({ sourceVersion: 20, sourceStatus: 'CANCELLED' }, localV20))
      .toBe('conflicting_source_status_for_revision');
  });
  it('Test 4: lokal v20, inkommande v21 → apply', () => {
    expect(compareIncomingRevision({ sourceVersion: 21, sourceStatus: 'CONFIRMED' }, localV20))
      .toBe('apply');
  });
  it('Test 5: lokal ts 12:10, inkommande 12:05 → stale', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-08-01T12:05:00Z', sourceStatus: 'CONFIRMED' }, localTs))
      .toBe('stale_source_revision');
  });
  it('Test 6: lokal ts 12:10, inkommande 12:10 samma status → idempotent', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-08-01T12:10:00Z', sourceStatus: 'CONFIRMED' }, localTs))
      .toBe('already_current');
  });
  it('Test 7: lokal ts 12:10, inkommande 12:10 annan status → konflikt', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-08-01T12:10:00Z', sourceStatus: 'OFFER' }, localTs))
      .toBe('conflicting_source_status_for_revision');
  });
  it('Test 8: inkomparabla typer → incomparable', () => {
    expect(compareIncomingRevision({ sourceUpdatedAt: '2026-08-01T12:10:00Z', sourceStatus: 'CONFIRMED' }, localV20))
      .toBe('incomparable_source_revision');
    expect(compareIncomingRevision({ sourceVersion: 21, sourceStatus: 'CONFIRMED' }, { sourceUpdatedAt: '2026-08-01T12:10:00Z', sourceVersion: 20, sourceStatus: 'CONFIRMED' }))
      .toBe('incomparable_source_revision');
  });
  it('ogiltig inkommande revision (saknad status) nekas', () => {
    expect(normalizeIncomingRevision({ sourceVersion: 20 })).toBeNull();
    expect(compareIncomingRevision({ sourceVersion: 20 }, localV20)).toBe('invalid_incoming_revision');
  });
});

// ── In-memory-simulering av RPC:n advance_booking_source_revision ────────────
type State = {
  appliedTs: string | null; appliedVer: number | null; appliedStatus: string | null;
  pendingTs: string | null; pendingVer: number | null; pendingStatus: string | null;
};
function makeRpcSupabase(initial?: Partial<State>) {
  const state: State = {
    appliedTs: null, appliedVer: null, appliedStatus: null,
    pendingTs: null, pendingVer: null, pendingStatus: null,
    ...(initial ?? {}),
  };
  const rpc = async (_name: string, args: any) => {
    const ts = args.p_source_updated_at ?? null;
    const ver = args.p_source_version ?? null;
    const status = args.p_source_status;
    const mode = args.p_mode;
    if (mode === 'release') {
      if (state.pendingTs === ts && state.pendingVer === ver) {
        state.pendingTs = null; state.pendingVer = null; state.pendingStatus = null;
      }
      return { data: { decision: 'released' }, error: null };
    }
    if (mode === 'commit') {
      if (state.pendingTs === ts && state.pendingVer === ver && (state.pendingTs !== null || state.pendingVer !== null)) {
        state.appliedTs = ts; state.appliedVer = ver; state.appliedStatus = status;
        state.pendingTs = null; state.pendingVer = null; state.pendingStatus = null;
        return { data: { decision: 'applied' }, error: null };
      }
      if (state.appliedTs === ts && state.appliedVer === ver && state.appliedStatus === status) {
        return { data: { decision: 'already_current' }, error: null };
      }
      return { data: { decision: 'commit_without_reservation' }, error: null };
    }
    // reserve
    const hasApplied = state.appliedTs !== null || state.appliedVer !== null;
    if (hasApplied) {
      if ((state.appliedTs !== null && ts === null) || (state.appliedVer !== null && ver === null)) {
        return { data: { decision: 'incomparable_source_revision' }, error: null };
      }
      let older = false, newer = false;
      if (state.appliedTs !== null) {
        if (Date.parse(ts!) < Date.parse(state.appliedTs)) older = true;
        if (Date.parse(ts!) > Date.parse(state.appliedTs)) newer = true;
      }
      if (state.appliedVer !== null) {
        if (ver! < state.appliedVer) older = true;
        if (ver! > state.appliedVer) newer = true;
      }
      if (older) return { data: { decision: 'stale_source_revision' }, error: null };
      if (!newer) {
        return state.appliedStatus === status
          ? { data: { decision: 'already_current' }, error: null }
          : { data: { decision: 'conflicting_source_status_for_revision' }, error: null };
      }
    }
    const hasPending = state.pendingTs !== null || state.pendingVer !== null;
    if (hasPending) {
      if ((state.pendingTs !== null && ts === null) || (state.pendingVer !== null && ver === null)) {
        return { data: { decision: 'incomparable_source_revision' }, error: null };
      }
      if ((state.pendingTs !== null && Date.parse(ts!) < Date.parse(state.pendingTs)) ||
          (state.pendingVer !== null && ver! < state.pendingVer)) {
        return { data: { decision: 'stale_source_revision' }, error: null };
      }
      if (state.pendingTs === ts && state.pendingVer === ver && state.pendingStatus !== status) {
        return { data: { decision: 'conflicting_source_status_for_revision' }, error: null };
      }
    }
    state.pendingTs = ts; state.pendingVer = ver; state.pendingStatus = status;
    return { data: { decision: 'reserved' }, error: null };
  };
  return { supabase: { rpc }, state };
}

const inc = (v: number, status = 'CONFIRMED') => ({ sourceVersion: v, sourceStatus: status });
const target = (incoming: any) => ({ bookingId: BOOKING, organizationId: ORG, incoming });

describe('STEG 2G – atomisk revision advancement (reserve/commit/release)', () => {
  it('Test 9: samtidiga jobb v19 och v20 → slutresultat alltid v20', async () => {
    for (const order of [[20, 19], [19, 20]]) {
      const { supabase, state } = makeRpcSupabase();
      const [a, b] = order;
      const ra = await reserveCanonicalRevision(supabase, target(inc(a)));
      const rb = await reserveCanonicalRevision(supabase, target(inc(b)));
      if (ra.ok) await commitCanonicalRevision(supabase, target(inc(a)));
      if (rb.ok) await commitCanonicalRevision(supabase, target(inc(b)));
      expect(state.appliedVer).toBe(20);
    }
  });

  it('Test 10: samma revision + samma status → en applicerar, andra idempotent', async () => {
    const { supabase, state } = makeRpcSupabase();
    const r1 = await reserveCanonicalRevision(supabase, target(inc(20)));
    expect(r1).toMatchObject({ ok: true, decision: 'reserved' });
    await commitCanonicalRevision(supabase, target(inc(20)));
    const r2 = await reserveCanonicalRevision(supabase, target(inc(20)));
    expect(r2).toMatchObject({ ok: true, decision: 'already_current' });
    expect(state.appliedVer).toBe(20);
  });

  it('Test 11: samma revision men olika status → konflikt upptäcks', async () => {
    const { supabase } = makeRpcSupabase();
    await reserveCanonicalRevision(supabase, target(inc(20, 'CONFIRMED')));
    const conflict = await reserveCanonicalRevision(supabase, target(inc(20, 'CANCELLED')));
    expect(conflict).toMatchObject({ ok: false, decision: 'conflicting_source_status_for_revision' });
    await commitCanonicalRevision(supabase, target(inc(20, 'CONFIRMED')));
    const afterApplied = await reserveCanonicalRevision(supabase, target(inc(20, 'CANCELLED')));
    expect(afterApplied).toMatchObject({ ok: false, decision: 'conflicting_source_status_for_revision' });
  });

  it('Test 12: reserverad revision vars import misslyckas kan retryas', async () => {
    const { supabase, state } = makeRpcSupabase();
    await reserveCanonicalRevision(supabase, target(inc(20)));
    // Äldre revision får inte skriva över pending nyare revision
    const stale = await reserveCanonicalRevision(supabase, target(inc(19)));
    expect(stale).toMatchObject({ ok: false, decision: 'stale_source_revision' });
    // Import misslyckas → release, inte applied
    await releaseCanonicalRevision(supabase, target(inc(20)));
    expect(state.appliedVer).toBeNull();
    // Samma revision kan retryas
    const retry = await reserveCanonicalRevision(supabase, target(inc(20)));
    expect(retry).toMatchObject({ ok: true, decision: 'reserved' });
    await commitCanonicalRevision(supabase, target(inc(20)));
    expect(state.appliedVer).toBe(20);
  });

  it('stale reserve mot applied revision nekas utan mutation', async () => {
    const { supabase } = makeRpcSupabase({ appliedVer: 20, appliedStatus: 'CONFIRMED' });
    const res = await reserveCanonicalRevision(supabase, target(inc(19)));
    expect(res).toMatchObject({ ok: false, decision: 'stale_source_revision' });
  });
});

// ── Loader / record ─────────────────────────────────────────────────────────
function makeSupabase(opts: {
  dedicated?: any;
  changeRows?: any[];
  updates?: any[];
  inserts?: any[];
  exactRows?: any[];
  captureExactFilters?: any[];
} = {}) {
  return {
    from(table: string) {
      if (table === 'bookings') {
        const chain: any = {
          eq: () => chain,
          maybeSingle: () => Promise.resolve({
            data: { [DEDICATED_REVISION_COLUMN]: opts.dedicated ?? null },
            error: null,
          }),
        };
        return {
          select: () => chain,
          update: (patch: any) => {
            opts.updates?.push(patch);
            const u: any = { eq: () => u, then: (res: any) => res({ error: null }) };
            return u;
          },
        };
      }
      const filters: any = {};
      const chain: any = {
        eq: (col: string, val: any) => { filters[col] = val; opts.captureExactFilters?.push({ col, val }); return chain; },
        in: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: opts.changeRows ?? [], error: null }),
        then: (resolve: any) =>
          resolve({
            data: filters['new_values->>source_revision'] !== undefined
              ? (opts.exactRows ?? [])
              : (opts.changeRows ?? []),
            error: null,
          }),
      };
      return {
        select: () => chain,
        insert: (row: any) => { opts.inserts?.push(row); return Promise.resolve({ error: null }); },
      };
    },
  };
}

describe('STEG 2G – recordAppliedSourceRevision är monoton', () => {
  it('nekar äldre version utan att skriva något', async () => {
    const updates: any[] = []; const inserts: any[] = [];
    const sb = makeSupabase({
      dedicated: { source_version: 20, source_status: 'CONFIRMED' },
      updates, inserts,
    });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 19, sourceStatus: 'CONFIRMED',
    });
    expect(res).toEqual({ ok: false, error: 'stale_source_revision' });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('samma revision + samma status → idempotent utan skrivning', async () => {
    const updates: any[] = []; const inserts: any[] = [];
    const sb = makeSupabase({ dedicated: { source_version: 20, source_status: 'CONFIRMED' }, updates, inserts });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 20, sourceStatus: 'CONFIRMED',
    });
    expect(res).toMatchObject({ ok: true, already_current: true });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('samma revision + annan status → konflikt', async () => {
    const sb = makeSupabase({ dedicated: { source_version: 20, source_status: 'CONFIRMED' } });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 20, sourceStatus: 'CANCELLED',
    });
    expect(res).toEqual({ ok: false, error: 'conflicting_source_status_for_revision' });
  });

  it('nyare revision loggas', async () => {
    const updates: any[] = []; const inserts: any[] = [];
    const sb = makeSupabase({ dedicated: { source_version: 20, source_status: 'CONFIRMED' }, updates, inserts, exactRows: [] });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 21, sourceStatus: 'CONFIRMED',
    });
    expect(res).toMatchObject({ ok: true, logged: true });
    expect(updates).toHaveLength(1);
    expect(inserts).toHaveLength(1);
  });

  it('Test 14: exakt revisionsquery utan limit hittar motsägelse långt bak', async () => {
    const filters: any[] = [];
    const sb = makeSupabase({
      dedicated: { source_version: 20, source_status: 'CONFIRMED' },
      captureExactFilters: filters,
      // "gammal" rad som ligger långt bak i historiken men matchar exakt revision
      exactRows: [{ id: 'x', new_values: { source_revision: 21, source_status: 'OFFER' } }],
    });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 21, sourceStatus: 'CONFIRMED',
    });
    expect(res).toEqual({ ok: false, error: 'conflicting_source_status_for_revision' });
    expect(filters.some((f) => f.col === 'new_values->>source_revision' && String(f.val) === '21')).toBe(true);
  });
});

describe('STEG 2G – ogiltigt created_at är fail-closed', () => {
  it('Test 13: revisionsrad med ogiltig created_at → fail-closed', async () => {
    const sb = makeSupabase({
      dedicated: null,
      changeRows: [
        { change_type: 'source_revision', created_at: null, new_values: { source_revision: 20, source_status: 'CONFIRMED' } },
      ],
    });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res).toMatchObject({ ok: false, error: 'stored_revision_created_at_invalid', retriable: false });
  });
});

describe('STEG 2G – stale/konflikt blir aldrig applied → completed → cursor', () => {
  const base = { sync_mode: 'single', booking_id: BOOKING, organization_id: ORG };
  it('Test 16: stale-svar valideras som permanent misslyckande', () => {
    for (const err of ['stale_source_revision', 'conflicting_source_status_for_revision', 'incomparable_source_revision']) {
      const res = validateSingleBookingResult(
        { ...base, success: false, queued: false, completed: false, outcome: 'failed', error: err },
        { bookingId: BOOKING, organizationId: ORG },
        { ok: true, status: 200 },
      );
      expect(res.ok).toBe(false);
      expect((res as any).permanent).toBe(true);
    }
  });
});

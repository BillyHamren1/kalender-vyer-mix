/**
 * STEG 2E — Stänger de sista hålen i stale-revisionsskyddet.
 *
 * Test 1–15 enligt uppgiften.
 */
import { describe, it, expect } from 'vitest';
import {
  loadAppliedSourceRevision,
  recordAppliedSourceRevision,
  REVISION_BEARING_CHANGE_TYPES,
} from '../../supabase/functions/_shared/appliedSourceRevision';
import {
  evaluateDestructiveAction,
  compareRevisions,
  type SingleBookingSourceResult,
  type LocalAppliedRevision,
} from '../../supabase/functions/_shared/singleBookingSource';

const BOOKING = 'b-1';
const ORG = 'org-1';
const exp = { bookingId: BOOKING, organizationId: ORG };

function absent(tombstone: Record<string, unknown>): SingleBookingSourceResult {
  return { kind: 'absent', reason: 'cancelled', rawReason: 'cancelled', tombstone: tombstone as any };
}
function tomb(extra: Record<string, unknown>) {
  return {
    booking_id: BOOKING,
    organization_id: ORG,
    source_status: 'CANCELLED',
    source_updated_at: null,
    source_version: null,
    ...extra,
  };
}

/** Mock som registrerar filter och returnerar rader. */
function makeSupabase(rows: any[], opts: { error?: any; captured?: any; insertError?: any; inserts?: any[] } = {}) {
  return {
    from(_table: string) {
      const chain: any = {
        eq: () => chain,
        in: (col: string, vals: string[]) => {
          if (opts.captured) opts.captured.in = { col, vals };
          return chain;
        },
        order: () => chain,
        limit: (n: number) => {
          if (opts.captured) opts.captured.limit = n;
          return Promise.resolve({ data: opts.error ? null : rows, error: opts.error ?? null });
        },
        then: (res: any) => res({ data: rows, error: null }),
      };
      return {
        select: () => chain,
        insert: (row: any) => {
          opts.inserts?.push(row);
          return Promise.resolve({ error: opts.insertError ?? null });
        },
      };
    },
  };
}

function row(changeType: string, revision: string | number, status?: string | null, createdAt = '2026-01-01T00:00:00Z') {
  return { change_type: changeType, created_at: createdAt, new_values: { source_revision: revision, source_status: status ?? null } };
}

describe('STEG 2E – loader utan limit-50-lucka', () => {
  it('Test 1: canonical revision hittas trots 100 orelaterade ändringar', async () => {
    // Orelaterade change_types filtreras bort server-side; endast revisionsbärande rader läses.
    const rows = [row('source_revision', '2026-01-05T10:00:00Z', 'CONFIRMED')];
    const captured: any = {};
    const sb = makeSupabase(rows, { captured });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) expect(res.revision.sourceUpdatedAt).toBe('2026-01-05T10:00:00Z');
  });

  it('Test 2: äldre revision bortom gamla limit(50) räknas inte som saknad', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row('cancellation_source', 2026 + i, 'CANCELLED'));
    const sb = makeSupabase(rows);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
  });

  it('Test 3: endast revisionsbärande change-types hämtas', async () => {
    const captured: any = {};
    const sb = makeSupabase([], { captured });
    await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(captured.in.col).toBe('change_type');
    expect(captured.in.vals).toEqual([...REVISION_BEARING_CHANGE_TYPES]);
    expect(captured.limit).toBeGreaterThan(50);
  });

  it('Test 15a: queryfel → fail-closed retrybart', async () => {
    const sb = makeSupabase([], { error: { message: 'denied' } });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retriable).toBe(true);
  });

  it('Test 15b: oparsbar lagrad revision → fail-closed', async () => {
    const sb = makeSupabase([row('source_revision', 'not-a-date' as any, 'CONFIRMED')]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
  });

  it('Test 10: samma revision med motsägelsefull status → conflicting_stored_source_revision', async () => {
    const sb = makeSupabase([
      row('source_revision', '2026-02-01T00:00:00Z', 'CONFIRMED'),
      row('cancellation_source', '2026-02-01T00:00:00Z', 'CANCELLED'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('conflicting_stored_source_revision');
  });

  it('Test 11: högsta timestamp och högsta version på olika rader → STEG 2F mixed (inga syntetiska revisioner)', async () => {
    const sb = makeSupabase([
      row('source_revision', '2026-03-01T00:00:00Z', 'CONFIRMED'),
      row('source_revision', 10, 'CONFIRMED'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('mixed_incomparable_revision_history');
  });

});

describe('STEG 2E – jämförelsepolicy äldre/samma/nyare', () => {
  const local = (o: Partial<LocalAppliedRevision>): LocalAppliedRevision[] => [{
    sourceUpdatedAt: null, sourceVersion: null, sourceStatus: null, changeType: null, ...o,
  }];

  it('Test 4: samma timestamp, lokal CONFIRMED → conflicting_source_revision', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-04-01T00:00:00Z' })), exp,
      local({ sourceUpdatedAt: '2026-04-01T00:00:00Z', sourceStatus: 'CONFIRMED', changeType: 'source_revision' }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('conflicting_source_revision');
  });

  it('Test 5: samma timestamp, lokal CANCELLED/cancellation_source → idempotent tillåts', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-04-01T00:00:00Z' })), exp,
      local({ sourceUpdatedAt: '2026-04-01T00:00:00Z', sourceStatus: 'CANCELLED', changeType: 'cancellation_source' }),
    );
    expect(d.allowed).toBe(true);
  });

  it('Test 6: version 10 lokalt OFFER, tombstone version 10 CANCELLED → nekas', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 10 })), exp,
      local({ sourceVersion: 10, sourceStatus: 'OFFER', changeType: 'source_revision' }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('conflicting_source_revision');
  });

  it('Test 7: version 10 lokalt CANCELLED, tombstone version 10 → idempotent tillåts', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 10 })), exp,
      local({ sourceVersion: 10, sourceStatus: 'CANCELLED', changeType: 'cancellation_source' }),
    );
    expect(d.allowed).toBe(true);
  });

  it('Test 8: tombstone äldre → stale_tombstone_revision', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-01-01T00:00:00Z' })), exp,
      local({ sourceUpdatedAt: '2026-05-01T00:00:00Z', sourceStatus: 'CONFIRMED' }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('stale_tombstone_revision');
  });

  it('Test 9: tombstone nyare → tillåts', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-06-01T00:00:00Z' })), exp,
      local({ sourceUpdatedAt: '2026-05-01T00:00:00Z', sourceStatus: 'CONFIRMED' }),
    );
    expect(d.allowed).toBe(true);
  });

  it('Test 12: lokal status saknas vid samma revision → fail-closed', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 7 })), exp,
      local({ sourceVersion: 7, sourceStatus: null }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('source_status_missing_for_equal_revision');
  });

  it('olika revisionstyper är fortfarande incomparable', () => {
    const c = compareRevisions([{ kind: 'version', value: 5 }], local({ sourceUpdatedAt: '2026-01-01T00:00:00Z', sourceStatus: 'CONFIRMED' }), 'CANCELLED');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('incomparable_source_revision');
  });
});

describe('STEG 2E – recordAppliedSourceRevision', () => {
  it('Test 13: normal canonical import loggar status och change_type', async () => {
    const inserts: any[] = [];
    const sb = makeSupabase([], { inserts });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG,
      revision: '2026-07-01T00:00:00Z', sourceStatus: 'confirmed',
    });
    expect(res.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].change_type).toBe('source_revision');
    expect(inserts[0].booking_id).toBe(BOOKING);
    expect(inserts[0].organization_id).toBe(ORG);
    expect(inserts[0].new_values.source_status).toBe('CONFIRMED');
    expect(typeof inserts[0].new_values.logged_at).toBe('string');
  });

  it('Test 14: samma revision loggas inte två gånger', async () => {
    const inserts: any[] = [];
    const sb = makeSupabase([{ id: 1, new_values: { source_revision: '2026-07-01T00:00:00Z' } }], { inserts });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG,
      revision: '2026-07-01T00:00:00Z', sourceStatus: 'CANCELLED', changeType: 'source_revision',
    });
    expect(res).toEqual({ ok: true, logged: false });
    expect(inserts).toHaveLength(0);
  });

  it('Test 15c: insertfel ger ok:false (→ partial, inget completed jobb)', async () => {
    const sb = makeSupabase([], { insertError: { message: 'boom' } });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 12, sourceStatus: 'CONFIRMED',
    });
    expect(res.ok).toBe(false);
  });

  it('icke revisionsbärande change_type nekas', async () => {
    const sb = makeSupabase([]);
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 1, sourceStatus: 'CONFIRMED', changeType: 'other',
    });
    expect(res.ok).toBe(false);
  });
});

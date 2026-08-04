/**
 * STEG 2D — Fail-closed revisions- och auditskydd kring canonical cancellation.
 *
 * Täcker obligatoriska tester 1–13.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  loadAppliedSourceRevision,
  recordAppliedSourceRevision,
} from '../../supabase/functions/_shared/appliedSourceRevision';
import {
  evaluateDestructiveAction,
  validateTombstoneRevision,
  type SingleBookingSourceResult,
} from '../../supabase/functions/_shared/singleBookingSource';
import { applyBookingCancellation } from '../../supabase/functions/_shared/cancellation-handler';
import { validateSingleBookingResult } from '../../supabase/functions/_shared/singleBookingResult';

const BOOKING = 'b-1';
const ORG = 'org-1';

function absent(tombstone: Record<string, unknown> | null): SingleBookingSourceResult {
  return {
    kind: 'absent',
    reason: 'cancelled',
    rawReason: 'cancelled',
    tombstone: tombstone as any,
  };
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

// ── Mockad supabase-klient ────────────────────────────────────────────────
type TableBehavior = {
  selectResult?: { data?: any[] | null; error?: any };
  insertResult?: { error?: any };
  updateResult?: { error?: any };
  deleteResult?: { error?: any };
  throwOnSelect?: boolean;
};

function makeSupabase(tables: Record<string, TableBehavior>, log?: { inserts: any[] }) {
  const get = (t: string) => tables[t] ?? {};
  return {
    from(table: string) {
      const b = get(table);
      const selectChain: any = {
        eq: () => selectChain,
        neq: () => selectChain,
        not: () => selectChain,
        in: () => selectChain,
        order: () => selectChain,
        limit: () => {
          if (b.throwOnSelect) throw new Error('boom');
          return Promise.resolve(b.selectResult ?? { data: [], error: null });
        },
        maybeSingle: () => Promise.resolve(b.selectResult ?? { data: null, error: null }),
        then: (res: any) => res(b.selectResult ?? { data: [], error: null }),
      };
      const mutChain = (result: any) => {
        const c: any = {
          eq: () => c,
          then: (res: any) => res(result ?? { error: null }),
        };
        return c;
      };
      return {
        select: () => selectChain,
        insert: (row: any) => {
          log?.inserts.push({ table, row });
          return Promise.resolve(b.insertResult ?? { error: null });
        },
        update: () => mutChain(b.updateResult ?? { error: null }),
        delete: () => mutChain(b.deleteResult ?? { error: null }),
      };
    },
  };
}

// ── Test 1 & 2: läsfel vs ingen revision ─────────────────────────────────
describe('loadAppliedSourceRevision — fail-closed load contract', () => {
  it('Test 1: databasfel ger ok:false och retrybart fel (ingen mutation möjlig)', async () => {
    const sb = makeSupabase({ booking_changes: { selectResult: { data: null, error: { message: 'permission denied' } } } });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.retriable).toBe(true);
      expect(res.error).toContain('booking_changes_read');
    }
  });

  it('Test 1b: exception ger ok:false, inte undefined', async () => {
    const sb = makeSupabase({ booking_changes: { throwOnSelect: true } });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
  });

  it('Test 2: ingen tidigare revision ger ok:true, found:false', async () => {
    const sb = makeSupabase({ booking_changes: { selectResult: { data: [], error: null } } });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res).toEqual({ ok: true, found: false, revision: null, revisions: [] });
  });

  it('parsingfel i lagrad revision döljs inte', async () => {
    const sb = makeSupabase({
      booking_changes: { selectResult: { data: [{ new_values: { source_revision: 'not-a-date' } }], error: null } },
    });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
  });

  it('hittad revision returneras som found:true', async () => {
    const sb = makeSupabase({
      booking_changes: { selectResult: { data: [{ new_values: { source_revision: '2026-01-02T00:00:00Z' } }], error: null } },
    });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
  });
});

// ── Test 3–8: tombstone-revisionsvalidering & jämförbarhet ───────────────
describe('tombstone revision validation', () => {
  const exp = { bookingId: BOOKING, organizationId: ORG };

  it('Test 3: source_updated_at "not-a-date" nekas', () => {
    const d = evaluateDestructiveAction(absent(tomb({ source_updated_at: 'not-a-date' })), exp, null);
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('tombstone_invalid_source_revision');
  });

  it('Test 4: tom/whitespace timestamp nekas', () => {
    for (const v of ['', '   ']) {
      const d = evaluateDestructiveAction(absent(tomb({ source_updated_at: v })), exp, null);
      expect(d.allowed).toBe(false);
    }
  });

  it('ogiltiga versioner nekas (NaN, Infinity, negativ, text)', () => {
    for (const v of [NaN, Infinity, -1, 'abc', '1.5']) {
      const d = evaluateDestructiveAction(absent(tomb({ source_version: v as any })), exp, null);
      expect(d.allowed).toBe(false);
      expect((d as any).reason).toBe('tombstone_invalid_source_revision');
    }
  });

  it('helt saknad revision nekas', () => {
    const r = validateTombstoneRevision(tomb({}) as any);
    expect(r.ok).toBe(false);
  });

  it('Test 5: giltig ISO-timestamp kan jämföras korrekt', () => {
    const newer = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-02-01T00:00:00Z' })),
      exp,
      { sourceUpdatedAt: '2026-01-01T00:00:00Z' },
    );
    expect(newer.allowed).toBe(true);

    const older = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2025-12-01T00:00:00Z' })),
      exp,
      { sourceUpdatedAt: '2026-01-01T00:00:00Z' },
    );
    expect(older.allowed).toBe(false);
    expect((older as any).reason).toBe('stale_tombstone_revision');
  });

  it('Test 6: numeriska versioner — äldre nekas, nyare tillåts, samma kräver statuskontroll (2E)', () => {
    expect(evaluateDestructiveAction(absent(tomb({ source_version: 4 })), exp, { sourceVersion: 5 }).allowed).toBe(false);
    // Samma revision utan känd lokal status är fail-closed sedan STEG 2E.
    expect(evaluateDestructiveAction(absent(tomb({ source_version: 5 })), exp, { sourceVersion: 5 }).allowed).toBe(false);
    expect(evaluateDestructiveAction(absent(tomb({ source_version: 5 })), exp, { sourceVersion: 5, sourceStatus: 'CANCELLED' }).allowed).toBe(true);
    expect(evaluateDestructiveAction(absent(tomb({ source_version: 6 })), exp, { sourceVersion: 5 }).allowed).toBe(true);
  });


  it('Test 7: tombstone timestamp mot lokal version = inkomparabel', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-02-01T00:00:00Z' })),
      exp,
      { sourceVersion: 5 },
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('incomparable_source_revision');
  });

  it('Test 8: tombstone version mot lokal timestamp = inkomparabel', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 7 })),
      exp,
      { sourceUpdatedAt: '2026-01-01T00:00:00Z' },
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('incomparable_source_revision');
  });

  it('Test 13: destructive-safe kräver giltig + jämförbar revision', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-03-01T00:00:00Z' })),
      exp,
      { sourceUpdatedAt: '2026-01-01T00:00:00Z' },
    );
    expect(d.allowed).toBe(true);
    expect((d as any).action).toBe('cancellation');
  });
});

// ── Test 9–11: audit read/insert i cancellation ─────────────────────────
describe('applyBookingCancellation — audit är säkerhetskritisk', () => {
  const existing = { id: BOOKING, organization_id: ORG, version: 1, status: 'CONFIRMED' };
  const source = { reason: 'cancelled', source_status: 'CANCELLED', source_revision: '2026-03-01T00:00:00Z' };

  it('Test 9: audit-read-fel → inte full cancelled', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = makeSupabase({ booking_changes: { selectResult: { data: null, error: { message: 'rls' } } } });
    const res = await applyBookingCancellation(sb, existing, source);
    expect(res.status).toBe('partial');
    expect(res.error).toContain('booking_changes_read');
    spy.mockRestore();
  });

  it('Test 10: audit-insert-fel → partial, jobbet blir inte completed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = makeSupabase({ booking_changes: { selectResult: { data: [], error: null }, insertResult: { error: { message: 'insert failed' } } } });
    const res = await applyBookingCancellation(sb, existing, source);
    expect(res.status).toBe('partial');

    // Call chain: partial → envelope outcome partial → jobbet blir inte completed
    const validation = validateSingleBookingResult(
      { success: false, queued: false, completed: false, sync_mode: 'single', booking_id: BOOKING, organization_id: ORG, outcome: 'partial' },
      { bookingId: BOOKING, organizationId: ORG },
      { ok: true, status: 200 },
    );
    expect(validation.ok).toBe(false);
    spy.mockRestore();
  });

  it('Test 11: revisionen finns redan → idempotent, ingen dubblett', async () => {
    const log = { inserts: [] as any[] };
    const sb = makeSupabase(
      { booking_changes: { selectResult: { data: [{ id: 'x', new_values: { source_revision: source.source_revision } }], error: null } } },
      log,
    );
    const res = await applyBookingCancellation(sb, existing, source);
    expect(res.status).toBe('cancelled');
    expect(log.inserts.filter((i) => i.table === 'booking_changes')).toHaveLength(0);
  });
});

// ── Test 12: cancellation jämförs mot senaste vanliga import ────────────
describe('normal canonical revision logging', () => {
  it('recordAppliedSourceRevision loggar revision (och är idempotent)', async () => {
    const log = { inserts: [] as any[] };
    const sb = makeSupabase({ booking_changes: { selectResult: { data: [], error: null } } }, log);
    const r = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING,
      organizationId: ORG,
      revision: '2026-05-01T00:00:00Z',
    });
    expect(r.ok).toBe(true);
    expect(log.inserts).toHaveLength(1);
    expect(log.inserts[0].row.change_type).toBe('source_revision');
  });

  it('insertfel rapporteras som ok:false', async () => {
    const sb = makeSupabase({ booking_changes: { selectResult: { data: [], error: null }, insertResult: { error: { message: 'nope' } } } });
    const r = await recordAppliedSourceRevision(sb, { bookingId: BOOKING, organizationId: ORG, revision: 5 });
    expect(r.ok).toBe(false);
  });

  it('Test 12: äldre cancellation-tombstone nekas mot nyare NORMAL import-revision', async () => {
    // Endast en vanlig source_revision-logg finns (ingen cancellation-logg alls).
    const sb = makeSupabase({
      booking_changes: {
        selectResult: { data: [{ new_values: { source_revision: '2026-05-01T00:00:00Z' } }], error: null },
      },
    });
    const load = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(load.ok && load.found).toBe(true);

    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-04-01T00:00:00Z' })),
      { bookingId: BOOKING, organizationId: ORG },
      load.ok && load.found ? load.revision : null,
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('stale_tombstone_revision');
  });
});

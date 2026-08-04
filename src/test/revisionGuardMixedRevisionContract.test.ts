/**
 * STEG 2F — Blandade revisionstyper är helt fail-closed.
 * Test 1–14 enligt uppgiften.
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

/** Historikrad. `values` läggs direkt i new_values. */
function rawRow(changeType: string, values: Record<string, unknown>, createdAt: string) {
  return { change_type: changeType, created_at: createdAt, new_values: values };
}
function tsRow(rev: string, status: string | null, createdAt: string) {
  return rawRow('source_revision', { source_revision: rev, source_status: status }, createdAt);
}
function verRow(rev: number, status: string | null, createdAt: string) {
  return rawRow('source_revision', { source_revision: rev, source_status: status }, createdAt);
}

const localOf = (o: Partial<LocalAppliedRevision>): LocalAppliedRevision[] => [{
  sourceUpdatedAt: null, sourceVersion: null, sourceStatus: null, changeType: null, ...o,
}];

describe('STEG 2F – authoritative revisionstyp', () => {
  it('Test 12: väljer inte timestamp bara för att den ligger först i arrayen', async () => {
    // Rad 0 = timestamp (äldre created_at), rad 1 = version (senare created_at).
    const sb = makeSupabase([
      tsRow('2026-01-01T00:00:00Z', 'CONFIRMED', '2026-01-01T00:00:00Z'),
      verRow(20, 'CONFIRMED', '2026-02-01T00:00:00Z'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    // Blandad historik (två olika typer från olika rader) → fail-closed.
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('mixed_incomparable_revision_history');
  });

  it('endast timestamp-historik → revisionKind timestamp', async () => {
    const sb = makeSupabase([
      tsRow('2026-01-05T10:00:00Z', 'CONFIRMED', '2026-01-05T10:00:00Z'),
      tsRow('2026-01-01T10:00:00Z', 'CONFIRMED', '2026-01-01T10:00:00Z'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) {
      expect(res.revisionKind).toBe('timestamp');
      expect(res.revision.sourceUpdatedAt).toBe('2026-01-05T10:00:00Z');
      expect(res.revisions).toHaveLength(1);
    }
  });

  it('endast versionshistorik → revisionKind version (senaste created_at vinner)', async () => {
    const sb = makeSupabase([
      verRow(20, 'CONFIRMED', '2026-02-01T00:00:00Z'),
      verRow(19, 'CONFIRMED', '2026-01-01T00:00:00Z'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) {
      expect(res.revisionKind).toBe('version');
      expect(res.revision.sourceVersion).toBe(20);
    }
  });

  it('en canonical rad med BÅDA värdena → revisionKind both', async () => {
    const sb = makeSupabase([
      rawRow('source_revision', {
        source_updated_at: '2026-03-01T00:00:00Z',
        source_version: 30,
        source_status: 'CONFIRMED',
      }, '2026-03-01T00:00:00Z'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) {
      expect(res.revisionKind).toBe('both');
      expect(res.revision.sourceUpdatedAt).toBe('2026-03-01T00:00:00Z');
      expect(res.revision.sourceVersion).toBe(30);
    }
  });

  it('typbyte gör inte äldre historik jämförbar', async () => {
    const sb = makeSupabase([
      rawRow('source_revision', { source_updated_at: '2026-04-02T00:00:00Z', source_version: 41, source_status: 'CONFIRMED' }, '2026-04-02T00:00:00Z'),
      verRow(40, 'CONFIRMED', '2026-04-01T00:00:00Z'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    // Äldre raden bär endast 'version' som authoritative också har → jämförbart.
    expect(res.ok && res.found).toBe(true);

    const sb2 = makeSupabase([
      verRow(41, 'CONFIRMED', '2026-04-02T00:00:00Z'),
      tsRow('2026-04-01T00:00:00Z', 'CONFIRMED', '2026-04-01T00:00:00Z'),
    ]);
    const res2 = await loadAppliedSourceRevision(sb2, BOOKING, ORG);
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.error).toBe('mixed_incomparable_revision_history');
  });

  it('Test 3: endast revisionsbärande change-types hämtas', async () => {
    const captured: any = {};
    const sb = makeSupabase([], { captured });
    await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(captured.in.col).toBe('change_type');
    expect(captured.in.vals).toEqual([...REVISION_BEARING_CHANGE_TYPES]);
  });

  it('Test 1/2: canonical revision hittas oavsett hur många rader som skapats efter', async () => {
    const rows = [
      tsRow('2026-05-10T00:00:00Z', 'CONFIRMED', '2026-05-10T00:00:00Z'),
      ...Array.from({ length: 99 }, (_, i) =>
        tsRow(`2026-05-0${(i % 9) + 1}T00:00:00Z`, 'CONFIRMED', `2026-05-0${(i % 9) + 1}T00:00:00Z`)),
    ];
    const sb = makeSupabase(rows);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) expect(res.revision.sourceUpdatedAt).toBe('2026-05-10T00:00:00Z');
  });

  it('Test 10: samma revision med motsägelsefull status → fail-closed', async () => {
    const sb = makeSupabase([
      rawRow('source_revision', { source_revision: '2026-02-01T00:00:00Z', source_status: 'CONFIRMED' }, '2026-02-01T00:00:00Z'),
      rawRow('cancellation_source', { source_revision: '2026-02-01T00:00:00Z', source_status: 'CANCELLED' }, '2026-02-01T00:00:01Z'),
    ]);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('conflicting_stored_source_revision');
  });

  it('Test 11: historiktak → fail-closed och INTE meningslöst retrybart', async () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      tsRow(`2026-06-01T00:00:${String(i % 60).padStart(2, '0')}Z`, 'CONFIRMED', `2026-06-01T00:00:${String(i % 60).padStart(2, '0')}Z`));
    const sb = makeSupabase(rows);
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('revision_history_truncated');
      expect(res.retriable).toBe(false);
    }
  });

  it('queryfel → fail-closed retrybart, oparsbar revision → permanent', async () => {
    const sb = makeSupabase([], { error: { message: 'denied' } });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retriable).toBe(true);

    const sb2 = makeSupabase([tsRow('not-a-date', 'CONFIRMED', '2026-01-01T00:00:00Z')]);
    const res2 = await loadAppliedSourceRevision(sb2, BOOKING, ORG);
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.retriable).toBe(false);
  });
});

describe('STEG 2F – ingen delvis jämförbarhet', () => {
  it('Test 1: endast timestamp lokalt + nyare timestamp-tombstone → tillåts', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-06-01T00:00:00Z' })), exp,
      localOf({ sourceUpdatedAt: '2026-05-01T00:00:00Z', sourceStatus: 'CONFIRMED' }),
    );
    expect(d.allowed).toBe(true);
  });

  it('Test 2: endast timestamp lokalt + tombstone med endast version → inkomparabel', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 99 })), exp,
      localOf({ sourceUpdatedAt: '2026-05-01T00:00:00Z', sourceStatus: 'CONFIRMED' }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('incomparable_source_revision');
  });

  it('Test 3: endast version lokalt + högre version → tillåts', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 21 })), exp,
      localOf({ sourceVersion: 20, sourceStatus: 'CONFIRMED' }),
    );
    expect(d.allowed).toBe(true);
  });

  it('Test 4: endast version lokalt + tombstone med endast timestamp → nekas', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-08-05T12:00:00Z' })), exp,
      localOf({ sourceVersion: 20, sourceStatus: 'CONFIRMED' }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('incomparable_source_revision');
  });

  it('Test 5: blandad lokal historik (ts + version från olika rader) + ts-tombstone → mixed', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-08-05T12:00:00Z' })), exp,
      [
        { sourceUpdatedAt: '2026-08-04T12:00:00Z', sourceVersion: null, sourceStatus: 'CONFIRMED' },
        { sourceUpdatedAt: null, sourceVersion: 20, sourceStatus: 'CONFIRMED' },
      ],
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('mixed_incomparable_revision_history');
  });

  it('Test 6: blandad lokal historik + version-tombstone → mixed, ingen mutation', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 21 })), exp,
      [
        { sourceUpdatedAt: '2026-08-04T12:00:00Z', sourceVersion: null, sourceStatus: 'CONFIRMED' },
        { sourceUpdatedAt: null, sourceVersion: 20, sourceStatus: 'CONFIRMED' },
      ],
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('mixed_incomparable_revision_history');
  });

  it('Test 7: lokal rad med BÅDA värdena kräver båda fälten i tombstonen', () => {
    const both: LocalAppliedRevision[] = [{
      sourceUpdatedAt: '2026-08-04T12:00:00Z', sourceVersion: 20, sourceStatus: 'CONFIRMED', changeType: 'source_revision',
    }];
    // Endast timestamp i tombstonen → nekas.
    const onlyTs = evaluateDestructiveAction(absent(tomb({ source_updated_at: '2026-08-05T12:00:00Z' })), exp, both);
    expect(onlyTs.allowed).toBe(false);
    expect((onlyTs as any).reason).toBe('incomparable_source_revision');
    // Endast version → nekas.
    const onlyVer = evaluateDestructiveAction(absent(tomb({ source_version: 21 })), exp, both);
    expect(onlyVer.allowed).toBe(false);
    // Båda och båda nyare → tillåts.
    const bothNewer = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-08-05T12:00:00Z', source_version: 21 })), exp, both);
    expect(bothNewer.allowed).toBe(true);
    // Båda men en är äldre → stale.
    const oneStale = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-08-05T12:00:00Z', source_version: 19 })), exp, both);
    expect(oneStale.allowed).toBe(false);
    expect((oneStale as any).reason).toBe('stale_tombstone_revision');
  });

  it('Test 13: ingen kodväg godkänner efter endast en delvis lyckad jämförelse', () => {
    const c = compareRevisions(
      [{ kind: 'timestamp', ms: Date.parse('2026-08-05T12:00:00Z') }],
      [{ sourceUpdatedAt: '2026-08-04T12:00:00Z', sourceVersion: 20, sourceStatus: 'CONFIRMED' }],
      'CANCELLED',
    );
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('incomparable_source_revision');
  });

  it('Test 10 (compare): samma revision CONFIRMED → conflicting_source_revision', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-04-01T00:00:00Z' })), exp,
      localOf({ sourceUpdatedAt: '2026-04-01T00:00:00Z', sourceStatus: 'CONFIRMED', changeType: 'source_revision' }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('conflicting_source_revision');
  });

  it('samma revision CANCELLED → idempotent tillåts', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_updated_at: '2026-04-01T00:00:00Z' })), exp,
      localOf({ sourceUpdatedAt: '2026-04-01T00:00:00Z', sourceStatus: 'CANCELLED', changeType: 'cancellation_source' }),
    );
    expect(d.allowed).toBe(true);
  });

  it('saknad lokal status vid samma revision → fail-closed', () => {
    const d = evaluateDestructiveAction(
      absent(tomb({ source_version: 7 })), exp,
      localOf({ sourceVersion: 7, sourceStatus: null }),
    );
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toBe('source_status_missing_for_equal_revision');
  });
});

describe('STEG 2F – recordAppliedSourceRevision', () => {
  it('Test 8: samma revision + samma status → idempotent, ingen dubblett', async () => {
    const inserts: any[] = [];
    const sb = makeSupabase(
      [{ id: 1, new_values: { source_revision: '2026-07-01T00:00:00Z', source_status: 'CONFIRMED' } }],
      { inserts },
    );
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: '2026-07-01T00:00:00Z', sourceStatus: 'CONFIRMED',
    });
    expect(res).toEqual({ ok: true, logged: false, already_current: true });
    expect(inserts).toHaveLength(0);
  });

  it('Test 9: samma revision men annan status → conflicting_source_status_for_revision', async () => {
    const inserts: any[] = [];
    const sb = makeSupabase(
      [{ id: 1, new_values: { source_revision: '2026-07-01T00:00:00Z', source_status: 'CONFIRMED' } }],
      { inserts },
    );
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: '2026-07-01T00:00:00Z', sourceStatus: 'OFFER',
    });
    expect(res).toEqual({ ok: false, error: 'conflicting_source_status_for_revision' });
    expect(inserts).toHaveLength(0);
  });

  it('lagrad rad utan status → fail-closed', async () => {
    const sb = makeSupabase([{ id: 1, new_values: { source_revision: 12 } }]);
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 12, sourceStatus: 'CONFIRMED',
    });
    expect(res).toEqual({ ok: false, error: 'stored_revision_missing_source_status' });
  });

  it('canonical status saknas i inputen → loggas inte', async () => {
    const inserts: any[] = [];
    const sb = makeSupabase([], { inserts });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 12, sourceStatus: null,
    });
    expect(res).toEqual({ ok: false, error: 'missing_canonical_source_status_for_revision' });
    expect(inserts).toHaveLength(0);
  });

  it('normal canonical import loggar booking/org/revision/status/change_type/logged_at', async () => {
    const inserts: any[] = [];
    const sb = makeSupabase([], { inserts });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: '2026-07-01T00:00:00Z', sourceStatus: 'confirmed',
    });
    expect(res).toEqual({ ok: true, logged: true });
    expect(inserts[0].booking_id).toBe(BOOKING);
    expect(inserts[0].organization_id).toBe(ORG);
    expect(inserts[0].change_type).toBe('source_revision');
    expect(inserts[0].new_values.source_status).toBe('CONFIRMED');
    expect(typeof inserts[0].new_values.logged_at).toBe('string');
  });
});

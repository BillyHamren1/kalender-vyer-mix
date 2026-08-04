/**
 * STEG 2G — Dedikerat fält på bokningen är authoritative revisionskälla.
 * booking_changes används endast som fallback/audit.
 */
import { describe, it, expect } from 'vitest';
import {
  loadAppliedSourceRevision,
  recordAppliedSourceRevision,
  DEDICATED_REVISION_COLUMN,
} from '../../supabase/functions/_shared/appliedSourceRevision';

const BOOKING = 'b-1';
const ORG = 'org-1';

/** Mock med stöd för både bookings (maybeSingle/update) och booking_changes. */
function makeSupabase(opts: {
  dedicated?: any;
  dedicatedError?: any;
  changeRows?: any[];
  updates?: any[];
  inserts?: any[];
} = {}) {
  return {
    from(table: string) {
      if (table === 'bookings') {
        const chain: any = {
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: opts.dedicatedError ? null : { [DEDICATED_REVISION_COLUMN]: opts.dedicated ?? null },
              error: opts.dedicatedError ?? null,
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
      const chain: any = {
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: opts.changeRows ?? [], error: null }),
      };
      return {
        select: () => chain,
        insert: (row: any) => {
          opts.inserts?.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

describe('STEG 2G – dedikerat fält som revisionskälla', () => {
  it('läser revisionen från bookings-fältet utan att röra historiken', async () => {
    const sb = makeSupabase({
      dedicated: { source_updated_at: '2026-07-01T00:00:00Z', source_version: null, source_status: 'CONFIRMED' },
      changeRows: [{ change_type: 'source_revision', created_at: '2020-01-01T00:00:00Z', new_values: { source_revision: 1, source_status: 'OFFER' } }],
    });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) {
      expect(res.revisionKind).toBe('timestamp');
      expect(res.revision.sourceUpdatedAt).toBe('2026-07-01T00:00:00Z');
      expect(res.revision.sourceStatus).toBe('CONFIRMED');
    }
  });

  it('both-fallet är naturligt när fältet bär både timestamp och version', async () => {
    const sb = makeSupabase({
      dedicated: { source_updated_at: '2026-07-01T00:00:00Z', source_version: 7, source_status: 'CONFIRMED' },
    });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found && res.revisionKind).toBe('both');
    if (res.ok && res.found) expect(res.revision.sourceVersion).toBe(7);
  });

  it('inget historik-tak: 500 gamla rader spelar ingen roll när fältet finns', async () => {
    const changeRows = Array.from({ length: 500 }, (_, i) => ({
      change_type: 'source_revision',
      created_at: '2020-01-01T00:00:00Z',
      new_values: { source_revision: i + 1 },
    }));
    const sb = makeSupabase({
      dedicated: { source_version: 42, source_status: 'CONFIRMED' },
      changeRows,
    });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) expect(res.revision.sourceVersion).toBe(42);
  });

  it('trasigt fältvärde → fail-closed och permanent', async () => {
    const sb = makeSupabase({ dedicated: { source_updated_at: 'inte-ett-datum', source_status: 'CONFIRMED' } });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res).toMatchObject({ ok: false, error: 'dedicated_revision_unparseable', retriable: false });
  });

  it('fält utan status → fail-closed', async () => {
    const sb = makeSupabase({ dedicated: { source_version: 3 } });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res).toMatchObject({ ok: false, error: 'dedicated_revision_missing_source_status' });
  });

  it('tomt fält → fallback till booking_changes-historiken', async () => {
    const sb = makeSupabase({
      dedicated: null,
      changeRows: [{ change_type: 'source_revision', created_at: '2026-01-01T00:00:00Z', new_values: { source_revision: 5, source_status: 'CONFIRMED' } }],
    });
    const res = await loadAppliedSourceRevision(sb, BOOKING, ORG);
    expect(res.ok && res.found).toBe(true);
    if (res.ok && res.found) expect(res.revision.sourceVersion).toBe(5);
  });

  it('record skriver det dedikerade fältet och loggar audit', async () => {
    const updates: any[] = [];
    const inserts: any[] = [];
    const sb = makeSupabase({ updates, inserts, changeRows: [] });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: '2026-07-01T00:00:00Z', sourceStatus: 'confirmed',
    });
    expect(res.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0][DEDICATED_REVISION_COLUMN]).toMatchObject({
      source_updated_at: '2026-07-01T00:00:00Z',
      source_version: null,
      source_status: 'CONFIRMED',
      change_type: 'source_revision',
    });
    expect(inserts).toHaveLength(1);
  });

  it('historisk rad utan source_status blockerar INTE när fältet skrivits', async () => {
    const updates: any[] = [];
    const sb = makeSupabase({
      updates,
      dedicated: { source_version: 12, source_status: 'CONFIRMED' },
      changeRows: [{ id: 1, created_at: '2026-07-01T00:00:00Z', change_type: 'source_revision', new_values: { source_revision: 12 } }],
    });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 12, sourceStatus: 'CONFIRMED',
    });
    // STEG 2G: samma revision + samma status är idempotent redan i monotonikontrollen.
    expect(res).toEqual({ ok: true, logged: false, already_current: true });
    expect(updates).toHaveLength(0);
  });

  it('motsägelsefull status på samma revision är fortfarande fail-closed', async () => {
    const sb = makeSupabase({
      changeRows: [{ id: 1, created_at: '2026-07-01T00:00:00Z', change_type: 'source_revision', new_values: { source_revision: 12, source_status: 'OFFER' } }],
    });
    const res = await recordAppliedSourceRevision(sb, {
      bookingId: BOOKING, organizationId: ORG, revision: 12, sourceStatus: 'CONFIRMED',
    });
    expect(res).toEqual({ ok: false, error: 'conflicting_source_status_for_revision' });
  });
});

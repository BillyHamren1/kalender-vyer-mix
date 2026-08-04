/**
 * STEG 2C — mutationstester.
 *
 * Bevisar databasens FÖRE/EFTER-tillstånd:
 *  - icke-destruktiva source-resultat rör ingenting
 *  - canonical cancellation muterar exakt definierad mängd tabeller
 *  - alla destruktiva queries är organisationsisolerade
 *  - partiell cleanup rapporteras aldrig som full success
 *  - stale tombstone blockeras
 */
import { describe, it, expect } from 'vitest';
import {
  parseSingleBookingSourceResponse,
  evaluateDestructiveAction,
} from '../../supabase/functions/_shared/singleBookingSource';
import { applyBookingCancellation } from '../../supabase/functions/_shared/cancellation-handler';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const BID = 'booking-1';

type Op = {
  table: string;
  kind: 'select' | 'update' | 'delete' | 'insert';
  filters: Record<string, unknown>;
  payload?: unknown;
};

function makeSupabase(opts: { failTables?: string[]; rows?: Record<string, any[]> } = {}) {
  const ops: Op[] = [];
  const fail = new Set(opts.failTables ?? []);
  const rows = opts.rows ?? {};

  function builder(table: string, kind: Op['kind'], payload?: unknown) {
    const op: Op = { table, kind, filters: {}, payload };
    const result: any = {
      eq(col: string, val: unknown) { op.filters[col] = val; return result; },
      neq() { return result; },
      not() { return result; },
      order() { return result; },
      limit() { ops.push(op); return Promise.resolve(response()); },
      maybeSingle() { ops.push(op); return Promise.resolve(response()); },
      then(res: any, rej: any) { ops.push(op); return Promise.resolve(response()).then(res, rej); },
    };
    function response() {
      if (kind !== 'select' && fail.has(table)) {
        return { data: null, error: { message: `${table} failed` } };
      }
      return { data: rows[table] ?? [], error: null };
    }
    return result;
  }

  const supabase = {
    from(table: string) {
      return {
        select: () => builder(table, 'select'),
        update: (payload: unknown) => builder(table, 'update', payload),
        delete: () => builder(table, 'delete'),
        insert: (payload: unknown) => {
          const op: Op = { table, kind: 'insert', filters: {}, payload };
          ops.push(op);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { supabase, ops };
}

const existing = {
  id: BID,
  version: 3,
  status: 'CONFIRMED',
  organization_id: ORG,
  assigned_to_project: true,
  assigned_project_id: 'p1',
  assigned_project_name: 'P1',
};

const NON_DESTRUCTIVE_PAYLOADS: Array<[string, unknown]> = [
  ['not_found', { success: true, mode: 'single', found: false, reason: 'not_found' }],
  ['not_exportable', { success: true, mode: 'single', found: false, reason: 'not_exportable' }],
  ['archived', { success: true, mode: 'single', found: false, reason: 'archived' }],
  ['organization_mismatch', { success: true, mode: 'single', found: false, reason: 'organization_mismatch' }],
  ['unknown reason', { success: true, mode: 'single', found: false, reason: 'whatever_new' }],
  ['empty legacy array', { data: [] }],
  ['empty top-level array-ish', { bookings: [] }],
  ['cancelled utan tombstone', { success: true, mode: 'single', found: false, reason: 'cancelled' }],
  ['cancelled tombstone utan revision', {
    success: true, mode: 'single', found: false, reason: 'cancelled',
    tombstone: { booking_id: BID, organization_id: ORG, source_status: 'CANCELLED' },
  }],
  ['cancelled tombstone fel org', {
    success: true, mode: 'single', found: false, reason: 'cancelled',
    tombstone: { booking_id: BID, organization_id: OTHER_ORG, source_status: 'CANCELLED', source_updated_at: '2026-08-01T10:00:00Z' },
  }],
  ['cancelled tombstone fel booking', {
    success: true, mode: 'single', found: false, reason: 'cancelled',
    tombstone: { booking_id: 'other', organization_id: ORG, source_status: 'CANCELLED', source_updated_at: '2026-08-01T10:00:00Z' },
  }],
  ['cancelled tombstone fel status', {
    success: true, mode: 'single', found: false, reason: 'cancelled',
    tombstone: { booking_id: BID, organization_id: ORG, source_status: 'CONFIRMED', source_updated_at: '2026-08-01T10:00:00Z' },
  }],
];

function decide(payload: unknown, http = { ok: true, status: 200 }, local?: any) {
  const parsed = parseSingleBookingSourceResponse(payload, { bookingId: BID, organizationId: ORG }, http);
  return { parsed, decision: evaluateDestructiveAction(parsed, { bookingId: BID, organizationId: ORG }, local) };
}

describe('icke-destruktiva source-resultat', () => {
  it.each(NON_DESTRUCTIVE_PAYLOADS)('%s → ingen destructive action', (_label, payload) => {
    const { decision } = decide(payload);
    expect(decision.allowed).toBe(false);
  });

  it.each([404, 500, 408, 429, 403])('HTTP %s → tekniskt fel, ingen action', (status) => {
    const { parsed, decision } = decide({ any: 'thing' }, { ok: false, status });
    expect(parsed.kind).toBe('error');
    expect(decision.allowed).toBe(false);
  });

  it('parsingfel (ogiltig body) är icke-destruktivt och retribart', () => {
    const { parsed, decision } = decide('not json' as unknown);
    expect(parsed).toMatchObject({ kind: 'error', retriable: true });
    expect(decision.allowed).toBe(false);
  });

  it('stale tombstone (äldre revision än applicerad) blockeras', () => {
    const payload = {
      success: true, mode: 'single', found: false, reason: 'cancelled',
      tombstone: { booking_id: BID, organization_id: ORG, source_status: 'CANCELLED', source_updated_at: '2026-07-01T10:00:00Z' },
    };
    const fresh = decide(payload);
    expect(fresh.decision.allowed).toBe(true);
    const stale = decide(payload, { ok: true, status: 200 }, { sourceUpdatedAt: '2026-08-01T10:00:00Z' });
    expect(stale.decision).toMatchObject({ allowed: false, reason: 'stale_tombstone_revision' });
  });

  it('stale numerisk revision blockeras', () => {
    const payload = {
      success: true, mode: 'single', found: false, reason: 'cancelled',
      tombstone: { booking_id: BID, organization_id: ORG, source_status: 'CANCELLED', source_version: 4 },
    };
    expect(decide(payload, { ok: true, status: 200 }, { sourceVersion: 9 }).decision.allowed).toBe(false);
    expect(decide(payload, { ok: true, status: 200 }, { sourceVersion: 2 }).decision.allowed).toBe(true);
  });
});

describe('canonical cancellation — exakta mutationer', () => {
  it('muterar endast definierade tabeller, alltid org-isolerat', async () => {
    const { supabase, ops } = makeSupabase();
    const res = await applyBookingCancellation(supabase, existing, {
      reason: 'cancelled',
      source_status: 'CANCELLED',
      source_revision: '2026-08-01T10:00:00Z',
      organization_id: ORG,
    });

    expect(res.status).toBe('cancelled');

    const mutations = ops.filter((o) => o.kind !== 'select');
    const mutatedTables = [...new Set(mutations.map((o) => o.table))].sort();
    expect(mutatedTables).toEqual([
      'booking_changes',
      'booking_products',
      'bookings',
      'calendar_events',
      'jobs',
      'packing_projects',
      'projects',
      'warehouse_calendar_events',
    ]);

    // Varje läs- och skrivoperation är organisationsisolerad.
    for (const op of ops) {
      if (op.kind === 'insert') {
        expect((op.payload as any).organization_id).toBe(ORG);
      } else {
        expect(op.filters.organization_id).toBe(ORG);
      }
    }

    // Bokningen sätts till CANCELLED, historik/version bevaras.
    const bookingUpdate = mutations.find((o) => o.table === 'bookings')!;
    expect(bookingUpdate.payload).toMatchObject({ status: 'CANCELLED', version: 4 });

    // Ingen bred delete utan booking-filter.
    for (const op of mutations.filter((o) => o.kind === 'delete')) {
      expect(op.filters.booking_id).toBe(BID);
    }
  });

  it('utan organization_id sker INGEN mutation', async () => {
    const { supabase, ops } = makeSupabase();
    const res = await applyBookingCancellation(supabase, { ...existing, organization_id: null });
    expect(res.status).toBe('error');
    expect(res.error).toBe('organization_id_required_for_cancellation');
    expect(ops).toHaveLength(0);
  });

  it('misslyckad bookings-update avbryter före cleanup', async () => {
    const { supabase, ops } = makeSupabase({ failTables: ['bookings'] });
    const res = await applyBookingCancellation(supabase, existing);
    expect(res.status).toBe('error');
    expect(ops.filter((o) => o.kind === 'delete')).toHaveLength(0);
  });

  it('partiell cleanup rapporteras som partial, aldrig success', async () => {
    const { supabase } = makeSupabase({ failTables: ['packing_projects'] });
    const res = await applyBookingCancellation(supabase, existing);
    expect(res.status).toBe('partial');
    expect(res.error).toContain('packing_projects');
    expect(res.packing_deleted).toBe(false);
  });

  it('idempotens: audit loggas inte två gånger för samma revision', async () => {
    const { supabase, ops } = makeSupabase({
      rows: { booking_changes: [{ id: 'x', new_values: { source_revision: '2026-08-01T10:00:00Z' } }] },
    });
    const res = await applyBookingCancellation(supabase, existing, {
      reason: 'cancelled',
      source_status: 'CANCELLED',
      source_revision: '2026-08-01T10:00:00Z',
      organization_id: ORG,
    });
    expect(res.source_logged).toBe(false);
    expect(ops.filter((o) => o.table === 'booking_changes' && o.kind === 'insert')).toHaveLength(0);
  });
});

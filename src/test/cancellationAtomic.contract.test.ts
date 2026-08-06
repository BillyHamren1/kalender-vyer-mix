/**
 * STEG 2J — cancellation-cleanup är atomisk i databasen.
 *
 * Test 1–16: RPC-kontraktet (statisk SQL-granskning) + edge-handlerns
 * beteende när databasen svarar med olika outcomes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyBookingCancellation,
  splitSourceRevision,
} from '../../supabase/functions/_shared/cancellation-handler';

// Flaggan måste vara PÅ för att testa den atomiska handlerns beteende.
// (Blockeringen när flaggan är AV testas i automaticDestructiveSyncFlag.contract.test.ts.)
beforeAll(() => {
  (globalThis as any).Deno = { env: { get: (k: string) => (k === 'AUTOMATIC_DESTRUCTIVE_SYNC_ENABLED' ? 'true' : undefined) } };
});
afterAll(() => { delete (globalThis as any).Deno; });


const ORG = '11111111-1111-1111-1111-111111111111';
const BID = 'booking-1';
const REV = '2026-08-01T10:00:00Z';

const existing = { id: BID, version: 3, status: 'CONFIRMED', organization_id: ORG };
const evidence = { reason: 'cancelled', source_status: 'CANCELLED', source_revision: REV, organization_id: ORG };

function rpcSupabase(reply: any, opts: { error?: any; throws?: boolean } = {}) {
  const calls: any[] = [];
  return {
    calls,
    from() { throw new Error('handler must not touch tables directly'); },
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (opts.throws) throw new Error('network down');
      if (opts.error) return { data: null, error: opts.error };
      return { data: reply, error: null };
    },
  } as any;
}

const okReply = {
  success: true, outcome: 'cancelled', booking_id: BID, organization_id: ORG, source_revision: REV,
  mutations: { bookings: 1, calendar_events: 3, warehouse_events: 1, projects: 1, jobs: 0, packing_projects: 1, booking_products: 12, audit: 1 },
};

// ── SQL-kontraktet ────────────────────────────────────────────────────────
const MIGDIR = path.join(process.cwd(), 'supabase/migrations');
const SQL = fs.readdirSync(MIGDIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(MIGDIR, f), 'utf8'))
  .filter((s) => s.includes('apply_booking_cancellation_atomic'))
  .join('\n');

describe('STEG 2J – atomisk RPC (SQL-kontrakt)', () => {
  it('Test 1: funktionen finns, är SECURITY DEFINER med låst search_path', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.apply_booking_cancellation_atomic');
    expect(SQL).toContain('SECURITY DEFINER');
    expect(SQL).toContain('SET search_path = public');
  });

  it('Test 2: alla åtta sido-effekter körs i samma funktion', () => {
    for (const frag of [
      'UPDATE public.bookings',
      'DELETE FROM public.calendar_events',
      'DELETE FROM public.warehouse_calendar_events',
      'UPDATE public.projects',
      'UPDATE public.jobs',
      'DELETE FROM public.packing_projects',
      'DELETE FROM public.booking_products',
      'INSERT INTO public.booking_changes',
      'UPDATE public.booking_source_state',
    ]) expect(SQL).toContain(frag);
  });

  it('Test 3: mutationerna ligger i en subtransaktion med full rollback', () => {
    expect(SQL).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]*'outcome', 'failed'/);
    expect(SQL).toContain("'sqlstate', SQLSTATE");
  });

  it('Test 4: manuella aktiviteter och to-dos raderas aldrig', () => {
    expect(SQL).toContain('AND todo_id IS NULL');
    expect(SQL).toContain("coalesce(event_type, '') NOT IN ('activity', 'todo')");
  });

  it('Test 5: varje mutation är org- och bokningsisolerad', () => {
    // Senaste definitionen är den auktoritativa (tidigare versioner + backfill ignoreras).
    const body = SQL.slice(SQL.lastIndexOf('CREATE OR REPLACE FUNCTION public.apply_booking_cancellation_atomic'));
    const stmts = body.split(/(?=DELETE FROM public\.|UPDATE public\.)/).filter((s) => /^(DELETE FROM|UPDATE) public\./.test(s));
    for (const s of stmts) {
      const head = s.slice(0, s.indexOf(';'));
      if (head.includes('booking_source_state')) {
        expect(head).toContain('organization_id = p_organization_id');
        expect(head).toContain('booking_id = p_booking_id');
        continue;
      }
      expect(head).toContain('organization_id = p_organization_id');
      expect(head).toMatch(/booking_id = p_booking_id|id = p_booking_id/);
    }
    expect(stmts.length).toBeGreaterThanOrEqual(7);
  });

  it('Test 6: radlås serialiserar samtidiga anrop per bokning', () => {
    expect(SQL).toContain('FROM public.booking_source_state');
    expect(SQL).toContain('FOR UPDATE');
  });

  it('Test 7: lease-ägarskap kontrolleras i databasen', () => {
    for (const o of ['reservation_lost', 'invalid_reservation_token', 'reservation_expired', 'reservation_mismatch']) {
      expect(SQL).toContain(`'${o}'`);
    }
  });

  it('Test 8: revisionsskyddet är fail-closed (stale/konflikt/watermark)', () => {
    expect(SQL).toContain("'stale_revision'");
    expect(SQL).toContain("'revision_conflict'");
    expect(SQL).toContain('highest_seen_source_updated_at');
    expect(SQL).toContain('incomparable_source_revision');
  });

  it('Test 9: idempotens — samma revision ger already_cancelled utan mutation', () => {
    const idx = SQL.indexOf("'already_cancelled'");
    expect(idx).toBeGreaterThan(-1);
    expect(SQL.indexOf('UPDATE public.bookings')).toBeGreaterThan(idx);
    expect(SQL).toContain("change_type = 'cancellation_source'");
  });

  it('Test 10: endast service_role får köra funktionen', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.apply_booking_cancellation_atomic');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.apply_booking_cancellation_atomic(uuid, text, text, timestamptz, bigint, text, uuid) TO service_role');
  });

  it('Test 11: avslutade projekt/jobb bevaras (soft-cancel bara aktiva)', () => {
    expect(SQL).toMatch(/UPDATE public\.projects[\s\S]*status NOT IN \('cancelled', 'completed'\)/);
    expect(SQL).toMatch(/UPDATE public\.jobs[\s\S]*status NOT IN \('cancelled', 'completed'\)/);
  });
});

// ── Handlerns beteende ────────────────────────────────────────────────────
describe('STEG 2J – edge-handlern delegerar till RPC:n', () => {
  it('Test 12: handlern gör inga egna tabellmutationer', async () => {
    const sb = rpcSupabase(okReply);
    const res = await applyBookingCancellation(sb, existing, evidence);
    expect(res.status).toBe('cancelled');
    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0].fn).toBe('apply_booking_cancellation_atomic');
    expect(sb.calls[0].args).toMatchObject({
      p_organization_id: ORG,
      p_booking_id: BID,
      p_source_status: 'CANCELLED',
      p_source_updated_at: REV,
      p_source_version: null,
    });
    expect(res.mutations).toMatchObject({ booking_products: 12 });
    expect(res.source_logged).toBe(true);
  });

  it('Test 13: already_cancelled → skipped, ingen dubbellogg', async () => {
    const sb = rpcSupabase({ success: true, outcome: 'already_cancelled', already_current: true });
    const res = await applyBookingCancellation(sb, existing, evidence);
    expect(res.status).toBe('skipped_already_cancelled');
    expect(res.source_logged).toBe(false);
  });

  it.each(['stale_revision', 'revision_conflict', 'reservation_lost', 'reservation_expired', 'reservation_mismatch', 'not_found', 'failed'])(
    'Test 14: %s → error, aldrig cancelled',
    async (outcome) => {
      const sb = rpcSupabase({ success: false, outcome });
      const res = await applyBookingCancellation(sb, existing, evidence);
      expect(res.status).toBe('error');
      expect(res.outcome).toBe(outcome);
    },
  );

  it('Test 15: RPC-fel/undantag/tomt svar → error (fail-closed)', async () => {
    expect((await applyBookingCancellation(rpcSupabase(null, { error: { message: 'boom' } }), existing, evidence)).status).toBe('error');
    expect((await applyBookingCancellation(rpcSupabase(null, { throws: true }), existing, evidence)).status).toBe('error');
    const empty = await applyBookingCancellation(rpcSupabase(null), existing, evidence);
    expect(empty).toMatchObject({ status: 'error', error: 'empty_rpc_result' });
  });

  it('Test 16: saknad org eller revision blockerar anropet helt', async () => {
    const sb = rpcSupabase(okReply);
    const noOrg = await applyBookingCancellation(sb, { ...existing, organization_id: null });
    expect(noOrg).toMatchObject({ status: 'error', error: 'organization_id_required_for_cancellation' });
    const noRev = await applyBookingCancellation(sb, existing);
    expect(noRev).toMatchObject({ status: 'error', error: 'missing_source_revision' });
    expect(sb.calls).toHaveLength(0);

    // Revisionstypen härleds korrekt.
    expect(splitSourceRevision({ reason: 'c', source_status: 'CANCELLED', source_revision: 42 }))
      .toEqual({ sourceUpdatedAt: null, sourceVersion: 42 });
    expect(splitSourceRevision({ reason: 'c', source_status: 'CANCELLED', source_revision: REV }))
      .toEqual({ sourceUpdatedAt: REV, sourceVersion: null });
  });
});

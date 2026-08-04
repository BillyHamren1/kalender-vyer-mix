import { describe, it, expect } from 'vitest';
import {
  parseSingleBookingSourceResponse,
  evaluateDestructiveAction,
  DESTRUCTIVE_REASONS,
} from '../../supabase/functions/_shared/singleBookingSource';
import { applyBookingCancellation } from '../../supabase/functions/_shared/cancellation-handler';
import { validateSingleBookingResult, buildSingleBookingEnvelope } from '../../supabase/functions/_shared/singleBookingResult';

const expected = { bookingId: '2602-13', organizationId: 'org-1' };

const found = (status: string) => ({
  success: true,
  mode: 'single',
  found: true,
  booking_id: '2602-13',
  organization_id: 'org-1',
  source_status: status,
  source_updated_at: '2026-08-01T10:00:00Z',
  booking: { id: '2602-13', organization_id: 'org-1', status },
});

const absent = (reason: string, tombstone?: unknown) => ({
  success: true,
  mode: 'single',
  found: false,
  reason,
  ...(tombstone !== undefined ? { tombstone } : {}),
});

const goodTombstone = {
  booking_id: '2602-13',
  organization_id: 'org-1',
  source_status: 'CANCELLED',
  source_updated_at: '2026-08-01T10:00:00Z',
};

const parse = (p: unknown, http?: { ok: boolean; status: number }) =>
  parseSingleBookingSourceResponse(p, expected, http);
const decide = (p: unknown, http?: { ok: boolean; status: number }) =>
  evaluateDestructiveAction(parse(p, http), expected);

describe('single booking source contract — Planning side', () => {
  it('TEST 1: found + CONFIRMED → applied normally, no cleanup', () => {
    const r = parse(found('CONFIRMED'));
    expect(r.kind).toBe('found');
    expect(r.kind === 'found' && r.sourceStatus).toBe('CONFIRMED');
    expect(decide(found('CONFIRMED'))).toEqual({ allowed: false, reason: 'booking_found_no_cleanup' });
  });

  it('TEST 2: found + OFFER → canonical offer status, no cancellation derived', () => {
    const r = parse(found('OFFER'));
    expect(r.kind === 'found' && r.sourceStatus).toBe('OFFER');
    expect(decide(found('OFFER')).allowed).toBe(false);
  });

  it('TEST 3: explicit not_found → no destructive cleanup', () => {
    const r = parse(absent('not_found'));
    expect(r).toMatchObject({ kind: 'absent', reason: 'not_found', tombstone: null });
    expect(decide(absent('not_found'))).toEqual({
      allowed: false,
      reason: 'non_destructive_reason_not_found',
    });
  });

  it('TEST 4: not_exportable → no destructive cleanup', () => {
    expect(decide(absent('not_exportable'))).toEqual({
      allowed: false,
      reason: 'non_destructive_reason_not_exportable',
    });
  });

  it('TEST 5: unknown reason → normalized to unknown, never destructive', () => {
    const r = parse(absent('some_new_reason', goodTombstone));
    expect(r).toMatchObject({ kind: 'absent', reason: 'unknown', rawReason: 'some_new_reason' });
    expect(decide(absent('some_new_reason', goodTombstone)).allowed).toBe(false);
  });

  it('TEST 6: canonical cancelled tombstone → cancellation allowed once', () => {
    const d = decide(absent('cancelled', goodTombstone));
    expect(d).toMatchObject({ allowed: true, action: 'cancellation' });
  });

  it('TEST 7: tombstone with wrong booking id → blocked', () => {
    const d = decide(absent('cancelled', { ...goodTombstone, booking_id: '9999-1' }));
    expect(d).toEqual({ allowed: false, reason: 'tombstone_booking_id_mismatch' });
  });

  it('TEST 8: tombstone with wrong organization id → blocked', () => {
    const d = decide(absent('cancelled', { ...goodTombstone, organization_id: 'org-2' }));
    expect(d).toEqual({ allowed: false, reason: 'tombstone_organization_id_mismatch' });
  });

  it('TEST 9: tombstone without source revision → blocked', () => {
    const { source_updated_at: _s, ...noRev } = goodTombstone;
    expect(decide(absent('cancelled', noRev))).toEqual({
      allowed: false,
      reason: 'tombstone_missing_source_revision',
    });
    expect(decide(absent('cancelled'))).toEqual({ allowed: false, reason: 'missing_tombstone' });
  });

  it('TEST 9b: tombstone status must match reason', () => {
    expect(decide(absent('cancelled', { ...goodTombstone, source_status: 'CONFIRMED' }))).toEqual({
      allowed: false,
      reason: 'tombstone_status_reason_mismatch',
    });
  });

  it('TEST 10: HTTP 500 → retriable technical error, no cleanup', () => {
    const r = parse(null, { ok: false, status: 500 });
    expect(r).toMatchObject({ kind: 'error', retriable: true, code: 'http_500' });
    expect(decide(null, { ok: false, status: 500 }).allowed).toBe(false);
  });

  it('TEST 11: timeout (408/429) → retriable, no cleanup', () => {
    expect(parse(null, { ok: false, status: 408 })).toMatchObject({ kind: 'error', retriable: true });
    expect(parse(null, { ok: false, status: 429 })).toMatchObject({ kind: 'error', retriable: true });
    expect(decide(null, { ok: false, status: 408 }).allowed).toBe(false);
  });

  it('TEST 12: invalid json body → error, no cleanup', () => {
    expect(parse('not-json')).toMatchObject({ kind: 'error', code: 'invalid_json_body' });
    expect(decide('not-json').allowed).toBe(false);
  });

  it('TEST 13: unexpected empty legacy array in single mode → contract error', () => {
    const r = parse({ data: [] });
    expect(r).toMatchObject({
      kind: 'error',
      retriable: true,
      code: 'legacy_empty_array_in_single_mode',
    });
    expect(decide({ data: [] }).allowed).toBe(false);
  });

  it('rejects found payloads with mismatched ids and success:false', () => {
    expect(parse({ ...found('CONFIRMED'), booking_id: 'x' })).toMatchObject({ kind: 'error', retriable: false });
    expect(parse({ ...found('CONFIRMED'), organization_id: 'org-2' })).toMatchObject({ kind: 'error' });
    expect(parse({ ...found('CONFIRMED'), success: false })).toMatchObject({ kind: 'error', retriable: true });
    expect(parse({ ...found('CONFIRMED'), booking: null })).toMatchObject({ kind: 'error' });
  });

  it('allowlist contains only cancelled and deleted', () => {
    expect([...DESTRUCTIVE_REASONS]).toEqual(['cancelled', 'deleted']);
    expect(decide(absent('archived', { ...goodTombstone, source_status: 'ARCHIVED' })).allowed).toBe(false);
    expect(decide(absent('organization_mismatch', goodTombstone)).allowed).toBe(false);
  });
});

describe('worker outcome policy', () => {
  it('TEST 3/5: not_found is never applied/already_current and never completes the job', () => {
    const env = buildSingleBookingEnvelope({ ...expected, outcome: 'not_found' } as any);
    expect(env.success).toBe(false);
    expect(env.completed).toBe(false);
    expect(validateSingleBookingResult(env, expected, { ok: true, status: 200 })).toMatchObject({
      ok: false,
      permanent: true,
      reason: 'booking_not_found_in_source',
    });
  });

  it('TEST 14: local_fallback never completes and cannot move the cursor', () => {
    const env = buildSingleBookingEnvelope({ ...expected, outcome: 'local_fallback' } as any);
    expect(env.completed).toBe(false);
    expect(validateSingleBookingResult(env, expected, { ok: true, status: 200 })).toMatchObject({
      ok: false,
      permanent: false,
    });
  });
});

// ── Fake supabase client for cancellation idempotency ────────────────────
function makeFakeSupabase(rows: Record<string, any[]>) {
  const ops: string[] = [];
  const builder = (table: string, kind: string) => {
    const self: any = {
      eq: () => self,
      neq: () => self,
      not: () => self,
      limit: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
      select: () => self,
      then: (res: any) => res({ data: rows[table] ?? [], error: null }),
    };
    if (kind !== 'select') ops.push(`${kind}:${table}`);
    return self;
  };
  return {
    ops,
    from: (table: string) => ({
      select: () => builder(table, 'select'),
      update: () => builder(table, 'update'),
      delete: () => builder(table, 'delete'),
    }),
  } as any;
}

describe('central cancellation handler', () => {
  it('TEST 6/16: cancellation is idempotent and routed through one handler', async () => {
    const sb = makeFakeSupabase({});
    const input = { id: '2602-13', version: 1, organization_id: 'org-1' };
    const r1 = await applyBookingCancellation(sb, input);
    const opsAfterFirst = [...sb.ops];
    const r2 = await applyBookingCancellation(sb, input);
    expect(r1.status).toBe('cancelled');
    expect(r2.status).toBe('cancelled');
    // Second run performs the same bounded set of ops — no extra damage paths.
    expect(sb.ops.length).toBe(opsAfterFirst.length * 2);
    expect(new Set(opsAfterFirst)).toEqual(
      new Set([
        'update:bookings',
        'delete:calendar_events',
        'delete:warehouse_calendar_events',
        'update:projects',
        'update:jobs',
        'delete:packing_projects',
        'delete:booking_products',
      ]),
    );
  });
});

describe('source guarantees in edge function code', () => {
  it('TEST 15 + Uppgift 4/10: no empty-result → status/cleanup paths remain', async () => {
    const fs = await import('node:fs');
    const imp = fs.readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
    expect(imp).not.toContain('[Status Demote]');
    expect(imp).not.toContain("status: 'OFFER',\n            updated_at: nowIso,");
    expect(imp).toContain('evaluateDestructiveAction');
    expect(imp).toContain('applyBookingCancellation');

    const rec = fs.readFileSync('supabase/functions/reconcile-booking-status/index.ts', 'utf8');
    // Missing/empty external result must never be turned into CANCELLED.
    expect(rec).not.toContain('return { ok: true, status: "CANCELLED", raw: null };');
    expect(rec).toContain('evaluateDestructiveAction');
    expect(rec).toContain('applyBookingCancellation');
  });
});

// ── STEG 2B: skärpta kontraktskontroller ────────────────────────────────
describe('STEG 2B parser hardening', () => {
  const base = {
    success: true,
    mode: 'single',
    booking_id: '2602-13',
    organization_id: 'org-1',
  };

  it('2B-1: found:false utan reason nekas (kontraktsfel, aldrig cleanup)', () => {
    const r = parseSingleBookingSourceResponse({ ...base, found: false }, expected, { ok: true, status: 200 });
    expect(r).toMatchObject({ kind: 'error', retriable: false, code: 'contract_absent_without_reason' });
    expect(evaluateDestructiveAction(r, expected).allowed).toBe(false);
  });

  it('2B-2: found:true med tombstone eller reason nekas som motsägelse', () => {
    const withTomb = parseSingleBookingSourceResponse(
      { ...base, found: true, booking: { id: '2602-13', organization_id: 'org-1' }, tombstone: { booking_id: '2602-13' } },
      expected, { ok: true, status: 200 });
    expect(withTomb).toMatchObject({ kind: 'error', code: 'contract_contradiction_found_with_tombstone' });
    const withReason = parseSingleBookingSourceResponse(
      { ...base, found: true, booking: { id: '2602-13', organization_id: 'org-1' }, reason: 'cancelled' },
      expected, { ok: true, status: 200 });
    expect(withReason).toMatchObject({ kind: 'error', code: 'contract_contradiction_found_with_reason' });
  });

  it('2B-3: found:false med booking-payload nekas som motsägelse', () => {
    const r = parseSingleBookingSourceResponse(
      { ...base, found: false, reason: 'cancelled', booking: { id: '2602-13' } },
      expected, { ok: true, status: 200 });
    expect(r).toMatchObject({ kind: 'error', code: 'contract_contradiction_absent_with_booking' });
    expect(evaluateDestructiveAction(r, expected).allowed).toBe(false);
  });

  it('2B-4: okänd kontraktsversion nekas, känd version accepteras', () => {
    const bad = parseSingleBookingSourceResponse(
      { ...base, contract_version: '9', found: true, booking: { id: '2602-13', organization_id: 'org-1', status: 'CONFIRMED' } },
      expected, { ok: true, status: 200 });
    expect(bad).toMatchObject({ kind: 'error', code: 'contract_version_unsupported_9' });
    const ok = parseSingleBookingSourceResponse(
      { ...base, contract_version: 1, found: true, booking: { id: '2602-13', organization_id: 'org-1', status: 'CONFIRMED' } },
      expected, { ok: true, status: 200 });
    expect(ok.kind).toBe('found');
  });

  it('2B-5: OFFER-bokning importeras som found (ingen demotion-väg)', () => {
    const r = parseSingleBookingSourceResponse(
      { ...base, found: true, source_status: 'OFFER', booking: { id: '2602-13', organization_id: 'org-1', status: 'OFFER' } },
      expected, { ok: true, status: 200 });
    expect(r).toMatchObject({ kind: 'found', sourceStatus: 'OFFER' });
    expect(evaluateDestructiveAction(r, expected)).toMatchObject({ allowed: false, reason: 'booking_found_no_cleanup' });
  });

  it('2B-6: cancellation-handlern loggar source reason + revision idempotent', async () => {
    const inserts: any[] = [];
    const logged: any[] = [];
    const sb = {
      from(table: string) {
        const api: any = {
          update: () => api, delete: () => api, eq: () => api, neq: () => api, is: () => api, in: () => api, not: () => api, limit: () => api, order: () => api, maybeSingle: () => Promise.resolve({ data: null, error: null }),
          select: () => api,
          insert: (row: any) => { inserts.push({ table, row }); logged.push(row); return Promise.resolve({ error: null }); },
          then: (res: any) => res({ data: table === 'booking_changes' ? logged.map((r) => ({ id: 'x', new_values: r.new_values })) : [], error: null }),
        };
        return api;
      },
    };
    const input = { id: '2602-13', version: 1, status: 'CONFIRMED', organization_id: 'org-1' };
    const evidence = { reason: 'cancelled', source_status: 'CANCELLED', source_revision: 'rev-1', organization_id: 'org-1' };
    const r1 = await applyBookingCancellation(sb as any, input, evidence);
    const r2 = await applyBookingCancellation(sb as any, input, evidence);
    expect(r1.source_logged).toBe(true);
    expect(r2.source_logged).toBe(false); // idempotent: ingen dubbel cancellation-logg
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row.new_values).toMatchObject({ source_reason: 'cancelled', source_revision: 'rev-1' });
  });

  it('2B-7: import-bookings skickar canonical bevis till handlern', async () => {
    const fs = await import('node:fs');
    const imp = fs.readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
    expect(imp).toContain('externalData.raw ?? externalData');
    expect(imp).toMatch(/applyBookingCancellation\(supabase, existingBooking, \{/);
    const rec = fs.readFileSync('supabase/functions/reconcile-booking-status/index.ts', 'utf8');
    expect(rec).toContain('source_revision');
  });
});

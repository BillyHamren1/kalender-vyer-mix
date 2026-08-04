import { describe, it, expect } from 'vitest';
import {
  buildSingleBookingEnvelope,
  deriveSingleBookingOutcome,
  validateSingleBookingResult,
} from '../../supabase/functions/_shared/singleBookingResult';

const expected = { bookingId: '2602-13', organizationId: 'org-1' };

const okBody = (outcome: 'applied' | 'already_current') =>
  buildSingleBookingEnvelope({
    bookingId: expected.bookingId,
    organizationId: expected.organizationId,
    outcome,
  });

describe('single booking result contract', () => {
  it('accepts applied and already_current envelopes', () => {
    for (const o of ['applied', 'already_current'] as const) {
      const body = okBody(o);
      expect(body).toMatchObject({
        success: true,
        queued: false,
        completed: true,
        sync_mode: 'single',
        booking_id: '2602-13',
        organization_id: 'org-1',
        outcome: o,
      });
      const res = validateSingleBookingResult(body, expected, { ok: true, status: 200 });
      expect(res.ok).toBe(true);
    }
  });

  it('rejects non-2xx responses (5xx retriable, 4xx permanent)', () => {
    const r5 = validateSingleBookingResult(null, expected, { ok: false, status: 502 });
    expect(r5).toEqual({ ok: false, permanent: false, reason: 'http_502' });
    const r4 = validateSingleBookingResult(null, expected, { ok: false, status: 400 });
    expect(r4).toMatchObject({ ok: false, permanent: true });
  });

  it('rejects invalid json body', () => {
    expect(validateSingleBookingResult(null, expected, { ok: true, status: 200 })).toMatchObject({
      ok: false,
      permanent: false,
      reason: 'invalid_json_body',
    });
  });

  it('rejects queued=true, wrong sync_mode and id mismatches as permanent', () => {
    const base = okBody('applied');
    expect(
      validateSingleBookingResult({ ...base, queued: true }, expected, { ok: true, status: 200 }),
    ).toMatchObject({ ok: false, permanent: true });
    expect(
      validateSingleBookingResult({ ...base, sync_mode: 'incremental' }, expected, { ok: true, status: 200 }),
    ).toMatchObject({ ok: false, permanent: true });
    expect(
      validateSingleBookingResult({ ...base, booking_id: '9999-1' }, expected, { ok: true, status: 200 }),
    ).toMatchObject({ ok: false, permanent: true });
    expect(
      validateSingleBookingResult({ ...base, organization_id: 'org-2' }, expected, { ok: true, status: 200 }),
    ).toMatchObject({ ok: false, permanent: true });
  });

  it('rejects missing/unknown outcome and inconsistent success flags', () => {
    const base = okBody('applied');
    const { outcome: _o, ...noOutcome } = base as any;
    expect(validateSingleBookingResult(noOutcome, expected, { ok: true, status: 200 })).toMatchObject({
      ok: false,
      permanent: true,
      reason: 'contract_violation_missing_outcome',
    });
    expect(
      validateSingleBookingResult({ ...base, outcome: 'weird' }, expected, { ok: true, status: 200 }),
    ).toMatchObject({ ok: false, permanent: true });
    expect(
      validateSingleBookingResult({ ...base, completed: false }, expected, { ok: true, status: 200 }),
    ).toMatchObject({ ok: false, permanent: true, reason: 'contract_violation_success_flags' });
  });

  it('classifies partial/local_fallback as retriable and not_found as permanent', () => {
    const mk = (outcome: any) =>
      buildSingleBookingEnvelope({ bookingId: expected.bookingId, organizationId: expected.organizationId, outcome });
    expect(validateSingleBookingResult(mk('partial'), expected, { ok: true, status: 200 })).toMatchObject({
      ok: false,
      permanent: false,
    });
    expect(validateSingleBookingResult(mk('local_fallback'), expected, { ok: true, status: 200 })).toMatchObject({
      ok: false,
      permanent: false,
    });
    expect(validateSingleBookingResult(mk('not_found'), expected, { ok: true, status: 200 })).toMatchObject({
      ok: false,
      permanent: true,
    });
  });

  it('non-success envelopes never claim success/completed', () => {
    for (const o of ['partial', 'local_fallback', 'not_found', 'failed'] as const) {
      const e = buildSingleBookingEnvelope({ bookingId: '2602-13', organizationId: 'org-1', outcome: o });
      expect(e.success).toBe(false);
      expect(e.completed).toBe(false);
      expect(e.queued).toBe(false);
    }
  });

  it('derives outcome from import results', () => {
    expect(deriveSingleBookingOutcome({ total: 1, updated_bookings: ['2602-13'] })).toBe('applied');
    expect(deriveSingleBookingOutcome({ total: 1, products_updated_bookings: ['2602-13'] })).toBe('applied');
    expect(deriveSingleBookingOutcome({ total: 1, unchanged_bookings_skipped: ['2602-13'] })).toBe('already_current');
    expect(deriveSingleBookingOutcome({ total: 0 })).toBe('not_found');
    expect(deriveSingleBookingOutcome({ total: 1, failed: 1, errors: [{ e: 1 }] })).toBe('partial');
  });
});

describe('worker enforces the contract in source', () => {
  it('process-sync-jobs validates before marking completed', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('supabase/functions/process-sync-jobs/index.ts', 'utf8');
    expect(src).toContain('validateSingleBookingResult');
    const validateIdx = src.indexOf('validateSingleBookingResult(\n');
    const completedIdx = src.indexOf("status: 'completed'");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(completedIdx).toBeGreaterThan(validateIdx);
  });
});

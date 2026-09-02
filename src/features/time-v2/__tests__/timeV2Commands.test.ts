import { describe, it, expect, vi } from 'vitest';
import {
  attestTimeV2Payroll,
  attestTimeV2Project,
  requestTimeV2Correction,
  timeV2IdempotencyKey,
  TIME_V2_COMMANDS,
} from '@/features/time-v2/lib/commands';
import { TimeV2ClientError } from '@/features/time-v2/lib/client';
import { TIME_ADAPTER_VERSION } from '@/features/time-v2/lib/boundary';

const ctx = { organizationId: 'org-1', submissionId: 'sub-1', expectedRevision: 3 };

const ok = (data: unknown = { accepted: true, version: 4, state: 'correction_requested' }) =>
  vi.fn(async (body: Record<string, unknown>) => ({
    data: { adapterVersion: TIME_ADAPTER_VERSION, operation: body.operation, generatedAt: null, data },
    error: null,
  }));

describe('Time V2 command boundary (real adapter operations)', () => {
  it('uses Time\'s deployed operation names', () => {
    expect(TIME_V2_COMMANDS).toEqual({
      requestCorrection: 'review.requestCorrection',
      attestPayroll: 'attest.payroll',
      attestProject: 'attest.project',
    });
  });

  it('requests a correction with the reason and the exact revision in the idempotency key', async () => {
    const invoke = ok();
    const res = await requestTimeV2Correction({ ...ctx, reason: '  Saknad rast  ' }, { invoke });
    expect(invoke.mock.calls[0][0]).toEqual({
      operation: 'review.requestCorrection',
      submissionId: 'sub-1',
      idempotencyKey: 'planning:review.requestCorrection:sub-1:r3',
      reason: 'Saknad rast',
    });
    expect(res.revision).toBe(4);
  });

  it('rejects an empty correction reason before any request', async () => {
    const invoke = ok();
    await expect(requestTimeV2Correction({ ...ctx, reason: '   ' }, { invoke })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('maps 409 to a stale-revision error instead of retrying', async () => {
    const invoke = vi.fn(async () => ({ data: {}, error: { context: { status: 409 } } }));
    const err = await attestTimeV2Payroll(ctx, { invoke }).catch((e) => e);
    expect(err).toBeInstanceOf(TimeV2ClientError);
    expect(err.kind).toBe('stale_revision');
  });

  it('attests payroll and project as independent domain decisions', async () => {
    const invoke = ok({ accepted: true, version: 3 });
    await attestTimeV2Payroll(ctx, { invoke });
    await attestTimeV2Project(ctx, { invoke });
    const calls = invoke.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls[0].operation).toBe('attest.payroll');
    expect(calls[1].operation).toBe('attest.project');
    expect(calls[0].decision).toBe('approved');
    expect(calls[0].idempotencyKey).not.toBe(calls[1].idempotencyKey);
  });

  it('never targets a Planning source record', () => {
    for (const key of ['requestCorrection', 'attestPayroll', 'attestProject'] as const) {
      expect(timeV2IdempotencyKey(ctx, key)).not.toMatch(/booking|customer|assignment|calendar_events/);
      expect(TIME_V2_COMMANDS[key]).toMatch(/^(review|attest)\./);
    }
  });
});

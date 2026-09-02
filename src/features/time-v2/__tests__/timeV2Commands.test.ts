import { describe, it, expect, vi } from 'vitest';
import {
  attestTimeV2Payroll,
  attestTimeV2Project,
  requestTimeV2Correction,
  timeV2CommandPath,
} from '@/features/time-v2/lib/commands';
import { TimeV2ClientError } from '@/features/time-v2/lib/client';

const base = 'https://time.test';
const ctx = { organizationId: 'org-1', submissionId: 'sub-1', expectedRevision: 3 };

const okFetch = (body: unknown = { accepted: true, revision: 4, state: 'correction_requested' }) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('Time V2 command boundary', () => {
  it('posts correction to the versioned command path with the exact revision and reason', async () => {
    const f = okFetch();
    const res = await requestTimeV2Correction(
      { ...ctx, reason: '  Saknad rast  ' },
      { baseUrl: base, fetchImpl: f },
    );
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${base}${timeV2CommandPath('requestCorrection')}`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      organization_id: 'org-1',
      submission_id: 'sub-1',
      expected_revision: 3,
      reason: 'Saknad rast',
    });
    expect(res.revision).toBe(4);
  });

  it('rejects an empty correction reason before any request', async () => {
    const f = okFetch();
    await expect(
      requestTimeV2Correction({ ...ctx, reason: '   ' }, { baseUrl: base, fetchImpl: f }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('maps 409 to a stale-revision error instead of retrying', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 409 })) as unknown as typeof fetch;
    const err = await attestTimeV2Payroll(ctx, { baseUrl: base, fetchImpl: f }).catch((e) => e);
    expect(err).toBeInstanceOf(TimeV2ClientError);
    expect(err.kind).toBe('stale_revision');
  });

  it('attests payroll and project through separate command paths', async () => {
    const f = okFetch({ accepted: true, revision: 3 });
    await attestTimeV2Payroll(ctx, { baseUrl: base, fetchImpl: f });
    await attestTimeV2Project(ctx, { baseUrl: base, fetchImpl: f });
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls[0]).toContain('/commands/attest-payroll');
    expect(calls[1]).toContain('/commands/attest-project');
    expect(calls[0]).not.toBe(calls[1]);
  });

  it('fails closed when the Time base url is missing', async () => {
    await expect(
      attestTimeV2Project(ctx, { baseUrl: null, fetchImpl: okFetch() }),
    ).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('never targets a Planning source endpoint', () => {
    for (const key of ['requestCorrection', 'attestPayroll', 'attestProject'] as const) {
      const p = timeV2CommandPath(key);
      expect(p.startsWith('/api/time/')).toBe(true);
      expect(p).not.toMatch(/booking|project-source|customer|assignment/);
    }
  });
});

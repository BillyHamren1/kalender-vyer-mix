import { describe, expect, it, vi } from 'vitest';
import {
  readCateringProjectEvidenceParity,
  validateProjectCateringEvidenceParity,
  type ProjectCateringEvidenceParity,
  type CateringReadAuthority,
  type CateringReadClient,
} from './projectCateringEvidenceParity';
import { formatEvidenceMinorAmount } from './projectCostEvidence';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(): ProjectCateringEvidenceParity {
  return {
    schema: 'operations-catering-project-evidence.v3',
    organizationId: id(1),
    projectId: id(7),
    generatedAt: '2026-10-02T03:00:00Z',
    upstreamCurrentness: 'unverified',
    shadowOnly: true,
    evidenceState: 'complete',
    lines: [
      {
        streamKey: 'a'.repeat(64),
        obligationId: id(8),
        revision: 1,
        sourceEntryVersion: 1,
        workDate: '2026-09-30',
        minutes: 105,
        amountMinor: 52502,
        currency: 'SEK',
        status: 'preliminary',
        coverage: 'complete',
        sourceStatus: 'pending',
        publishedAt: '2026-10-02T03:00:00Z',
      },
    ],
    withdrawals: [],
    currencyTotals: [
      {
        currency: 'SEK',
        preliminaryKnownMinor: 52502,
        confirmedKnownMinor: null,
        knownMinor: 52502,
        receivedTotalMinor: 52502,
        missingCostLineCount: 0,
        missingCostMinutes: 0,
      },
    ],
    counts: {
      lineCount: 1,
      withdrawalCount: 0,
      missingCostLineCount: 0,
      missingCostMinutes: 0,
    },
  };
}
const validate = (f: unknown) =>
  validateProjectCateringEvidenceParity(f, id(1), id(7));
const authority: CateringReadAuthority = {
  actorId: id(9),
  organizationId: id(1),
  projectId: id(7),
  accessToken: 'isolated-token',
};
function client(body: unknown = fixture()) {
  const getSession = vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: authority.accessToken,
        user: { id: authority.actorId },
      },
    },
    error: null,
  });
  const abortSignal = vi.fn().mockResolvedValue({ data: body, error: null });
  const setHeader = vi.fn(() => ({ abortSignal }));
  const rpc = vi.fn(() => ({ setHeader }));
  return {
    client: { auth: { getSession }, rpc } as CateringReadClient,
    getSession,
    abortSignal,
    setHeader,
    rpc,
  };
}
describe('Catering-only immutable publication parity', () => {
  it('copies52502 with independent projectconfirmation and pending source', () => {
    const f = fixture();
    f.lines[0].status = 'confirmed';
    f.currencyTotals[0].preliminaryKnownMinor = null;
    f.currencyTotals[0].confirmedKnownMinor = 52502;
    expect(validate(f)).toEqual(f);
  });
  it('does not recalculate duration-cost', () => {
    const f = fixture();
    f.lines[0].minutes = 1;
    expect(validate(f).lines[0].amountMinor).toBe(52502);
  });
  it('missing rate retains null known amount and receivedtotal', () => {
    const f = fixture();
    Object.assign(f.lines[0], { coverage: 'missing_rate', amountMinor: null });
    f.evidenceState = 'incomplete';
    Object.assign(f.currencyTotals[0], {
      preliminaryKnownMinor: null,
      knownMinor: null,
      receivedTotalMinor: null,
      missingCostLineCount: 1,
      missingCostMinutes: 105,
    });
    Object.assign(f.counts, {
      missingCostLineCount: 1,
      missingCostMinutes: 105,
    });
    expect(validate(f).currencyTotals[0].knownMinor).toBeNull();
    f.currencyTotals[0].receivedTotalMinor = 0;
    expect(() => validate(f)).toThrow();
  });
  it('rejected current row stays drilldown only', () => {
    const f = fixture();
    f.lines[0].status = 'rejected';
    f.currencyTotals = [];
    expect(validate(f).currencyTotals).toEqual([]);
    f.currencyTotals = fixture().currencyTotals;
    expect(() => validate(f)).toThrow();
  });
  it('opaque withdrawal requires no current amounts or target', () => {
    const f = fixture();
    f.lines = [];
    f.currencyTotals = [];
    f.counts.lineCount = 0;
    f.evidenceState = 'no_evidence';
    f.withdrawals = [
      { streamKey: 'b'.repeat(64), revision: 4, publishedAt: f.generatedAt },
    ];
    f.counts.withdrawalCount = 1;
    expect(validate(f).lines).toEqual([]);
    Object.assign(f.withdrawals[0], { projectId: id(99) });
    expect(() => validate(f)).toThrow();
  });
  it('denies foreign tuples, fabricated upstream proof and unsafe fields', () => {
    for (const patch of [
      { organizationId: id(99) },
      { projectId: id(99) },
      { upstreamCurrentness: 'verified' },
      { shadowOnly: false },
    ])
      expect(() => validate({ ...fixture(), ...patch })).toThrow();
    const f = fixture();
    Object.assign(f.lines[0], { hourlyRateMinor: 30001 });
    expect(() => validate(f)).toThrow();
  });
  it('denies repeated stream including current+withdrawn overlap', () => {
    const f = fixture();
    f.withdrawals = [
      {
        streamKey: f.lines[0].streamKey,
        revision: 4,
        publishedAt: f.generatedAt,
      },
    ];
    f.counts.withdrawalCount = 1;
    expect(() => validate(f)).toThrow();
  });
  it('requires calendar-valid zoned timestamps and dates', () => {
    for (const time of [
      '2026-02-30T03:00:00Z',
      '2026-10-02T03:00:00+14:01',
      '2026-10-02',
    ])
      expect(() => validate({ ...fixture(), generatedAt: time })).toThrow();
  });
  it('verifies copied sums and safe integer exact cents', () => {
    const f = fixture();
    f.currencyTotals[0].knownMinor = 52503;
    expect(() => validate(f)).toThrow();
    f.lines[0].amountMinor = Number.MAX_SAFE_INTEGER;
    Object.assign(f.currencyTotals[0], {
      preliminaryKnownMinor: Number.MAX_SAFE_INTEGER,
      knownMinor: Number.MAX_SAFE_INTEGER,
      receivedTotalMinor: Number.MAX_SAFE_INTEGER,
    });
    expect(validate(f).lines[0].amountMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatEvidenceMinorAmount(Number.MAX_SAFE_INTEGER, 'SEK')).toContain(
      ',91',
    );
  });
  it('bounds combinedcurrent+withdrawn rows', () => {
    const f = fixture();
    f.lines = Array.from({ length: 2001 }, () => f.lines[0]);
    expect(() => validate(f)).toThrow();
  });
  it('fails malformed source/status payload rather than coercion', () => {
    const f = fixture();
    Object.assign(f.lines[0], { sourceStatus: 'rejected', minutes: '105' });
    expect(() => validate(f)).toThrow();
  });
});
describe('captured-session cancellation boundary, not an authority proof', () => {
  it.each([[], {}, ''])(
    'rejects invalid token %j before session lookup or RPC',
    async (accessToken) => {
      const c = client();
      await expect(
        readCateringProjectEvidenceParity(
          c.client,
          { ...authority, accessToken } as CateringReadAuthority,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(c.getSession).not.toHaveBeenCalled();
      expect(c.rpc).not.toHaveBeenCalled();
      expect(c.setHeader).not.toHaveBeenCalled();
    },
  );
  it('binds exactRPCTuple/capturedBearer and checks local session before+after', async () => {
    const c = client();
    const value = await readCateringProjectEvidenceParity(
      c.client,
      authority,
      new AbortController().signal,
    );
    expect(value.lines[0].amountMinor).toBe(52502);
    expect(c.rpc).toHaveBeenCalledWith(
      'read_operations_catering_project_evidence_v3',
      { p_organization_id: id(1), p_project_id: id(7) },
    );
    expect(c.setHeader).toHaveBeenCalledWith(
      'Authorization',
      'Bearer isolated-token',
    );
    expect(c.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(c.getSession).toHaveBeenCalledTimes(2);
  });
  it('stale token/actor prevents an RPC', async () => {
    const c = client();
    c.getSession.mockResolvedValue({
      data: { session: { access_token: 'other', user: { id: id(99) } } },
      error: null,
    });
    await expect(
      readCateringProjectEvidenceParity(
        c.client,
        authority,
        new AbortController().signal,
      ),
    ).rejects.toThrow('sessionen');
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it('postresponse changed session never returns old evidence', async () => {
    const c = client();
    c.getSession
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: authority.accessToken,
            user: { id: authority.actorId },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: 'other', user: { id: id(99) } } },
        error: null,
      });
    await expect(
      readCateringProjectEvidenceParity(
        c.client,
        authority,
        new AbortController().signal,
      ),
    ).rejects.toThrow('sessionen');
  });
  it('unmountabort wins even if RPC ignoresabort and returns late', async () => {
    const c = client();
    const ctl = new AbortController();
    let release!: (v: unknown) => void;
    c.abortSignal.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const reading = readCateringProjectEvidenceParity(
      c.client,
      authority,
      ctl.signal,
    );
    await vi.waitFor(() => expect(c.abortSignal).toHaveBeenCalledTimes(1));
    ctl.abort();
    await expect(reading).rejects.toThrow();
    release?.({ data: fixture(), error: null });
  });
  it('RPCdeny has no cached/private error fallback', async () => {
    const c = client();
    c.abortSignal.mockResolvedValue({
      data: fixture(),
      error: new Error('private source details'),
    });
    await expect(
      readCateringProjectEvidenceParity(
        c.client,
        authority,
        new AbortController().signal,
      ),
    ).rejects.toThrow('kunde inte hämtas');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readObligationDrilldown,
  validateObligationDrilldown,
  type ObligationDrilldown,
  type ObligationDrilldownAuthority,
  type ObligationDrilldownClient,
} from './projectScopeObligationDrilldown';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const authority: ObligationDrilldownAuthority = {
  actorId: id(9),
  accessToken: 'isolated-token',
  organizationId: id(1),
  rootKind: 'large_project',
  rootId: id(7),
  obligationId: id(8),
  compositionSnapshotId: id(10),
  baselineEventId: id(11),
};
function evidence(): ObligationDrilldown {
  return {
    schema: 'operations-scope-obligation-drilldown.v1',
    organizationId: id(1),
    rootKind: 'large_project',
    rootId: id(7),
    economicScopeId: id(12),
    scopeRevision: 1,
    compositionRevision: 1,
    compositionSnapshotId: id(10),
    compositionFingerprint: 'a'.repeat(64),
    obligationProjectId: id(13),
    obligationId: id(8),
    asOf: '2026-10-02T05:40:10.123456+00:00',
    state: 'received_evidence',
    referenceCurrentness: {
      composition: true,
      membership: true,
      baseline: true,
    },
    baseline: {
      eventId: id(11),
      revision: 1,
      fingerprint: 'b'.repeat(64),
      evidenceBasis: 'operations_manual',
      currency: 'SEK',
      category: 'supplier',
      costBasis: 'invoice',
      estimateMinor: 1000000,
      committedMinor: null,
    },
    sourceCurrentness: 'saved_receiver_heads_only',
    upstreamCurrentness: 'unverified',
    coverage: {
      total: 'unavailable',
      source: 'unavailable',
      personnel: 'unavailable',
      supplier: 'unavailable',
      catering: 'unavailable',
      other: 'unavailable',
      credit: 'unavailable',
    },
    prognosis: {
      remainingMinor: null,
      eacMinor: null,
      budgetMinor: null,
      marginMinor: null,
    },
    sources: [
      {
        sourceKey: 'c'.repeat(64),
        bindingEventId: id(14),
        sourceSnapshotId: id(15),
        sourceEconomicRevision: 1,
        status: 'preliminary',
        amountMinor: 540000,
        bindingState: 'resolved',
        policyState: 'missing',
        policyEventId: null,
        policyRevision: null,
        replacesEstimateMinor: null,
        consumesCommitmentMinor: null,
        reason: null,
      },
    ],
    diagnostics: [
      'category_coverage_unavailable',
      'source_inventory_incomplete',
      'credit_mapping_unavailable',
      'time_and_native_catering_mapping_unavailable',
    ],
    shadowOnly: true,
  };
}
function client(data: unknown = evidence()) {
  const session = vi.fn().mockResolvedValue({
    data: {
      session: {
        user: { id: authority.actorId },
        access_token: authority.accessToken,
      },
    },
    error: null,
  });
  const read = vi.fn().mockResolvedValue({ data, error: null });
  const header = vi.fn();
  let signal: AbortSignal | undefined;
  const rpc = vi.fn(() => ({
    setHeader: (name: string, value: string) => {
      header(name, value);
      return {
        abortSignal: (s: AbortSignal) => {
          signal = s;
          return read();
        },
      };
    },
  }));
  return {
    api: { auth: { getSession: session }, rpc } as ObligationDrilldownClient,
    session,
    read,
    rpc,
    header,
    get signal() {
      return signal;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe('copied one-obligation evidence contract', () => {
  it('keeps actual money, null commitment and unavailable prognosis separate', () => {
    const x = validateObligationDrilldown(evidence(), authority);
    expect(x.sources[0].amountMinor).toBe(540000);
    expect(x.baseline.estimateMinor).toBe(1000000);
    expect(x.baseline.committedMinor).toBeNull();
    expect(Object.values(x.prognosis)).toEqual([null, null, null, null]);
  });
  it('copies explicit policy larger than source price without imposing a new cap', () => {
    const x = evidence();
    Object.assign(x.sources[0], {
      policyState: 'current',
      policyEventId: id(16),
      policyRevision: 1,
      replacesEstimateMinor: 700000,
    });
    expect(
      validateObligationDrilldown(x, authority).sources[0]
        .replacesEstimateMinor,
    ).toBe(700000);
  });
  it('rejects replacement money when the captured estimate is unknown', () => {
    const x = evidence();
    x.baseline.estimateMinor = null;
    Object.assign(x.sources[0], {
      policyState: 'current',
      policyEventId: id(16),
      policyRevision: 1,
      replacesEstimateMinor: 1,
    });
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
    x.sources[0].replacesEstimateMinor = null;
    expect(
      validateObligationDrilldown(x, authority).baseline.estimateMinor,
    ).toBeNull();
  });
  it('rejects commitment consumption money when the captured commitment is unknown', () => {
    const x = evidence();
    Object.assign(x.sources[0], {
      policyState: 'current',
      policyEventId: id(16),
      policyRevision: 1,
      consumesCommitmentMinor: 1,
    });
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
    x.sources[0].consumesCommitmentMinor = null;
    expect(
      validateObligationDrilldown(x, authority).baseline.committedMinor,
    ).toBeNull();
  });
  it('keeps empty received inventory unknown without inventing zero', () => {
    const x = evidence();
    x.sources = [];
    x.baseline.estimateMinor = null;
    expect(validateObligationDrilldown(x, authority).sources).toEqual([]);
    expect(x.prognosis.eacMinor).toBeNull();
  });
  it('preserves selected saved baseline when current baseline changed', () => {
    const x = evidence();
    x.state = 'baseline_changed';
    x.referenceCurrentness.baseline = false;
    x.sources = [];
    x.diagnostics.push('changed_baseline');
    expect(
      validateObligationDrilldown(x, authority).baseline.estimateMinor,
    ).toBe(1000000);
    x.sources = evidence().sources;
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
  });
  it('represents unsupported time basis without invoice or fake forecast', () => {
    const x = evidence();
    x.state = 'unsupported_basis';
    x.baseline.costBasis = 'time';
    x.sources = [];
    x.diagnostics.push('unsupported_cost_basis');
    expect(
      validateObligationDrilldown(x, authority).prognosis.eacMinor,
    ).toBeNull();
  });
  it('rejects altered scope, capture, local identity and money field sets', () => {
    for (const field of [
      'organizationId',
      'rootId',
      'obligationId',
      'compositionSnapshotId',
    ]) {
      const x = evidence();
      Object.assign(x, { [field]: id(99) });
      expect(() => validateObligationDrilldown(x, authority)).toThrow();
    }
    const x = evidence();
    x.baseline.eventId = id(99);
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
    expect(() =>
      validateObligationDrilldown(
        { ...evidence(), hourly_rate_minor: 30000 },
        authority,
      ),
    ).toThrow();
  });
  it('rejects changed membership instead of returning removed-leaf amounts', () => {
    const x = evidence();
    Object.assign(x.referenceCurrentness, { membership: false });
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
  });
  it('rejects unsafe, textual, fractional or negative current copied money', () => {
    for (const amountMinor of [
      '540000',
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      null,
    ]) {
      const x = evidence();
      Object.assign(x.sources[0], { amountMinor });
      expect(() => validateObligationDrilldown(x, authority)).toThrow();
    }
  });
  it('rejects claimed full coverage or nonnull prognosis', () => {
    const x = evidence();
    Object.assign(x.coverage, { credit: 'complete' });
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
    const y = evidence();
    Object.assign(y.prognosis, { remainingMinor: 0 });
    expect(() => validateObligationDrilldown(y, authority)).toThrow();
  });
  it('retains unresolved source as null and rejects historical amount reuse', () => {
    const x = evidence();
    Object.assign(x.sources[0], {
      bindingState: 'unresolved',
      status: null,
      amountMinor: null,
      reason: 'changed_invoice_economics',
    });
    expect(
      validateObligationDrilldown(x, authority).sources[0].amountMinor,
    ).toBeNull();
    x.sources[0].amountMinor = 540000;
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
  });
  it('rejects stale-policy amounts, status coercion and source raw/person leaks', () => {
    const x = evidence();
    x.sources[0].replacesEstimateMinor = 540000;
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
    const y = evidence();
    Object.assign(y.sources[0], { status: ['preliminary'] });
    expect(() => validateObligationDrilldown(y, authority)).toThrow();
    const z = evidence();
    Object.assign(z.sources[0], { source_raw_sha256: 'a'.repeat(64) });
    expect(() => validateObligationDrilldown(z, authority)).toThrow();
  });
  it('rejects duplicate anchors, huge lists and unknown diagnostic strings', () => {
    const x = evidence();
    x.sources.push(x.sources[0]);
    expect(() => validateObligationDrilldown(x, authority)).toThrow();
    const y = evidence();
    y.sources = Array(201).fill(y.sources[0]);
    expect(() => validateObligationDrilldown(y, authority)).toThrow();
    const z = evidence();
    z.diagnostics.push('raw internal error');
    expect(() => validateObligationDrilldown(z, authority)).toThrow();
  });
  it('requires full ISO timestamps with valid calendar and zone', () => {
    for (const asOf of [
      '2026-02-30T00:00:00Z',
      '2026-10-02',
      '2026-10-02T00:00:00',
      '2026-10-02T24:00:00Z',
    ])
      expect(() =>
        validateObligationDrilldown({ ...evidence(), asOf }, authority),
      ).toThrow();
  });
});
describe('actual session-bound RPC client contract', () => {
  it('sends exact six selection keys, genuine header, signal and rechecks session', async () => {
    const c = client();
    const result = await readObligationDrilldown(
      c.api,
      authority,
      new AbortController().signal,
    );
    expect(result.sources[0].amountMinor).toBe(540000);
    expect(c.session).toHaveBeenCalledTimes(2);
    expect(c.rpc).toHaveBeenCalledWith(
      'read_operations_scope_obligation_drilldown_v1',
      {
        p_request: {
          schema_version: 'operations-scope-obligation-drilldown-read.v1',
          root_kind: 'large_project',
          root_id: id(7),
          obligation_id: id(8),
          expected_composition_snapshot_id: id(10),
          expected_baseline_event_id: id(11),
        },
      },
    );
    expect(c.header).toHaveBeenCalledWith(
      'Authorization',
      'Bearer isolated-token',
    );
    expect(c.signal).toBeInstanceOf(AbortSignal);
  });
  it('rejects switched pre-request session without calling RPC', async () => {
    const c = client();
    c.session.mockResolvedValue({
      data: { session: { user: { id: id(99) }, access_token: 'other' } },
      error: null,
    });
    await expect(
      readObligationDrilldown(c.api, authority, new AbortController().signal),
    ).rejects.toThrow();
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it('rejects logout after response before exposing copied money', async () => {
    const c = client();
    c.session
      .mockResolvedValueOnce({
        data: {
          session: { user: { id: id(9) }, access_token: 'isolated-token' },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(
      readObligationDrilldown(c.api, authority, new AbortController().signal),
    ).rejects.toThrow('Sessionen har ändrats');
  });
  it('rejects nonstring tokens and pre-aborted request without session/RPC', async () => {
    for (const accessToken of [[], {}, '', null]) {
      const c = client();
      await expect(
        readObligationDrilldown(
          c.api,
          {
            ...authority,
            accessToken,
          } as unknown as ObligationDrilldownAuthority,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(c.session).not.toHaveBeenCalled();
    }
    const c = client();
    const a = new AbortController();
    a.abort();
    await expect(
      readObligationDrilldown(c.api, authority, a.signal),
    ).rejects.toThrow();
    expect(c.rpc).not.toHaveBeenCalled();
  });
  it('fails closed on PT409 reload conflict without showing a stale payload', async () => {
    const c = client();
    c.read.mockResolvedValue({ data: evidence(), error: { code: 'PT409' } });
    await expect(
      readObligationDrilldown(c.api, authority, new AbortController().signal),
    ).rejects.toThrow('Öppna posten igen');
  });
  it('aborts a pending RPC at whole deadline even if backend ignores abort', async () => {
    vi.useFakeTimers();
    const c = client();
    c.read.mockReturnValue(new Promise(() => {}));
    const result = readObligationDrilldown(
      c.api,
      authority,
      new AbortController().signal,
    );
    const assertion = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(c.signal?.aborted).toBe(true);
  });
});

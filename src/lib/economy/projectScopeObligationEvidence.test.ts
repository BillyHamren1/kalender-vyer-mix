import { describe, expect, it, vi } from 'vitest';
import {
  validateScopeObligationEvidence,
  readScopeObligationEvidence,
  type ScopeObligationEvidence,
  type ScopeEvidenceReadClient,
  type ScopeEvidenceReadAuthority,
} from './projectScopeObligationEvidence';
import { formatEvidenceMinorAmount } from './projectCostEvidence';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function evidence(): ScopeObligationEvidence {
  return {
    schema: 'operations-scope-obligation-evidence.v1',
    organizationId: id(1),
    rootKind: 'project',
    rootId: id(7),
    generatedAt: '2026-10-02T04:30:00Z',
    state: 'evidence',
    economicScopeId: id(8),
    scopeRevision: 1,
    currentScopeRevision: 1,
    membershipFingerprint: 'a'.repeat(64),
    compositionRevision: 1,
    snapshotId: id(10),
    snapshotFingerprint: 'b'.repeat(64),
    publishedAt: '2026-10-02T04:30:00Z',
    currency: 'SEK',
    referenceCurrentness: { membership: true, baselines: true, sources: true },
    authorityScope: 'canonical_scope_composition',
    pricingBasis: 'operations_manual_composition',
    sourceCurrentness: 'receiver_v1_only',
    upstreamCurrentness: 'unverified',
    coverage: 'unavailable',
    categoryCoverage: {
      personnel: 'unavailable',
      supplier: 'unavailable',
      catering: 'unavailable',
      other: 'unavailable',
    },
    knownEstimateMinor: 52502,
    knownCommitmentMinor: null,
    allSelectedEstimatesKnown: true,
    allSelectedCommitmentsKnown: false,
    eacMinor: null,
    budgetMinor: null,
    marginMinor: null,
    shadowOnly: true,
    baselines: [
      {
        baselineEventId: id(11),
        projectId: id(7),
        obligationId: id(12),
        baselineRevision: 1,
        baselineFingerprint: 'c'.repeat(64),
        evidenceBasis: 'operations_manual',
        authorityScope: 'local_project_only',
        category: 'supplier',
        currency: 'SEK',
        costBasis: 'invoice',
        estimateMinor: 52502,
        committedMinor: null,
      },
    ],
    sources: [
      {
        sourceAnchor: 'd'.repeat(64),
        projectId: id(7),
        obligationId: id(12),
        baselineEventId: id(11),
        bindingEventId: id(13),
        sourceSnapshotId: id(14),
        sourceEconomicRevision: 1,
        sourceEconomicFingerprint: 'e'.repeat(64),
        observedAmountMinor: 50000,
        observedStatus: 'preliminary',
        sourceBindingState: 'bound_original',
        sourcePolicyState: 'current',
        policyEventId: id(15),
        policyRevision: 1,
      },
    ],
  };
}
const parse = (v: unknown) =>
  validateScopeObligationEvidence(v, id(1), 'project', id(7));
const authority: ScopeEvidenceReadAuthority = {
  actorId: id(9),
  organizationId: id(1),
  rootKind: 'project',
  rootId: id(7),
  accessToken: 'isolated-token',
};
function client(body: unknown = evidence()) {
  const session = vi
    .fn()
    .mockResolvedValue({
      data: {
        session: {
          access_token: authority.accessToken,
          user: { id: authority.actorId },
        },
      },
      error: null,
    });
  const abortSignal = vi.fn().mockResolvedValue({ data: body, error: null }),
    setHeader = vi.fn(() => ({ abortSignal })),
    rpc = vi.fn(() => ({ setHeader }));
  return {
    client: { auth: { getSession: session }, rpc } as ScopeEvidenceReadClient,
    session,
    rpc,
    setHeader,
    abortSignal,
  };
}
describe('copied partial scope evidence', () => {
  it('keeps manual summary and source amount separate with unknown forecast', () => {
    const f = evidence();
    expect(parse(f)).toEqual(f);
    expect(f.knownEstimateMinor).toBe(52502);
    expect(f.eacMinor).toBeNull();
  });
  it('retains saved amounts when membership or baseline refs become stale', () => {
    const f = evidence();
    f.referenceCurrentness = {
      membership: false,
      baselines: false,
      sources: false,
    };
    f.currentScopeRevision = 2;
    expect(parse(f).knownEstimateMinor).toBe(52502);
  });
  it('preserves an unresolved binding to a previous baseline as historical provenance', () => {
    const f = evidence();
    f.sources[0].baselineEventId = id(99);
    f.sources[0].sourceBindingState = 'unresolved';
    f.sources[0].sourcePolicyState = 'unresolved';
    f.sources[0].policyEventId = null;
    f.sources[0].policyRevision = null;
    f.referenceCurrentness.sources = false;
    expect(parse(f).sources[0].baselineEventId).toBe(id(99));
  });
  it('unknown estimates remain null rather than zero', () => {
    const f = evidence();
    f.baselines[0].estimateMinor = null;
    f.knownEstimateMinor = null;
    f.allSelectedEstimatesKnown = false;
    expect(parse(f).knownEstimateMinor).toBeNull();
  });
  it('an explicit saved zero is preserved', () => {
    const f = evidence();
    f.baselines[0].estimateMinor = 0;
    f.knownEstimateMinor = 0;
    expect(parse(f).knownEstimateMinor).toBe(0);
  });
  it('exact cents are preserved at safe integer limit', () => {
    const f = evidence();
    f.baselines[0].estimateMinor = Number.MAX_SAFE_INTEGER;
    f.knownEstimateMinor = Number.MAX_SAFE_INTEGER;
    expect(parse(f).knownEstimateMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatEvidenceMinorAmount(Number.MAX_SAFE_INTEGER, 'SEK')).toMatch(
      /,91/,
    );
  });
  it.each(['eacMinor', 'budgetMinor', 'marginMinor'] as const)(
    'rejects invented %s',
    (field) => {
      const f = evidence();
      Object.assign(f, { [field]: 0 });
      expect(() => parse(f)).toThrow();
    },
  );
  it('rejects source/category completeness promotion', () => {
    const f = evidence();
    Object.assign(f, { coverage: 'complete' });
    expect(() => parse(f)).toThrow();
  });
  it.each(['actorId', 'hourlyRate', 'document', 'bookingId'])(
    'rejects leaked %s',
    (key) => {
      const f = evidence();
      Object.assign(f, { [key]: 'private' });
      expect(() => parse(f)).toThrow();
    },
  );
  it('rejects foreign org/root, changed copied sums, duplicate anchors and cap', () => {
    for (const change of [
      (f: ScopeObligationEvidence) => {
        f.organizationId = id(2);
      },
      (f: ScopeObligationEvidence) => {
        f.rootId = id(88);
      },
      (f: ScopeObligationEvidence) => {
        f.knownEstimateMinor = 1;
      },
      (f: ScopeObligationEvidence) => {
        f.sources.push({ ...f.sources[0] });
      },
      (f: ScopeObligationEvidence) => {
        f.sources = Array.from({ length: 201 }, () => ({ ...f.sources[0] }));
      },
    ]) {
      const f = evidence();
      change(f);
      expect(() => parse(f)).toThrow();
    }
  });
  it('rejects unknown timestamps and coercible integers', () => {
    const f = evidence();
    f.generatedAt = '2026-02-30T12:00:00Z';
    expect(() => parse(f)).toThrow();
    f.generatedAt = '2026-10-02';
    expect(() => parse(f)).toThrow();
    f.generatedAt = '2026-10-02T12:00:00Z';
    Object.assign(f.baselines[0], { estimateMinor: '52502' });
    expect(() => parse(f)).toThrow();
  });
  it('no evidence cannot manufacture a zero or current refs', () => {
    const f = evidence();
    Object.assign(f, {
      state: 'no_scope',
      economicScopeId: null,
      scopeRevision: null,
      currentScopeRevision: null,
      membershipFingerprint: null,
      compositionRevision: null,
      snapshotId: null,
      snapshotFingerprint: null,
      publishedAt: null,
      currency: null,
      referenceCurrentness: {
        membership: null,
        baselines: null,
        sources: null,
      },
      baselines: [],
      sources: [],
      knownEstimateMinor: null,
      knownCommitmentMinor: null,
      allSelectedEstimatesKnown: false,
      allSelectedCommitmentsKnown: false,
    });
    expect(parse(f).state).toBe('no_scope');
    f.knownEstimateMinor = 0;
    expect(() => parse(f)).toThrow();
  });
});
describe('actual-session identity boundary', () => {
  it('uses exact root tuple and captured bearer, checks session twice', async () => {
    const c = client();
    await readScopeObligationEvidence(
      c.client,
      authority,
      new AbortController().signal,
    );
    expect(c.rpc).toHaveBeenCalledWith(
      'read_operations_scope_obligation_evidence_v1',
      { p_organization_id: id(1), p_root_kind: 'project', p_root_id: id(7) },
    );
    expect(c.setHeader).toHaveBeenCalledWith(
      'Authorization',
      'Bearer isolated-token',
    );
    expect(c.session).toHaveBeenCalledTimes(2);
  });
  it.each([[], {}, ''])(
    'invalid token %j makes no session lookup or RPC',
    async (accessToken) => {
      const c = client();
      await expect(
        readScopeObligationEvidence(
          c.client,
          { ...authority, accessToken } as ScopeEvidenceReadAuthority,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(c.session).not.toHaveBeenCalled();
      expect(c.rpc).not.toHaveBeenCalled();
    },
  );
  it('changed post-response session never returns prior evidence', async () => {
    const c = client();
    c.session
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: authority.accessToken,
            user: { id: authority.actorId },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(
      readScopeObligationEvidence(
        c.client,
        authority,
        new AbortController().signal,
      ),
    ).rejects.toThrow('Sessionen');
  });
  it('pending RPC ignored abort cannot expose late evidence', async () => {
    const c = client(),
      ctl = new AbortController();
    let release!: (value: unknown) => void;
    c.abortSignal.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = readScopeObligationEvidence(
      c.client,
      authority,
      ctl.signal,
    );
    await vi.waitFor(() => expect(c.abortSignal).toHaveBeenCalled());
    ctl.abort();
    await expect(pending).rejects.toThrow();
    release({ data: evidence(), error: null });
  });
  it('permission denial has no error details or fallback', async () => {
    const c = client();
    c.abortSignal.mockResolvedValue({
      data: evidence(),
      error: { message: 'private source' },
    });
    await expect(
      readScopeObligationEvidence(
        c.client,
        authority,
        new AbortController().signal,
      ),
    ).rejects.toThrow('Underlaget kunde inte hämtas');
  });
});

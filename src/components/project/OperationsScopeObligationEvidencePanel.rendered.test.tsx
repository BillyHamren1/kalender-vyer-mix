// @vitest-environment jsdom
// Actual React/query DOM with explicitly synthetic Auth/session/RPC; not native authority proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ScopeObligationEvidence } from '@/lib/economy/projectScopeObligationEvidence';
import { OperationsScopeObligationEvidencePanel } from './OperationsScopeObligationEvidencePanel';
const state = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000009' as string | null,
  org: '00000000-0000-4000-8000-000000000001' as string | null,
  token: 'isolated-token' as string | null,
  read: vi.fn(),
  session: vi.fn(),
  headers: vi.fn(),
  signals: [] as AbortSignal[],
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: state.actor ? { id: state.actor } : null,
    session:
      state.token && state.actor
        ? { access_token: state.token, user: { id: state.actor } }
        : null,
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({
    organizationId: state.org,
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: state.session },
    rpc: () => ({
      setHeader: (name: string, value: string) => {
        state.headers(name, value);
        return {
          abortSignal: (s: AbortSignal) => {
            state.signals.push(s);
            return state.read();
          },
        };
      },
    }),
  },
}));
const org = '00000000-0000-4000-8000-000000000001',
  project = '00000000-0000-4000-8000-000000000007';
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
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const tree = () => (
    <QueryClientProvider client={client}>
      <OperationsScopeObligationEvidencePanel projectId={project} />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, client, redraw: () => view.rerender(tree()) };
}
beforeEach(() => {
  state.actor = '00000000-0000-4000-8000-000000000009';
  state.org = org;
  state.token = 'isolated-token';
  state.read.mockReset();
  state.session.mockReset();
  state.headers.mockReset();
  state.signals = [];
  state.session.mockImplementation(() =>
    Promise.resolve({
      data: {
        session:
          state.actor && state.token
            ? { access_token: state.token, user: { id: state.actor } }
            : null,
      },
      error: null,
    }),
  );
  vi.stubEnv('VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED', 'true');
});
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
  vi.unstubAllEnvs();
});
describe('real React/query DOM with synthetic authority/RPC', () => {
  it('empty saved composition clearly states no captured cost rows', async () => {
    const f = evidence();
    Object.assign(f, {
      baselines: [],
      sources: [],
      knownEstimateMinor: null,
      knownCommitmentMinor: null,
      allSelectedEstimatesKnown: false,
      allSelectedCommitmentsKnown: false,
      referenceCurrentness: {
        membership: true,
        baselines: false,
        sources: false,
      },
    });
    state.read.mockResolvedValue({ data: f, error: null });
    mount();
    await screen.findByText(
      'Det sparade underlaget innehåller inga kostnadsposter.',
    );
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('default-off does not fetch', () => {
    vi.stubEnv('VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED', 'false');
    expect(mount().container.textContent).toBe('');
    expect(state.read).not.toHaveBeenCalled();
  });
  it('shows saved manual summary and independent copied source, no complete forecast', async () => {
    state.read.mockResolvedValue({ data: evidence(), error: null });
    mount();
    await screen.findByText('Sparad uppskattning');
    expect(
      screen.getByRole('region').textContent?.replace(/\s/g, ''),
    ).toContain('525,02kr');
    expect(screen.getByText('Preliminär')).toBeTruthy();
    expect(
      screen.getByText(
        'Prognos saknas. Budget och marginal kan ännu inte visas.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('region').textContent).not.toContain('receiver_v1');
    expect(state.headers).toHaveBeenCalledWith(
      'Authorization',
      'Bearer isolated-token',
    );
  });
  it('unknown estimate remains absent without fake zero', async () => {
    const f = evidence();
    f.baselines[0].estimateMinor = null;
    f.knownEstimateMinor = null;
    f.allSelectedEstimatesKnown = false;
    state.read.mockResolvedValue({ data: f, error: null });
    mount();
    await screen.findByText('Sparad uppskattning');
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();
    expect(screen.getAllByText('Saknas').length).toBeGreaterThan(0);
  });
  it('stale reference warning preserves only saved cost evidence', async () => {
    const f = evidence();
    f.referenceCurrentness.baselines = false;
    state.read.mockResolvedValue({ data: f, error: null });
    mount();
    await screen.findByRole('alert');
    expect(
      screen.getByRole('region').textContent?.replace(/\s/g, ''),
    ).toContain('525,02kr');
  });
  it('no exact saved root gives no fallback total', async () => {
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
    state.read.mockResolvedValue({ data: f, error: null });
    mount();
    await screen.findByText(
      'Inget sparat kostnadsunderlag finns för projektet.',
    );
    expect(screen.queryByText('Sparad uppskattning')).toBeNull();
  });
  it('permission denial hides saved cost and details', async () => {
    state.read.mockResolvedValue({
      data: evidence(),
      error: { message: 'private raw source' },
    });
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByText('Sparad uppskattning')).toBeNull();
    expect(screen.getByRole('region').textContent).not.toContain('private');
  });
  it.each(['token', 'actor', 'org'])(
    'new %s starts fresh identity and removes old cache',
    async (key) => {
      state.read
        .mockResolvedValueOnce({ data: evidence(), error: null })
        .mockResolvedValue({ data: null, error: new Error('denied') });
      const v = mount();
      await screen.findByText('Sparad uppskattning');
      const oldKey = v.client.getQueryCache().getAll()[0].queryKey;
      if (key === 'token') state.token = 'new-token';
      if (key === 'actor') state.actor = id(88);
      if (key === 'org') state.org = id(99);
      v.redraw();
      expect(screen.queryByText('Sparad uppskattning')).toBeNull();
      await screen.findByRole('alert');
      await waitFor(() =>
        expect(
          v.client.getQueryCache().find({ queryKey: oldKey, exact: true }),
        ).toBeUndefined(),
      );
    },
  );
  it('fresh revoked read hides previously visible copied amount', async () => {
    state.read
      .mockResolvedValueOnce({ data: evidence(), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('denied') });
    const v = mount();
    await screen.findByText('Sparad uppskattning');
    await act(async () => {
      await v.client.invalidateQueries({
        queryKey: ['operations-scope-obligation-evidence-v1'],
      });
    });
    await screen.findByRole('alert');
    expect(screen.queryByText('Sparad uppskattning')).toBeNull();
  });
  it('logout removes evidence/cache', async () => {
    state.read.mockResolvedValue({ data: evidence(), error: null });
    const v = mount();
    await screen.findByText('Sparad uppskattning');
    state.actor = null;
    state.token = null;
    v.redraw();
    await screen.findByRole('alert');
    expect(screen.queryByText('Sparad uppskattning')).toBeNull();
    await waitFor(() =>
      expect(
        v.client
          .getQueryCache()
          .findAll({ queryKey: ['operations-scope-obligation-evidence-v1'] }),
      ).toHaveLength(0),
    );
  });
  it('pending unmount aborts and ignores late source response', async () => {
    let release!: (v: unknown) => void;
    state.read.mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const v = mount();
    await waitFor(() => expect(state.read).toHaveBeenCalled());
    v.unmount();
    expect(state.signals[0].aborted).toBe(true);
    await act(async () => release({ data: evidence(), error: null }));
    expect(screen.queryByText('Sparad uppskattning')).toBeNull();
  });
});

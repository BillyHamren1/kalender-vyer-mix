// @vitest-environment jsdom
// Actual React/query DOM with explicitly synthetic Auth/session/RPC; not native authority proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  dehydrate,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ScopeObligationEvidence } from '@/lib/economy/projectScopeObligationEvidence';
import type { ObligationDrilldown } from '@/lib/economy/projectScopeObligationDrilldown';
import { OperationsScopeObligationEvidencePanel } from './OperationsScopeObligationEvidencePanel';
const state = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000009' as string | null,
  org: '00000000-0000-4000-8000-000000000001' as string | null,
  token: 'isolated-token' as string | null,
  read: vi.fn(),
  detail: vi.fn(),
  rpc: vi.fn(),
  detailSignals: [] as AbortSignal[],
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
    rpc: (name: string, args: unknown) => {
      state.rpc(name, args);
      return {
        setHeader: (header: string, value: string) => {
          state.headers(header, value);
          return {
            abortSignal: (signal: AbortSignal) => {
              if (name === 'read_operations_scope_obligation_drilldown_v1') {
                state.detailSignals.push(signal);
                return state.detail();
              }
              state.signals.push(signal);
              return state.read();
            },
          };
        },
      };
    },
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
function detailEvidence(): ObligationDrilldown {
  return {
    schema: 'operations-scope-obligation-drilldown.v1',
    organizationId: id(1),
    rootKind: 'project',
    rootId: id(7),
    economicScopeId: id(8),
    scopeRevision: 1,
    compositionRevision: 1,
    compositionSnapshotId: id(10),
    compositionFingerprint: 'a'.repeat(64),
    obligationProjectId: id(7),
    obligationId: id(12),
    asOf: '2026-10-02T05:40:10Z',
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
      estimateMinor: 52502,
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
        amountMinor: 18000,
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
const clients: QueryClient[] = [];
function mount(initialProject = project) {
  let selectedProject = initialProject;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const tree = () => (
    <QueryClientProvider client={client}>
      <OperationsScopeObligationEvidencePanel projectId={selectedProject} />
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    ...view,
    client,
    redraw: (next = selectedProject) => {
      selectedProject = next;
      view.rerender(tree());
    },
  };
}
beforeEach(() => {
  state.actor = '00000000-0000-4000-8000-000000000009';
  state.org = org;
  state.token = 'isolated-token';
  state.read.mockReset();
  state.detail.mockReset();
  state.rpc.mockReset();
  state.detailSignals = [];
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
  vi.stubEnv('VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED', 'false');
});
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

describe('saved-row drilldown integration with intercepted RPC', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED', 'true');
    state.read.mockResolvedValue({ data: evidence(), error: null });
    state.detail.mockResolvedValue({ data: detailEvidence(), error: null });
  });
  async function open() {
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Visa detaljer för kostnadspost 1',
      }),
    );
    return screen.findByRole('region', { name: 'Kostnadspost' });
  }
  it('detail flag is independently default-off with no detail RPC or controls', async () => {
    vi.stubEnv('VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED', 'false');
    mount();
    await screen.findByText('Sparad uppskattning');
    expect(screen.queryByRole('button')).toBeNull();
    expect(state.detail).not.toHaveBeenCalled();
  });
  it('opens only the displayed saved row and keeps the saved summary unchanged', async () => {
    mount();
    await open();
    await screen.findByText('Preliminär kostnad: 180,00 kr');
    expect(state.rpc).toHaveBeenCalledWith(
      'read_operations_scope_obligation_drilldown_v1',
      {
        p_request: {
          schema_version: 'operations-scope-obligation-drilldown-read.v1',
          root_kind: 'project',
          root_id: id(7),
          obligation_id: id(12),
          expected_composition_snapshot_id: id(10),
          expected_baseline_event_id: id(11),
        },
      },
    );
    const table = screen.getByRole('table', { name: 'Sparade kostnadsposter' });
    expect(table.textContent?.replace(/\s/g, '')).toContain('525,02kr');
    expect(
      within(screen.getByRole('region', { name: 'Kostnadspost' })).getByText(
        'Prognos, budget och marginal saknas.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Prognos saknas. Budget och marginal kan ännu inte visas.',
      ),
    ).toBeTruthy();
    expect(state.headers).toHaveBeenCalledWith(
      'Authorization',
      'Bearer isolated-token',
    );
  });
  it('collapse discards detail cache and pending late money', async () => {
    let release!: (v: unknown) => void;
    state.detail.mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const v = mount();
    await open();
    await waitFor(() => expect(state.detail).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole('button', { name: 'Dölj detaljer för kostnadspost 1' }),
    );
    expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
    expect(state.detailSignals[0].aborted).toBe(true);
    await act(async () => release({ data: detailEvidence(), error: null }));
    await waitFor(() =>
      expect(
        v.client
          .getQueryCache()
          .findAll({ queryKey: ['operations-obligation-drilldown-v1'] }),
      ).toHaveLength(0),
    );
    expect(screen.queryByText('Preliminär kostnad: 180,00 kr')).toBeNull();
  });
  it('scope refetch hides details and requires a new explicit selection even for the same capture', async () => {
    const v = mount();
    await open();
    await screen.findByText('Preliminär kostnad: 180,00 kr');
    let release!: (v: unknown) => void;
    state.read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = v.client.invalidateQueries({
        queryKey: ['operations-scope-obligation-evidence-v1'],
      });
    });
    await screen.findByText('Hämtar sparat underlag…');
    expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
    expect(screen.queryByText('Sparad uppskattning')).toBeNull();
    await act(async () => {
      release({ data: evidence(), error: null });
      await refresh;
    });
    await screen.findByRole('button', {
      name: 'Visa detaljer för kostnadspost 1',
    });
    expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
    expect(state.detail).toHaveBeenCalledTimes(1);
  });
  it('an immediate identical scope response also resets selection at the same clock timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1790928000000);
    const v = mount();
    await open();
    await screen.findByText('Preliminär kostnad: 180,00 kr');
    await act(async () => {
      await v.client.invalidateQueries({
        queryKey: ['operations-scope-obligation-evidence-v1'],
      });
    });
    await screen.findByRole('button', {
      name: 'Visa detaljer för kostnadspost 1',
    });
    expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
    expect(state.detail).toHaveBeenCalledTimes(1);
  });
  it.each(['token', 'actor', 'org', 'root'])(
    '%s boundary clears selected detail and never reopens automatically',
    async (key) => {
      const v = mount();
      await open();
      await screen.findByText('Preliminär kostnad: 180,00 kr');
      state.read.mockResolvedValue({ data: null, error: { code: '42501' } });
      if (key === 'token') state.token = 'new-token';
      if (key === 'actor') state.actor = id(88);
      if (key === 'org') state.org = id(99);
      v.redraw(key === 'root' ? id(77) : project);
      expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
      await screen.findByRole('alert');
      await waitFor(() =>
        expect(
          v.client
            .getQueryCache()
            .findAll({ queryKey: ['operations-obligation-drilldown-v1'] }),
        ).toHaveLength(0),
      );
      expect(state.detail).toHaveBeenCalledTimes(1);
    },
  );
  it('fresh denied scope read drops the selected detail and its saved money', async () => {
    const v = mount();
    await open();
    await screen.findByText('Preliminär kostnad: 180,00 kr');
    state.read.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await act(async () => {
      await v.client.invalidateQueries({
        queryKey: ['operations-scope-obligation-evidence-v1'],
      });
    });
    await screen.findByRole('alert');
    expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
    expect(screen.queryByText('Preliminär kostnad: 180,00 kr')).toBeNull();
  });
  it('changed composition cannot inherit an earlier selection', async () => {
    const v = mount();
    await open();
    await screen.findByText('Preliminär kostnad: 180,00 kr');
    const next = evidence();
    next.snapshotId = id(20);
    next.compositionRevision = 2;
    state.read.mockResolvedValueOnce({ data: next, error: null });
    await act(async () => {
      await v.client.invalidateQueries({
        queryKey: ['operations-scope-obligation-evidence-v1'],
      });
    });
    await screen.findByRole('button', {
      name: 'Visa detaljer för kostnadspost 1',
    });
    expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
    expect(state.detail).toHaveBeenCalledTimes(1);
  });
  it('expired membership keeps saved manual evidence but disables opening details', async () => {
    const f = evidence();
    f.referenceCurrentness.membership = false;
    state.read.mockResolvedValue({ data: f, error: null });
    mount();
    const b = await screen.findByRole('button', {
      name: 'Visa detaljer för kostnadspost 1',
    });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(b);
    expect(state.detail).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Öppna ett nytt underlag för att visa kostnadsposternas detaljer.',
      ),
    ).toBeTruthy();
  });
  it('unknown invoice evidence stays unavailable without a zero or a computed total', async () => {
    const f = detailEvidence();
    f.sources = [];
    state.detail.mockResolvedValue({ data: f, error: null });
    mount();
    await open();
    await screen.findByText('Mottaget fakturaunderlag saknas.');
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();
    expect(
      screen.getByText('Prognos, budget och marginal saknas.'),
    ).toBeTruthy();
  });
  it('keeps loaded scope and selected leaf money out of actual query dehydration', async () => {
    const v = mount();
    await open();
    await screen.findByText('Preliminär kostnad: 180,00 kr');
    const moneyQueries = v.client.getQueryCache().getAll();
    expect(moneyQueries).toHaveLength(3);
    expect(moneyQueries.every((q) => q.meta?.persist === false)).toBe(true);
    expect(
      moneyQueries.filter((q) => q.state.status === 'success'),
    ).toHaveLength(2);
    expect(
      moneyQueries.filter((q) => q.state.status === 'pending'),
    ).toHaveLength(1);
    expect(
      moneyQueries.filter((q) => q.state.status === 'error'),
    ).toHaveLength(0);
    expect(dehydrate(v.client).queries).toHaveLength(2);
    // Two loaded ledgers and one disabled projection query are nonpersistent;
    // only the two successful queries enter default dehydration.
    const persisted = dehydrate(v.client, {
      shouldDehydrateQuery: (q) =>
        q.state.status === 'success' && q.meta?.persist !== false,
    });
    expect(persisted.queries).toHaveLength(0);
    expect(JSON.stringify(persisted)).not.toContain('52502');
    expect(JSON.stringify(persisted)).not.toContain('18000');
  });
  it('switching displayed rows uses their exact saved IDs and drops earlier money while pending', async () => {
    const f = evidence();
    f.baselines.push({
      ...f.baselines[0],
      baselineEventId: id(21),
      obligationId: id(22),
      estimateMinor: null,
    });
    f.allSelectedEstimatesKnown = false;
    state.read.mockResolvedValue({ data: f, error: null });
    const v = mount();
    await open();
    await screen.findByText('Preliminär kostnad: 180,00 kr');
    let release!: (v: unknown) => void;
    state.detail.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Visa detaljer för kostnadspost 2' }),
    );
    await screen.findByText('Hämtar kostnadsposten…');
    expect(screen.queryByText('Preliminär kostnad: 180,00 kr')).toBeNull();
    expect(state.rpc).toHaveBeenLastCalledWith(
      'read_operations_scope_obligation_drilldown_v1',
      {
        p_request: {
          schema_version: 'operations-scope-obligation-drilldown-read.v1',
          root_kind: 'project',
          root_id: id(7),
          obligation_id: id(22),
          expected_composition_snapshot_id: id(10),
          expected_baseline_event_id: id(21),
        },
      },
    );
    const next = detailEvidence();
    next.obligationId = id(22);
    next.baseline.eventId = id(21);
    next.baseline.estimateMinor = null;
    next.sources[0].amountMinor = 25000;
    await act(async () => release({ data: next, error: null }));
    await screen.findByText('Preliminär kostnad: 250,00 kr');
    expect(screen.queryByText('Preliminär kostnad: 180,00 kr')).toBeNull();
    await waitFor(() =>
      expect(
        v.client
          .getQueryCache()
          .findAll({ queryKey: ['operations-obligation-drilldown-v1'] }),
      ).toHaveLength(1),
    );
  });
  it('logout during detail fetch aborts it and ignores its late response', async () => {
    let release!: (v: unknown) => void;
    state.detail.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const v = mount();
    await open();
    await waitFor(() => expect(state.detail).toHaveBeenCalled());
    state.actor = null;
    state.token = null;
    v.redraw();
    await screen.findByRole('alert');
    expect(state.detailSignals[0].aborted).toBe(true);
    await act(async () => release({ data: detailEvidence(), error: null }));
    expect(screen.queryByText('Preliminär kostnad: 180,00 kr')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Kostnadspost' })).toBeNull();
  });
  it('PT409 detail failure hides copied money and asks for a new opening', async () => {
    state.detail.mockResolvedValue({
      data: null,
      error: { code: 'PT409', message: 'private' },
    });
    mount();
    await open();
    await screen.findByText(/Kostnadsposten kunde inte hämtas/);
    expect(screen.queryByText('Preliminär kostnad: 180,00 kr')).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Kostnadspost' }).textContent,
    ).not.toContain('private');
  });
});

// @vitest-environment jsdom
// Actual React/query rendering with intercepted Auth/RPC; separate from native authorization.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  OperationsObligationDrilldownPanel,
  type ObligationDrilldownSelection,
} from './OperationsObligationDrilldownPanel';
const state = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000009' as string | null,
  org: '00000000-0000-4000-8000-000000000001' as string | null,
  token: 'isolated-token' as string | null,
  read: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  signals: [] as AbortSignal[],
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: state.actor ? { id: state.actor } : null,
    session:
      state.actor && state.token
        ? { user: { id: state.actor }, access_token: state.token }
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
        setHeader: () => ({
          abortSignal: (signal: AbortSignal) => {
            state.signals.push(signal);
            return state.read();
          },
        }),
      };
    },
  },
}));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const selection: ObligationDrilldownSelection = {
  rootKind: 'large_project',
  rootId: id(7),
  obligationId: id(8),
  compositionSnapshotId: id(10),
  baselineEventId: id(11),
};
function evidence() {
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
let query: QueryClient;
function mount(s = selection) {
  const node = () => (
    <QueryClientProvider client={query}>
      <OperationsObligationDrilldownPanel selection={s} />
    </QueryClientProvider>
  );
  const view = render(node());
  return {
    ...view,
    refresh: (next = s) =>
      view.rerender(
        <QueryClientProvider client={query}>
          <OperationsObligationDrilldownPanel selection={next} />
        </QueryClientProvider>,
      ),
  };
}
beforeEach(() => {
  vi.stubEnv('VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED', 'true');
  state.actor = id(9);
  state.org = id(1);
  state.token = 'isolated-token';
  state.signals = [];
  state.read.mockReset().mockResolvedValue({ data: evidence(), error: null });
  state.rpc.mockReset();
  state.session
    .mockReset()
    .mockImplementation(async () => ({
      data: {
        session:
          state.actor && state.token
            ? { user: { id: state.actor }, access_token: state.token }
            : null,
      },
      error: null,
    }));
  query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  query.clear();
  vi.unstubAllEnvs();
});
describe('one-obligation protected rendered drilldown', () => {
  it('stays inert by default and never calls a reader', () => {
    vi.stubEnv('VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED', 'false');
    mount();
    expect(screen.queryByRole('region')).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('displays exact copied individual amount and saved estimate without total/forecast', async () => {
    mount();
    await screen.findByText('Sparad kostnadspost');
    expect(screen.getByText(/Preliminär kostnad:/).textContent).toMatch(
      /5\s400,00/,
    );
    expect(screen.getByText('Sparad uppskattning')).toBeTruthy();
    expect(screen.getByText('Saknas')).toBeTruthy();
    expect(
      screen.getByText('Prognos, budget och marginal saknas.'),
    ).toBeTruthy();
    expect(screen.getByText(/Personal, Catering och krediter/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('receiver');
    expect(document.body.textContent).not.toContain(id(15));
    expect(state.rpc).toHaveBeenCalledWith(
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
    expect(
      JSON.stringify(
        query
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ),
    ).not.toContain('isolated-token');
  });
  it('never substitutes new source money for changed saved baseline', async () => {
    const x = evidence();
    x.state = 'baseline_changed';
    x.referenceCurrentness.baseline = false;
    x.sources = [];
    x.diagnostics.push('changed_baseline');
    state.read.mockResolvedValue({ data: x, error: null });
    mount();
    await screen.findByRole('alert');
    expect(
      screen.getByText(/Beloppen ovan visar den sparade versionen/),
    ).toBeTruthy();
    expect(screen.queryByText(/Preliminär kostnad:/)).toBeNull();
  });
  it('keeps missing current money unknown rather than zero', async () => {
    const x = evidence();
    x.sources = [];
    x.baseline.estimateMinor = null as unknown as number;
    state.read.mockResolvedValue({ data: x, error: null });
    mount();
    await screen.findByText('Mottaget fakturaunderlag saknas.');
    expect(screen.queryByText(/0,00/)).toBeNull();
    expect(screen.getAllByText('Saknas')).toHaveLength(2);
  });
  it('hides saved money while refetching and after actual read denial', async () => {
    mount();
    await screen.findByText(/Preliminär kostnad:/);
    let finish: (x: unknown) => void = () => {};
    state.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() => {
      void query.invalidateQueries();
    });
    await screen.findByRole('status');
    expect(screen.queryByText(/Preliminär kostnad:/)).toBeNull();
    act(() => finish({ data: null, error: { code: '42501' } }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/Preliminär kostnad:/)).toBeNull();
  });
  it('clears visible copy on actor/org switch and has no cache fallback', async () => {
    const view = mount();
    await screen.findByText(/Preliminär kostnad:/);
    state.actor = id(99);
    state.org = id(98);
    state.token = 'foreign-token';
    state.read.mockReturnValue(new Promise(() => {}));
    view.refresh();
    await screen.findByRole('status');
    expect(screen.queryByText(/Preliminär kostnad:/)).toBeNull();
    await waitFor(() => expect(state.rpc.mock.calls.length).toBeGreaterThan(1));
  });
  it('cancels old selection and removes its copied amount', async () => {
    const view = mount();
    await screen.findByText(/Preliminär kostnad:/);
    state.read.mockReturnValue(new Promise(() => {}));
    view.refresh({ ...selection, baselineEventId: id(55) });
    await screen.findByRole('status');
    expect(screen.queryByText(/Preliminär kostnad:/)).toBeNull();
    view.unmount();
    await waitFor(() => expect(state.signals.at(-1)?.aborted).toBe(true));
  });
  it('hides saved money on logout', async () => {
    const view = mount();
    await screen.findByText(/Preliminär kostnad:/);
    state.actor = null;
    state.token = null;
    view.refresh();
    await screen.findByRole('alert');
    expect(screen.queryByText(/Preliminär kostnad:/)).toBeNull();
  });
  it('maps changed snapshot conflict to reopen instruction without stale copy', async () => {
    state.read.mockResolvedValue({
      data: evidence(),
      error: { code: 'PT409' },
    });
    mount();
    await screen.findByRole('alert');
    expect(screen.getByText(/Öppna posten igen/)).toBeTruthy();
    expect(screen.queryByText(/Preliminär kostnad:/)).toBeNull();
  });
});

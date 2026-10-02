// @vitest-environment jsdom
// Actual React/query DOM with explicitly synthetic Auth/session/RPC; not native authority proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { OperationsCateringEvidenceParityPanel } from './OperationsCateringEvidenceParityPanel';
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
function evidence() {
  return {
    schema: 'operations-catering-project-evidence.v3',
    organizationId: org,
    projectId: project,
    generatedAt: '2026-10-02T03:00:00Z',
    upstreamCurrentness: 'unverified',
    shadowOnly: true,
    evidenceState: 'complete',
    lines: [
      {
        streamKey: 'a'.repeat(64),
        obligationId: project,
        revision: 1,
        sourceEntryVersion: 1,
        workDate: '2026-09-30',
        minutes: 105,
        amountMinor: 52502 as number | null,
        currency: 'SEK',
        status: 'preliminary',
        coverage: 'complete',
        sourceStatus: 'pending',
        publishedAt: '2026-10-02T03:00:00Z',
      },
    ],
    withdrawals: [] as {
      streamKey: string;
      revision: number;
      publishedAt: string;
    }[],
    currencyTotals: [
      {
        currency: 'SEK',
        preliminaryKnownMinor: 52502 as number | null,
        confirmedKnownMinor: null as number | null,
        knownMinor: 52502 as number | null,
        receivedTotalMinor: 52502 as number | null,
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
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const tree = () => (
    <QueryClientProvider client={client}>
      <OperationsCateringEvidenceParityPanel projectId={project} />
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
  vi.stubEnv('VITE_OPERATIONS_CATERING_PARITY_ENABLED', 'true');
});
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
  vi.unstubAllEnvs();
});
describe('actual parity component synthetic-session/RPC DOM', () => {
  it('keeps loaded sensitive rows in memory while excluding them from application persistence', async () => {
    state.read.mockResolvedValue({ data: evidence(), error: null });
    const view = mount();
    await screen.findByText('105 min');
    const active = view.client.getQueryCache().find({
      queryKey: ['operations-catering-project-evidence-v3'],
      exact: false,
    })!;
    expect(active.state.status).toBe('success');
    expect(active.state.data).toMatchObject({
      lines: [{ streamKey: 'a'.repeat(64), amountMinor: 52502, minutes: 105 }],
      currencyTotals: [{ receivedTotalMinor: 52502 }],
    });
    expect(active.meta?.persist).toBe(false);
    view.client.setQueryData(['public-reference-catalog'], {
      marker: 'public-reference-only',
    });
    // App.tsx allows successful JSON-safe queries unless this exact opt-out is set.
    // The component remains mounted: gcTime=0 cannot remove its active query.
    expect(dehydrate(view.client).queries).toHaveLength(2);
    const persisted = dehydrate(view.client, {
      shouldDehydrateQuery: (q) =>
        q.state.status === 'success' && q.meta?.persist !== false,
    });
    expect(persisted.queries).toHaveLength(1);
    expect(persisted.queries[0].queryKey).toEqual(['public-reference-catalog']);
    const serialized = JSON.stringify(persisted);
    expect(serialized).toContain('public-reference-only');
    expect(serialized).not.toContain('52502');
    expect(serialized).not.toContain('a'.repeat(64));
    expect(serialized).not.toContain('operations-catering-project-evidence-v3');
  });
  it('defaultoff starts no reads or hooks/data', () => {
    vi.stubEnv('VITE_OPERATIONS_CATERING_PARITY_ENABLED', 'false');
    expect(mount().container.textContent).toBe('');
    expect(state.read).not.toHaveBeenCalled();
  });
  it('copies52502 while sourcepending and projectpreliminary remainseparate', async () => {
    state.read.mockResolvedValue({ data: evidence(), error: null });
    mount();
    await screen.findByText('105 min');
    expect(screen.getByText('Ej granskad')).toBeTruthy();
    expect(screen.getByText('Preliminär')).toBeTruthy();
    expect(
      screen.getByRole('region').textContent?.replace(/\s/g, ''),
    ).toContain('525,02kr');
    expect(state.headers).toHaveBeenCalledWith(
      'Authorization',
      'Bearer isolated-token',
    );
  });
  it('projectconfirmation copies samecost with sourcepending', async () => {
    const e = evidence();
    e.lines[0].status = 'confirmed';
    e.currencyTotals[0].preliminaryKnownMinor = null;
    e.currencyTotals[0].confirmedKnownMinor = 52502;
    state.read.mockResolvedValue({ data: e, error: null });
    mount();
    await screen.findByText('Bekräftad');
    expect(screen.getByText('Ej granskad')).toBeTruthy();
    expect(
      screen.getByRole('region').textContent?.replace(/\s/g, ''),
    ).toContain('525,02kr');
  });
  it('missingrate money isnull and no fakeknownzero', async () => {
    const e = evidence();
    e.evidenceState = 'incomplete';
    Object.assign(e.lines[0], { amountMinor: null, coverage: 'missing_rate' });
    Object.assign(e.currencyTotals[0], {
      preliminaryKnownMinor: null,
      knownMinor: null,
      receivedTotalMinor: null,
      missingCostLineCount: 1,
      missingCostMinutes: 105,
    });
    Object.assign(e.counts, {
      missingCostLineCount: 1,
      missingCostMinutes: 105,
    });
    state.read.mockResolvedValue({ data: e, error: null });
    mount();
    await screen.findByText('Kostnad saknas');
    expect(screen.getByRole('alert').textContent).toContain('inte som noll');
    expect(screen.queryByText('0,00 kr')).toBeNull();
  });
  it('withdrawal opaquehistory doesnotshow targetamount', async () => {
    const e = evidence();
    e.lines = [];
    e.currencyTotals = [];
    e.evidenceState = 'no_evidence';
    e.counts.lineCount = 0;
    e.counts.withdrawalCount = 1;
    e.withdrawals = [
      { streamKey: 'b'.repeat(64), revision: 3, publishedAt: e.generatedAt },
    ];
    state.read.mockResolvedValue({ data: e, error: null });
    mount();
    await screen.findByText(/dragits tillbaka/);
    expect(screen.queryByText('525,02 kr')).toBeNull();
    expect(screen.queryByText('b'.repeat(64))).toBeNull();
  });
  it('rejected rows remaindrilldown with no active subtotal', async () => {
    const e = evidence();
    e.lines[0].status = 'rejected';
    e.currencyTotals = [];
    state.read.mockResolvedValue({ data: e, error: null });
    mount();
    await screen.findByText(/Alla mottagna rader är avvisade/);
    expect(screen.getByText('Avvisad')).toBeTruthy();
    expect(screen.queryByText('0,00 kr')).toBeNull();
  });
  it('actor/orgswitch hidesold rows during pendingnewread then403', async () => {
    let release!: (v: unknown) => void;
    state.read
      .mockResolvedValueOnce({ data: evidence(), error: null })
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          }),
      );
    const v = mount();
    await screen.findByText('105 min');
    state.actor = '00000000-0000-4000-8000-000000000099';
    state.org = '00000000-0000-4000-8000-000000000098';
    v.redraw();
    expect(screen.queryByText('105 min')).toBeNull();
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
    await act(async () => release({ data: null, error: new Error('denied') }));
    await screen.findByRole('alert');
    expect(screen.queryByText('105 min')).toBeNull();
    await waitFor(() =>
      expect(
        v.client
          .getQueryCache()
          .findAll({
            queryKey: [
              'operations-catering-project-evidence-v3',
              '00000000-0000-4000-8000-000000000009',
              org,
            ],
          }),
      ).toHaveLength(0),
    );
  });
  it('sameactor newtoken cannotreuseold session cache', async () => {
    state.read
      .mockResolvedValueOnce({ data: evidence(), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('denied') });
    const v = mount();
    await screen.findByText('105 min');
    const oldKey = v.client.getQueryCache().getAll()[0].queryKey;
    state.token = 'replacement-token';
    v.redraw();
    expect(screen.queryByText('105 min')).toBeNull();
    await screen.findByRole('alert');
    expect(state.headers).toHaveBeenLastCalledWith(
      'Authorization',
      'Bearer replacement-token',
    );
    await waitFor(() =>
      expect(
        v.client.getQueryCache().find({ queryKey: oldKey, exact: true }),
      ).toBeUndefined(),
    );
  });
  it('revokedfreshread removesalreadydisplayed evidence', async () => {
    state.read
      .mockResolvedValueOnce({ data: evidence(), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('denied') });
    const v = mount();
    await screen.findByText('105 min');
    await act(async () => {
      await v.client.invalidateQueries({
        queryKey: ['operations-catering-project-evidence-v3'],
      });
    });
    await screen.findByRole('alert');
    expect(screen.queryByText('105 min')).toBeNull();
  });
  it('sign-out removes mounted evidence and its session cache', async () => {
    state.read.mockResolvedValue({ data: evidence(), error: null });
    const v = mount();
    await screen.findByText('105 min');
    state.actor = null;
    state.token = null;
    v.redraw();
    expect(screen.queryByText('105 min')).toBeNull();
    await screen.findByRole('alert');
    await waitFor(() =>
      expect(
        v.client
          .getQueryCache()
          .findAll({ queryKey: ['operations-catering-project-evidence-v3'] }),
      ).toHaveLength(0),
    );
  });
  it('pendingrequest unmountcancel beatsignoredlateRPC', async () => {
    let release!: (v: unknown) => void;
    state.read.mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const v = mount();
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
    v.unmount();
    expect(state.signals[0].aborted).toBe(true);
    await act(async () => release({ data: evidence(), error: null }));
    expect(screen.queryByText('105 min')).toBeNull();
  });
});

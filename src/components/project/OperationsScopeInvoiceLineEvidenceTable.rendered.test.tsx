// @vitest-environment jsdom
// Synthetic RPC/render test only; genuine authenticated Postgres and hosted evidence remain open.
import { webcrypto } from 'node:crypto';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsScopeInvoiceLineEvidenceTable } from './OperationsScopeInvoiceLineEvidenceTable';
import type { ScopeInvoiceLineReadAuthority } from '@/lib/economy/projectScopeInvoiceLines';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const state = vi.hoisted(() => ({
  token: 'token-a',
  session: vi.fn(),
  result: vi.fn(),
  rpc: vi.fn(),
  signals: [] as AbortSignal[],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: state.session },
    rpc: (name: string, args: unknown) => {
      state.rpc(name, args);
      return { setHeader: (_header: string, _value: string) => ({ abortSignal: (signal: AbortSignal) => {
        state.signals.push(signal);
        return state.result();
      } }) };
    },
  },
}));
const authority: ScopeInvoiceLineReadAuthority = {
  actorId: id(1), accessToken: 'token-a', organizationId: id(2),
  request: {
    schema_version: 'operations-scope-invoice-line-admin-read.v1',
    root_kind: 'project', root_id: id(3), expected_composition_snapshot_id: id(4),
  },
};
function evidence() {
  return {
    schema_version: 'operations-scope-invoice-line-admin-evidence.v1',
    authority_scope: 'canonical_scope_invoice_line_capture',
    organization_id: id(2), root_kind: 'project', root_id: id(3), composition_snapshot_id: id(4),
    scope_revision: 2, source_currentness: 'saved_receiver_heads_only', captured_inventory_matches_current: true,
    as_of: '2026-10-03T06:30:00Z', availability: 'available', unavailable_source_count: 0,
    source_coverage: 'unavailable', credit_eligible: false,
    lines: [{ source_organization_id: id(10), project_id: id(11), invoice_id: id(12), source_allocation_id: id(13),
      amount_minor: 6000, currency: 'SEK', source_economic_revision: 5, source_status: 'preliminary',
      source_economic_fingerprint: 'a'.repeat(64) }],
  };
}
const clients: QueryClient[] = [];
function mount(boundary = 'boundary-a') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}>
    <OperationsScopeInvoiceLineEvidenceTable authority={authority} boundary={boundary} />
  </QueryClientProvider>);
  return { ...view, client, redraw: (next: string) => view.rerender(<QueryClientProvider client={client}>
    <OperationsScopeInvoiceLineEvidenceTable authority={authority} boundary={next} />
  </QueryClientProvider>) };
}
beforeEach(() => {
  state.token = 'token-a'; state.session.mockReset(); state.result.mockReset(); state.rpc.mockReset(); state.signals = [];
  state.session.mockImplementation(() => Promise.resolve({ data: { session: { access_token: state.token, user: { id: id(1) } } }, error: null }));
  state.result.mockResolvedValue({ data: evidence(), error: null });
  vi.stubGlobal('crypto', webcrypto);
  vi.stubEnv('VITE_OPERATIONS_SCOPE_INVOICE_LINE_EVIDENCE_ENABLED', 'true');
});
afterEach(() => {
  cleanup(); for (const client of clients.splice(0)) client.clear();
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('authenticated default-off Operations invoice line evidence', () => {
  it('default-off performs no RPC', () => {
    vi.stubEnv('VITE_OPERATIONS_SCOPE_INVOICE_LINE_EVIDENCE_ENABLED', 'false');
    expect(mount().container.textContent).toBe('');
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('renders exact tuple and no calculated total', async () => {
    mount();
    expect(await screen.findByText(id(12))).toBeTruthy();
    expect(screen.getByText(id(13))).toBeTruthy();
    expect(screen.getByText(id(11))).toBeTruthy();
    expect(screen.getByRole('region').textContent?.replace(/\s/g, '')).toContain('60,00kr');
    expect(screen.getByText('Preliminär')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.queryByText(/Totalt/)).toBeNull();
    expect(state.rpc).toHaveBeenCalledWith('read_operations_scope_invoice_lines_admin_v1', { p_request: authority.request });
  });
  it('missing/currentness is unavailable and never rendered as zero', async () => {
    const missing = evidence();
    Object.assign(missing, { lines: [], availability: 'unavailable', unavailable_source_count: 1, captured_inventory_matches_current: false });
    state.result.mockResolvedValue({ data: missing, error: null });
    mount();
    await screen.findByText('Verifierade fakturarader saknas.');
    expect(screen.getByRole('alert').textContent).toContain('visas inte som noll');
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();
  });
  it('rejected or negative copied line fails closed', async () => {
    const invalid = evidence();
    invalid.lines[0].source_status = 'rejected';
    invalid.lines[0].amount_minor = -6000;
    state.result.mockResolvedValue({ data: invalid, error: null });
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByText(id(12))).toBeNull();
    expect(screen.queryByText('-60,00 kr')).toBeNull();
  });
  it('pending refetch hides cached rows and a stale replay remains hidden', async () => {
    const view = mount();
    await screen.findByText(id(12));
    let release!: (value: unknown) => void;
    state.result.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let refresh!: Promise<void>;
    await act(async () => { refresh = view.client.invalidateQueries(); });
    await screen.findByText('Hämtar fakturarader…');
    expect(screen.queryByText(id(12))).toBeNull();
    await act(async () => { release({ data: null, error: { code: 'PT409', message: 'private identity' } }); await refresh; });
    await screen.findByRole('alert');
    expect(screen.queryByText(id(12))).toBeNull();
  });
  it('session boundary removes old line cache and token is absent from keys', async () => {
    const view = mount();
    await screen.findByText(id(12));
    const oldKey = view.client.getQueryCache().getAll()[0].queryKey;
    state.token = 'token-b';
    view.redraw('boundary-b');
    expect(screen.queryByText(id(12))).toBeNull();
    await screen.findByRole('alert');
    await waitFor(() => expect(view.client.getQueryCache().find({ queryKey: oldKey, exact: true })).toBeUndefined());
    expect(JSON.stringify(view.client.getQueryCache().getAll().map(query => query.queryKey))).not.toContain('token-a');
  });
  it('unmount aborts an outstanding RPC and ignores a late row', async () => {
    let release!: (value: unknown) => void;
    state.result.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const view = mount();
    await waitFor(() => expect(state.result).toHaveBeenCalled());
    view.unmount();
    expect(state.signals[0].aborted).toBe(true);
    await act(async () => release({ data: evidence(), error: null }));
    expect(screen.queryByText(id(12))).toBeNull();
  });
  it('successful private query is excluded from the app persistence predicate', async () => {
    const view = mount();
    await screen.findByText(id(12));
    expect(view.client.getQueryCache().getAll()[0].meta?.persist).toBe(false);
    expect(dehydrate(view.client, { shouldDehydrateQuery: query => query.state.status === 'success' && query.meta?.persist !== false }).queries).toHaveLength(0);
  });
});

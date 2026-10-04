import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectCostEvidencePanel } from './ProjectCostEvidencePanel';

const state = vi.hoisted(() => ({
  actor: '22222222-2222-4222-8222-222222222222' as string | null,
  org: '11111111-1111-4111-8111-111111111111' as string | null,
  authLoading: false, orgLoading: false, orgError: null as Error | null,
  rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.actor ? { id: state.actor } : null, session: state.actor ? { access_token: 'synthetic-evidence-token', user: { id: state.actor } } : null, isLoading: state.authLoading }) }));
vi.mock('@/hooks/useOrganizationId', () => ({ useOrganizationId: () => ({ organizationId: state.org, isLoading: state.orgLoading, error: state.orgError }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: state.actor ? { access_token: 'synthetic-evidence-token', user: { id: state.actor } } : null }, error: null }) },
  rpc: (name: string, args: unknown) => ({ setHeader: (header: string, value: string) => {
    if (header !== 'Authorization' || value !== 'Bearer synthetic-evidence-token') throw new Error('Synthetic fixture header mismatch');
    return { abortSignal: (_signal: AbortSignal) => state.rpc(name, args) };
  } }),
} }));

const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '33333333-3333-4333-8333-333333333333';
const actorA = '22222222-2222-4222-8222-222222222222';
const project = '55555555-5555-4555-8555-555555555555';
const stamp = '2026-10-02T00:00:00Z';
const evidence = (organizationId = orgA) => ({
  schema: 'operations-project-cost-evidence.v1', organizationId, projectId: project, generatedAt: stamp,
  missingPersonnelCostCount: 0,
  personnel: [{ streamKey: 'a'.repeat(64), reportId: actorA, lineId: 'line-a', revision: 3, timeVersion: 2,
    workDate: '2026-10-01', minutes: 90, amountMinor: 45001 as number | null, currency: 'SEK',
    status: 'preliminary', coverage: 'complete', publishedAt: stamp,
    financeDeliveryState: 'delivered', financeCurrentRevision: 3 }],
  invoices: [{ sourceOrganizationId: orgB, invoiceId: '44444444-4444-4444-8444-444444444444',
    allocationId: '66666666-6666-4666-8666-666666666666', revision: 2, documentNumber: 'F-1', kind: 'invoice',
    amountMinor: 540000, currency: 'SEK', status: 'preliminary', accountingState: 'booked', settlementState: 'paid',
    providerApprovalState: 'not_pending', providerSourceChanged: false, creditRelationCoverage: 'not_applicable', receivedAt: stamp }],
});
const clients: QueryClient[] = [];
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })) {
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><ProjectCostEvidencePanel projectId={project} /></QueryClientProvider>);
  return { ...view, client, redraw: () => view.rerender(<QueryClientProvider client={client}><ProjectCostEvidencePanel projectId={project} /></QueryClientProvider>) };
}
function moneyText(element: HTMLElement) { return element.textContent?.replace(/[\s\u00a0]/g, ''); }
beforeEach(() => {
  state.actor = actorA; state.org = orgA; state.authLoading = false; state.orgLoading = false; state.orgError = null;
  state.rpc.mockReset(); vi.stubEnv('VITE_OPERATIONS_COST_EVIDENCE_ENABLED', 'true');
});
afterEach(() => { cleanup(); for (const c of clients.splice(0)) c.clear(); vi.unstubAllEnvs(); });

describe('Actual Operations evidence component with explicit synthetic Auth/RPC', () => {
  it('default-off gate renders nothing and issues no read', () => {
    vi.stubEnv('VITE_OPERATIONS_COST_EVIDENCE_ENABLED', 'false');
    expect(mount().container.textContent).toBe(''); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('copies saved45001 rather than recomputing90min; booked/paid remains preliminary', async () => {
    state.rpc.mockResolvedValue({ data: evidence(), error: null }); mount();
    const table = await screen.findByRole('region', { name: 'Personalkostnadsunderlag' });
    expect(moneyText(table)).toContain('450,01kr'); expect(within(table).getByText('90 min')).toBeTruthy();
    expect(within(table).getByText('Kvitterat')).toBeTruthy();
    const invoices = screen.getByLabelText('Projektkopplade leverantörsfakturor');
    expect(within(invoices).getByText('Preliminär')).toBeTruthy(); expect(moneyText(invoices)).toContain('5400,00kr');
    expect(state.rpc).toHaveBeenCalledWith('read_operations_project_cost_evidence_v1', { p_organization_id: orgA, p_project_id: project });
  });
  it('missing rate remains explicit null and cannot render manufactured zero', async () => {
    const data = evidence(); data.personnel[0].amountMinor = null; data.personnel[0].coverage = 'missing_rate'; data.missingPersonnelCostCount = 1;
    state.rpc.mockResolvedValue({ data, error: null }); mount();
    expect(await screen.findByText('Kostnad saknas')).toBeTruthy(); expect(screen.getByRole('alert').textContent).toContain('inte komplett');
    expect(screen.getByRole('region', { name: 'Personalkostnadsunderlag' }).textContent).not.toContain('0,00');
  });
  it('confirmation replaces the same invoice identity and amount, never adds a second row', async () => {
    const first = evidence(); const confirmed = evidence(); confirmed.invoices[0].status = 'confirmed';
    state.rpc.mockResolvedValueOnce({ data: first, error: null }).mockResolvedValueOnce({ data: confirmed, error: null });
    const view = mount(); await screen.findByText('F-1');
    await act(async () => { await view.client.invalidateQueries({ queryKey: ['operations-project-cost-evidence'] }); });
    await screen.findByText('Bekräftad');
    const table = screen.getByLabelText('Projektkopplade leverantörsfakturor');
    expect(within(table).getAllByRole('row')).toHaveLength(2); expect(within(table).getAllByText('F-1')).toHaveLength(1);
    expect(moneyText(table)).toContain('5400,00kr');
  });
  it('rejects confirmed changed-source evidence rather than showing false confirmation', async () => {
    const data = evidence(); data.invoices[0].status = 'confirmed'; data.invoices[0].providerSourceChanged = true;
    state.rpc.mockResolvedValue({ data, error: null }); mount();
    expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.queryByText('F-1')).toBeNull(); expect(screen.queryByText('Bekräftad')).toBeNull();
  });
  it('hides previous tenant and actor data while a new tenant read is pending or denied', async () => {
    let resolve!: (v: { data: unknown; error: unknown }) => void;
    state.rpc.mockResolvedValueOnce({ data: evidence(), error: null }).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = mount(); await screen.findByText('F-1');
    state.actor = '77777777-7777-4777-8777-777777777777'; state.org = orgB; view.redraw();
    expect(screen.queryByText('F-1')).toBeNull(); expect(screen.getByRole('status').textContent).toContain('Hämtar');
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(2));
    await act(async () => resolve({ data: null, error: new Error('denied') }));
    await screen.findByRole('alert'); expect(screen.queryByText('F-1')).toBeNull();
  });
  it('hides cached same-tenant evidence during network refetch and after failure', async () => {
    let resolve!: (v: { data: unknown; error: unknown }) => void;
    state.rpc.mockResolvedValueOnce({ data: evidence(), error: null }).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = mount(); await screen.findByText('F-1');
    act(() => { void view.client.invalidateQueries({ queryKey: ['operations-project-cost-evidence'] }); });
    await waitFor(() => expect(screen.queryByText('F-1')).toBeNull());
    await act(async () => resolve({ data: null, error: new Error('offline') }));
    await screen.findByRole('alert'); expect(screen.queryByText('F-1')).toBeNull();
  });
  it('does not fetch for missing actor or unresolved organisation; sign-out hides cached data', async () => {
    state.rpc.mockResolvedValue({ data: evidence(), error: null }); const view = mount(); await screen.findByText('F-1');
    state.actor = null; view.redraw(); expect(screen.queryByText('F-1')).toBeNull(); expect(screen.getByRole('alert')).toBeTruthy();
    expect(state.rpc).toHaveBeenCalledTimes(1);
    state.actor = actorA; state.org = null; state.orgLoading = true; view.redraw(); expect(screen.getByRole('status')).toBeTruthy();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
});

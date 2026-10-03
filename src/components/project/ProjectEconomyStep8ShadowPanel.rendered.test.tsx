// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectEconomyStep8ShadowPanel } from './ProjectEconomyStep8ShadowPanel';
import { validateProjectEconomyStep8ShadowRead } from '@/lib/economy/projectEconomyStep8ShadowAdapter';

const state = vi.hoisted(() => ({
  actorId: '00000000-0000-4000-8000-000000000001' as string | null,
  organizationId: '00000000-0000-4000-8000-000000000002' as string | null,
  token: 'synthetic-token' as string | null,
  session: vi.fn(),
  rpc: vi.fn(),
  header: vi.fn(),
  read: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: state.actorId ? { id: state.actorId } : null,
    session: state.actorId && state.token ? { access_token: state.token, user: { id: state.actorId } } : null,
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: state.organizationId, isLoading: false, error: null }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: state.session },
    rpc: (name: string, args: unknown) => {
      state.rpc(name,args);
      return { setHeader: (name: string,value: string) => {
        state.header(name,value);
        return { abortSignal: () => state.read() };
      } };
    },
  },
}));

const projectId = '00000000-0000-4000-8000-000000000003';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const response = () => ({
  schema: 'operations-project-economy-step8-shadow.v1',
  organizationId: state.organizationId,
  projectId,
  generatedAt: '2026-10-03T22:00:00Z',
  authority: 'operations_received_evidence',
  personnel: [
    {
      organizationId: state.organizationId, projectId, sourceBookingId: id(10),
      sourceTimeStreamKey: 'a'.repeat(64), reportId: id(11), lineId: 'line-1', revision: 2,
      timeSnapshotVersion: 3, workDate: '2026-10-03', minutes: 120, amountMinor: 60000,
      currency: 'SEK', status: 'confirmed', coverage: 'complete',
    },
    {
      organizationId: state.organizationId, projectId, sourceBookingId: id(12),
      sourceTimeStreamKey: 'b'.repeat(64), reportId: id(13), lineId: 'line-2', revision: 1,
      timeSnapshotVersion: 1, workDate: '2026-10-03', minutes: 90, amountMinor: null,
      currency: 'SEK', status: 'preliminary', coverage: 'missing_rate',
    },
  ],
  invoices: [{
    organizationId: state.organizationId, projectId, sourceOrganizationId: id(20), invoiceId: id(21),
    allocationId: id(22), revision: 2, sourceObservationId: id(23),
    sourceProtocol: 'v2', sourceEconomicRevision: 1, sourceEconomicFingerprint: 'e'.repeat(64),
    publicationFingerprint: 'c'.repeat(64), documentFingerprint: 'd'.repeat(64), kind: 'invoice',
    amountMinor: 540000, currency: 'SEK', status: 'confirmed', approvalState: 'not_pending',
    accountingState: 'booked', settlementState: 'unpaid', sourceChanged: false,
    creditRelationCoverage: 'not_applicable', creditRelationshipFingerprint: null,
    sourceAnchor: 'f'.repeat(64), creditedSourceAnchor: null, unallocatedMinor: 0, exceptions: [],
  },{
    organizationId: state.organizationId, projectId, sourceOrganizationId: id(20), invoiceId: id(24),
    allocationId: id(25), revision: 2, sourceObservationId: id(26),
    sourceProtocol: 'v2', sourceEconomicRevision: 1, sourceEconomicFingerprint: '4'.repeat(64),
    publicationFingerprint: '5'.repeat(64), documentFingerprint: '6'.repeat(64), kind: 'credit',
    amountMinor: -10000, currency: 'SEK', status: 'confirmed', approvalState: 'not_pending',
    accountingState: 'booked', settlementState: 'unpaid', sourceChanged: false,
    creditRelationCoverage: 'linked', creditRelationshipFingerprint: '1'.repeat(64),
    sourceAnchor: '2'.repeat(64), creditedSourceAnchor: '3'.repeat(64), unallocatedMinor: 0, exceptions: [],
  }],
  exceptions: [{
    category: 'personnel', identity: `${'b'.repeat(64)}:line-2`, code: 'missing_rate', amountMinor: null,
  }],
  coverage: { personnel: 'incomplete', invoices: 'complete' },
  financeRecalculated: false,
  authoritativeTotals: false,
  replacesLegacyTotals: false,
  shadowOnly: true,
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}>
    <ProjectEconomyStep8ShadowPanel projectId={projectId} />
  </QueryClientProvider>);
  return { ...view, client };
}

beforeEach(() => {
  vi.stubEnv('VITE_PROJECT_ECONOMY_STEP8_SHADOW_ENABLED','true');
  state.actorId='00000000-0000-4000-8000-000000000001';
  state.organizationId='00000000-0000-4000-8000-000000000002';
  state.token='synthetic-token';
  state.session.mockReset().mockImplementation(() => Promise.resolve({
    data: { session: { access_token: state.token, user: { id: state.actorId } } }, error: null,
  }));
  state.rpc.mockReset();state.header.mockReset();
  state.read.mockReset().mockImplementation(() => Promise.resolve({ data: response(), error: null }));
});
afterEach(() => { cleanup();vi.unstubAllEnvs(); });

describe('ProjectEconomyStep8ShadowPanel', () => {
  it('renders row-level paired evidence without recalculation or authoritative totals', async () => {
    expect(() => validateProjectEconomyStep8ShadowRead(response(), {
      actorId: state.actorId!,accessToken: state.token!,organizationId: state.organizationId!,projectId,
    })).not.toThrow();
    mount();
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(state.session).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/6[\s\u00a0]?00,00 kr/i)).toBeTruthy();
    const panel = screen.getByTestId('project-economy-step8-shadow');
    expect(within(panel).getByText('Skuggvy')).toBeTruthy();
    expect(within(panel).getByText(/räknar inte om belopp/i)).toBeTruthy();
    expect(within(panel).getByText(/ersätter inte den befintliga ekonomisammanställningen/i)).toBeTruthy();
    expect(within(panel).getByText('Saknas')).toBeTruthy();
    expect(within(panel).getAllByText('Giltig kostnadssats saknas.').length).toBeGreaterThanOrEqual(1);
    expect(within(panel).getByText(new RegExp(id(10)))).toBeTruthy();
    expect(within(panel).getByText(new RegExp(id(12)))).toBeTruthy();
    expect(within(panel).getByText(new RegExp('a'.repeat(64)))).toBeTruthy();
    expect(within(panel).getByText(new RegExp(id(23)))).toBeTruthy();
    expect(within(panel).getByText(new RegExp('c'.repeat(64)))).toBeTruthy();
    expect(within(panel).getByText(new RegExp('1'.repeat(64)))).toBeTruthy();
    expect(within(panel).getByText(new RegExp('2'.repeat(64)))).toBeTruthy();
    expect(within(panel).getByText(new RegExp('3'.repeat(64)))).toBeTruthy();
    expect(within(panel).getByText(/typ invoice/i)).toBeTruthy();
    expect(within(panel).getByText(/typ credit/i)).toBeTruthy();
    expect(within(panel).getAllByText(/källprotokoll v2/i)).toHaveLength(2);
    expect(within(panel).getAllByText(/källändring nej/i)).toHaveLength(2);
    expect(within(panel).getByText(/kreditkoppling not_applicable/i)).toBeTruthy();
    expect(within(panel).getByText(/kreditkoppling linked/i)).toBeTruthy();
    expect(state.rpc).toHaveBeenCalledWith('read_operations_project_economy_step8_shadow_v1', expect.any(Object));
    expect(state.header).toHaveBeenCalledWith('Authorization','Bearer synthetic-token');
    expect(panel.textContent).not.toContain('hourlyRateMinor');
    expect(panel.textContent).not.toContain('time-stream-raw');
    expect(panel.textContent).not.toMatch(/total kostnad/i);
  });

  it('shows a bounded error and no rows when the authenticated RPC fails', async () => {
    state.read.mockResolvedValue({ data: null, error: { message: 'denied' } });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('kunde inte hämtas');
    expect(screen.queryByLabelText('Personalunderlag')).toBeNull();
  });

  it('renders nothing while the feature flag is disabled', async () => {
    vi.stubEnv('VITE_PROJECT_ECONOMY_STEP8_SHADOW_ENABLED','false');
    const view=mount();
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

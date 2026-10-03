// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectEconomyPage from './ProjectEconomyPage';

const state = vi.hoisted(() => ({
  actorId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  accessToken: 'synthetic-session-one',
  projectId: '00000000-0000-4000-8000-000000000003',
  project: {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Standardprojekt ett',
    booking_id: '00000000-0000-4000-8000-000000000004',
    status: 'active',
    booking: { large_project_id: null },
  },
  readShadow: vi.fn(),
  projectMutation: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ projectId: state.projectId }),
  useOutletContext: () => ({ project: state.project }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: state.actorId },
    session: { access_token: state.accessToken, user: { id: state.actorId } },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({
    organizationId: state.organizationId,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: state.projectMutation,
  },
}));

vi.mock('@/lib/economy/projectEconomyStep8ShadowAdapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/economy/projectEconomyStep8ShadowAdapter')>()),
  readProjectEconomyStep8Shadow: state.readShadow,
}));

vi.mock('@/components/project/ProjectEconomyTab', () => ({
  ProjectEconomyTab: ({ projectId }: { projectId: string }) => (
    <section data-testid="legacy-project-economy" data-project-id={projectId}>
      <button type="button">Befintlig ekonomifunktion</button>
    </section>
  ),
}));

vi.mock('@/components/project/ProjectStaffTab', () => ({
  ProjectStaffTab: () => <section>Personalflik</section>,
}));

type Authority = {
  actorId: string;
  accessToken: string;
  organizationId: string;
  projectId: string;
};

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function shadowResponse(authority: Authority, reportId: string) {
  return {
    schema: 'operations-project-economy-step8-shadow.v1' as const,
    organizationId: authority.organizationId,
    projectId: authority.projectId,
    generatedAt: '2026-10-04T00:00:00Z',
    authority: 'operations_received_evidence' as const,
    personnel: [{
      organizationId: authority.organizationId,
      projectId: authority.projectId,
      sourceBookingId: id(10),
      sourceTimeStreamKey: authority.projectId.endsWith('3') ? 'a'.repeat(64) : 'b'.repeat(64),
      reportId,
      lineId: 'line-1',
      revision: 1,
      timeSnapshotVersion: 1,
      workDate: '2026-10-03',
      minutes: 120,
      amountMinor: 60000,
      currency: 'SEK',
      status: 'confirmed' as const,
      coverage: 'complete' as const,
    }],
    invoices: [],
    exceptions: [],
    coverage: { personnel: 'complete' as const, invoices: 'complete' as const },
    financeRecalculated: false as const,
    authoritativeTotals: false as const,
    replacesLegacyTotals: false as const,
    shadowOnly: true as const,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <ProjectEconomyPage />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, rerenderPage: () => view.rerender(tree()) };
}

beforeEach(() => {
  vi.stubEnv('VITE_PROJECT_ECONOMY_STEP8_SHADOW_ENABLED', 'true');
  state.actorId = id(1);
  state.organizationId = id(2);
  state.accessToken = 'synthetic-session-one';
  state.projectId = id(3);
  state.project = {
    id: id(3),
    name: 'Standardprojekt ett',
    booking_id: id(4),
    status: 'active',
    booking: { large_project_id: null },
  };
  state.readShadow.mockReset();
  state.projectMutation.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('ProjectEconomyPage Step 8 shadow mount', () => {
  it('keeps the legacy economy surface and performs zero Step 8 reads while the flag is off', async () => {
    vi.stubEnv('VITE_PROJECT_ECONOMY_STEP8_SHADOW_ENABLED', 'false');

    renderPage();

    expect(screen.getByTestId('legacy-project-economy')).toHaveAttribute('data-project-id', id(3));
    expect(screen.getByRole('button', { name: 'Befintlig ekonomifunktion' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Ekonomi' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Personal' })).toBeTruthy();
    expect(screen.queryByTestId('project-economy-step8-shadow')).toBeNull();
    await Promise.resolve();
    expect(state.readShadow).not.toHaveBeenCalled();
    expect(state.projectMutation).not.toHaveBeenCalled();
  });

  it('renders read-only evidence after the legacy view and isolates each authority boundary', async () => {
    const firstReportId = id(11);
    const secondReportId = id(12);
    const thirdReportId = id(13);
    const fourthReportId = id(14);
    const pending: Array<(value: ReturnType<typeof shadowResponse>) => void> = [];

    state.readShadow
      .mockImplementationOnce((_client: unknown, authority: Authority) =>
        Promise.resolve(shadowResponse(authority, firstReportId)))
      .mockImplementation((_client: unknown, _authority: Authority) =>
        new Promise((resolve) => { pending.push(resolve); }));

    const view = renderPage();

    expect(await screen.findByText(new RegExp(firstReportId))).toBeTruthy();
    expect(state.readShadow).toHaveBeenCalledTimes(1);
    expect(state.readShadow.mock.calls[0][1]).toEqual({
      actorId: id(1),
      accessToken: 'synthetic-session-one',
      organizationId: id(2),
      projectId: id(3),
    });

    const legacy = screen.getByTestId('legacy-project-economy');
    const panel = screen.getByTestId('project-economy-step8-shadow');
    expect(legacy.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).queryAllByRole('link')).toHaveLength(0);
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0);
    expect(state.projectMutation).not.toHaveBeenCalled();

    state.actorId = id(21);
    state.accessToken = 'synthetic-session-two';
    view.rerenderPage();
    expect(screen.queryByText(new RegExp(firstReportId))).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Hämtar parallellt underlag');
    await waitFor(() => expect(state.readShadow).toHaveBeenCalledTimes(2));
    expect(state.readShadow.mock.calls[1][1]).toEqual({
      actorId: id(21),
      accessToken: 'synthetic-session-two',
      organizationId: id(2),
      projectId: id(3),
    });
    pending.shift()?.(shadowResponse(state.readShadow.mock.calls[1][1], secondReportId));
    expect(await screen.findByText(new RegExp(secondReportId))).toBeTruthy();
    expect(screen.queryByText(new RegExp(firstReportId))).toBeNull();

    state.organizationId = id(22);
    view.rerenderPage();
    expect(screen.queryByText(new RegExp(secondReportId))).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Hämtar parallellt underlag');
    await waitFor(() => expect(state.readShadow).toHaveBeenCalledTimes(3));
    expect(state.readShadow.mock.calls[2][1]).toEqual({
      actorId: id(21),
      accessToken: 'synthetic-session-two',
      organizationId: id(22),
      projectId: id(3),
    });
    pending.shift()?.(shadowResponse(state.readShadow.mock.calls[2][1], thirdReportId));
    expect(await screen.findByText(new RegExp(thirdReportId))).toBeTruthy();
    expect(screen.queryByText(new RegExp(secondReportId))).toBeNull();

    state.projectId = id(23);
    state.project = {
      id: id(23),
      name: 'Standardprojekt två',
      booking_id: id(24),
      status: 'active',
      booking: { large_project_id: null },
    };
    view.rerenderPage();
    expect(screen.queryByText(new RegExp(thirdReportId))).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Hämtar parallellt underlag');
    await waitFor(() => expect(state.readShadow).toHaveBeenCalledTimes(4));
    expect(state.readShadow.mock.calls[3][1]).toEqual({
      actorId: id(21),
      accessToken: 'synthetic-session-two',
      organizationId: id(22),
      projectId: id(23),
    });
    pending.shift()?.(shadowResponse(state.readShadow.mock.calls[3][1], fourthReportId));
    expect(await screen.findByText(new RegExp(fourthReportId))).toBeTruthy();
    expect(screen.queryByText(new RegExp(thirdReportId))).toBeNull();
    expect(screen.getByTestId('legacy-project-economy')).toHaveAttribute('data-project-id', id(23));
    expect(state.projectMutation).not.toHaveBeenCalled();
  });
});

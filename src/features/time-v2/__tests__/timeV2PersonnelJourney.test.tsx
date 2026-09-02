import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearLocalOverrides, writeLocalOverride } from '@/features/time-v2/lib/moduleFlag';
import { normalizePersonnelDetail } from '@/features/time-v2/lib/contract';

const ORG = 'synthetic-tenant-0001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: ORG, isLoading: false, error: null }),
}));

/** Synthetic TEST-only Time server owning the personnel app account state. */
const timeServer = {
  state: 'none' as 'none' | 'invited' | 'active' | 'suspended',
  issuedAt: null as string | null,
  lastAppAccessAt: null as string | null,
  detail() {
    return normalizePersonnelDetail({
      personnel_id: 'p-1',
      personnel_name: 'Anna Test',
      hub_account: { present: true, state: 'active' },
      app_account: {
        state: this.state,
        activation_issued_at: this.issuedAt,
        activation_ticket: 'SECRET-TICKET',
      },
      last_app_access_at: this.lastAppAccessAt,
      last_evidence_sync_at: this.lastAppAccessAt,
      last_submission_sync_at: null,
      visible_assignments: this.state === 'active' ? 2 : 0,
      is_test_fixture: true,
      assignments:
        this.state === 'active'
          ? [{ assignment_id: 'a1', label: 'Projekt A', date: '2026-09-02', visible_in_app: true }]
          : [{ assignment_id: 'a1', label: 'Projekt A', date: '2026-09-02', visible_in_app: false, reason_hidden: 'Appkonto ej aktivt' }],
      diagnostics: [{ id: 'app', label: 'Appåtkomst', ok: this.state === 'active', detail: null }],
    })!;
  },
  /** Worker side: consumes the disposable activation and logs in. */
  workerActivates() {
    this.state = 'active';
    this.lastAppAccessAt = '2026-09-01T12:00:00Z';
  },
};

vi.mock('@/features/time-v2/lib/personnelClient', async () => {
  const actual = await vi.importActual<typeof import('@/features/time-v2/lib/personnelClient')>(
    '@/features/time-v2/lib/personnelClient',
  );
  return {
    ...actual,
    fetchTimeV2PersonnelDetail: vi.fn(async () => timeServer.detail()),
    issueTimeV2AppActivation: vi.fn(async () => {
      timeServer.state = 'invited';
      timeServer.issuedAt = '2026-09-01T08:00:00Z';
      return { accepted: true, appAccountState: 'invited', activationIssuedAt: timeServer.issuedAt, activationExpiresAt: null, message: null };
    }),
    suspendTimeV2AppAccess: vi.fn(async () => {
      timeServer.state = 'suspended';
      return { accepted: true, appAccountState: 'suspended', activationIssuedAt: null, activationExpiresAt: null, message: null };
    }),
    reactivateTimeV2AppAccess: vi.fn(async () => {
      timeServer.state = 'active';
      return { accepted: true, appAccountState: 'active', activationIssuedAt: null, activationExpiresAt: null, message: null };
    }),
  };
});

vi.mock('@/features/time-v2/lib/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/time-v2/lib/client')>('@/features/time-v2/lib/client');
  return { ...actual, getTimeV2BaseUrl: () => 'https://time.test' };
});

import TimeV2PersonnelDetailPage from '@/features/time-v2/pages/TimeV2PersonnelDetailPage';

const renderDetail = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/time-v2/personnel/p-1']}>
        <Routes>
          <Route path="/time-v2/personnel/:personnelId" element={<TimeV2PersonnelDetailPage />} />
          <Route path="/staff-management/time" element={<div>legacy</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Time V2 personnel support journey', () => {
  beforeEach(() => {
    clearLocalOverrides();
    timeServer.state = 'none';
    timeServer.issuedAt = null;
    timeServer.lastAppAccessAt = null;
  });

  it('redirects to legacy when the module flag is off', async () => {
    renderDetail();
    await screen.findByText('legacy');
  });

  it('issues activation, worker activates, then suspend blocks and reactivate restores app access', async () => {
    writeLocalOverride(ORG, true);
    renderDetail();

    await screen.findByTestId('time-v2-personnel-detail');
    // Separate identities are shown.
    expect((await screen.findByTestId('time-v2-hub-state')).textContent).toMatch(/Finns/);
    expect((await screen.findByTestId('time-v2-app-state')).textContent).toMatch(/Inget appkonto/);

    // 1. Admin issues a disposable activation — no ticket/secret is rendered.
    fireEvent.click(screen.getByTestId('time-v2-issue-activation'));
    await waitFor(() => expect(screen.getByTestId('time-v2-app-state').textContent).toMatch(/Aktivering utfärdad/));
    expect(document.body.textContent).not.toContain('SECRET-TICKET');

    // 2. Worker activates and logs in on the personnel app.
    timeServer.workerActivates();
    fireEvent.click(screen.getByText('Uppdatera'));
    await waitFor(() => expect(screen.getByTestId('time-v2-app-state').textContent).toMatch(/Aktivt/));
    // 3. Assignment visibility + last successful app access diagnostics.
    await waitFor(() => expect(screen.getByTestId('time-v2-visible-assignments').textContent).toMatch(/2/));
    expect(screen.getByTestId('time-v2-last-access').textContent).not.toMatch(/aldrig/);
    expect(screen.getByTestId('time-v2-assignment-a1').textContent).toMatch(/Synligt/);

    // 4. Suspend blocks app access.
    fireEvent.click(screen.getByTestId('time-v2-suspend'));
    await waitFor(() => expect(screen.getByTestId('time-v2-app-state').textContent).toMatch(/Spärrat/));
    await waitFor(() => expect(screen.getByTestId('time-v2-assignment-a1').textContent).toMatch(/Dolt/));

    // 5. Reactivate restores it.
    fireEvent.click(screen.getByTestId('time-v2-reactivate'));
    await waitFor(() => expect(screen.getByTestId('time-v2-app-state').textContent).toMatch(/Aktivt/));
  });
});

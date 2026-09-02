import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearLocalOverrides, writeLocalOverride } from '@/features/time-v2/lib/moduleFlag';
import { normalizeReviewQueueList, normalizeSubmissionDetail } from '@/features/time-v2/lib/contract';

const ORG = 'synthetic-tenant-0001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: ORG, isLoading: false, error: null }),
}));

const queuePayload = normalizeReviewQueueList({
  generated_at: new Date().toISOString(),
  rows: [
    {
      submission_id: 'sub-1', group: 'needs_review', state: 'submitted', date: '2026-09-01',
      personnel_id: 'p1', personnel_name: 'Anna Test', project_id: 'pr1', project_name: 'Projekt A',
      total_minutes: 485, travel_minutes: 45, break_minutes: 30, revision: 1,
      payroll_attestable: true, project_attestable: false, is_test_fixture: true,
    },
    {
      submission_id: 'sub-2', group: 'approved', state: 'attested', date: '2026-09-02',
      personnel_id: 'p2', personnel_name: 'Bo Test', project_name: 'Projekt B',
      total_minutes: 300, revision: 2, is_test_fixture: true,
    },
  ],
});

const detailPayload = normalizeSubmissionDetail({
  submission_id: 'sub-1', date: '2026-09-01', personnel_name: 'Anna Test', state: 'submitted',
  group: 'needs_review', revision: 1, snapshot_version: 'sha-abc',
  totals: { total_minutes: 485, work_minutes: 410, travel_minutes: 45, break_minutes: 30 },
  targets: [{ target_id: 'pr1', target_name: 'Projekt A', minutes: 410 }],
  segments: [{ id: 'seg1', kind: 'work', label: 'Arbete Projekt A', minutes: 240, locked: true }],
  decisions: [{ id: 'd1', action: 'submitted', actor: 'Anna', revision: 1 }],
  evidence: [{ id: 'e1', kind: 'scan', label: 'Scan 123', reference: 'time://scan/123' }],
  correction: { requested: true, requested_at: '2026-09-02T08:00:00Z', reason: 'Saknad rast' },
  attestability: { payroll: true, project: false, blocked_reason: 'Projektmål saknas' },
  is_test_fixture: true,
})!;

vi.mock('@/features/time-v2/lib/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/time-v2/lib/client')>(
    '@/features/time-v2/lib/client',
  );
  return {
    ...actual,
    getTimeV2BaseUrl: () => 'https://time.test',
    fetchTimeV2ReviewQueue: vi.fn(async () => queuePayload),
    fetchTimeV2SubmissionDetail: vi.fn(async () => detailPayload),
  };
});

import TimeV2ReviewQueuePage from '@/features/time-v2/pages/TimeV2ReviewQueuePage';
import TimeV2SubmissionDetailPage from '@/features/time-v2/pages/TimeV2SubmissionDetailPage';

const renderApp = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/time-v2/review']}>
        <Routes>
          <Route path="/time-v2/review" element={<TimeV2ReviewQueuePage />} />
          <Route path="/time-v2/review/:submissionId" element={<TimeV2SubmissionDetailPage />} />
          <Route path="/staff-management/time" element={<div>LEGACY TID OCH LÖN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Time V2 review queue → detail journey', () => {
  beforeEach(() => clearLocalOverrides());

  it('flag OFF → queue is not reachable, legacy remains default', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('LEGACY TID OCH LÖN')).toBeInTheDocument());
  });

  it('flag ON → renders the four contract groups with truthful rows', async () => {
    writeLocalOverride(ORG, true);
    renderApp();
    await waitFor(() => expect(screen.getByTestId('time-v2-review-queue')).toBeInTheDocument());
    for (const g of ['needs_review', 'correction', 'approved', 'missing']) {
      expect(screen.getByTestId(`time-v2-group-${g}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('time-v2-queue-row-sub-1')).toBeInTheDocument();
    expect(screen.getByTestId('time-v2-queue-row-sub-2')).toBeInTheDocument();
    // Synthetic fixtures are explicitly TEST-labelled.
    expect(screen.getAllByText('TEST').length).toBeGreaterThan(0);
  });

  it('filters by text using contract fields only', async () => {
    writeLocalOverride(ORG, true);
    renderApp();
    await waitFor(() => expect(screen.getByTestId('time-v2-queue-row-sub-2')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Fritext'), { target: { value: 'Anna' } });
    await waitFor(() => expect(screen.queryByTestId('time-v2-queue-row-sub-2')).toBeNull());
    expect(screen.getByTestId('time-v2-queue-row-sub-1')).toBeInTheDocument();
  });

  it('opens a row into the exact immutable snapshot detail', async () => {
    writeLocalOverride(ORG, true);
    renderApp();
    await waitFor(() => expect(screen.getByTestId('time-v2-queue-row-sub-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('time-v2-queue-row-sub-1'));

    await waitFor(() => expect(screen.getByTestId('time-v2-submission-detail')).toBeInTheDocument());
    expect(screen.getByText(/låst snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/snapshot sha-abc/)).toBeInTheDocument();
    expect(screen.getByTestId('time-v2-detail-segments')).toHaveTextContent('Arbete Projekt A');
    expect(screen.getByTestId('time-v2-detail-decisions')).toHaveTextContent('submitted');
    expect(screen.getByTestId('time-v2-detail-evidence')).toHaveTextContent('time://scan/123');
    expect(screen.getByTestId('time-v2-detail-correction')).toHaveTextContent('Saknad rast');
    const attest = screen.getByTestId('time-v2-detail-attestability');
    expect(attest).toHaveTextContent('Lön: attesterbar');
    expect(attest).toHaveTextContent('Projekt: ej attesterbar');
    // Decisions are issued through the Time command panel (Package C).
    expect(screen.getByTestId('time-v2-decision-panel')).toBeInTheDocument();
    expect(screen.getByTestId('time-v2-attest-payroll')).not.toBeDisabled();
    expect(screen.getByTestId('time-v2-attest-project')).toBeDisabled();
  });
});

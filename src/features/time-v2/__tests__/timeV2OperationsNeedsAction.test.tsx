/**
 * Rendered planner journey for the default "Kräver åtgärd" view:
 * every actionable case (time to review, time missing, time correction
 * pending, open expense, unbound expense) is listed with a visible operator
 * reason, a fully settled day is hidden by default and only appears under
 * "Alla dagar". No decisions are taken here; nothing mutates Planning data.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { realShapedSubmission } from './fixtures/expenseFixture';

const PLANNING_ORG = 'f5e5cade-0000-4000-8000-000000000001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: PLANNING_ORG, isLoading: false, error: null }),
}));

vi.mock('@/features/time-v2/hooks/useTimeV2Flag', () => ({
  useTimeV2Flag: () => ({ enabled: true, isLoading: false, organizationId: PLANNING_ORG, isTestOverride: true, source: 'local_test_override', reason: 'test' }),
}));

const base = {
  date: '2026-06-04',
  project_id: 'proj-1',
  project_name: 'Westmans',
  total_minutes: 480,
  travel_minutes: 60,
  break_minutes: 30,
  revision: 1,
  payroll_attestable: true,
  project_attestable: true,
};

const queueRows = [
  { ...base, submission_id: 's-review', group: 'needs_review', state: 'submitted', personnel_id: 'p-a', personnel_name: 'Anna Granska' },
  { ...base, submission_id: 's-missing', group: 'missing', state: 'missing', total_minutes: 0, travel_minutes: 0, break_minutes: 0, personnel_id: 'p-b', personnel_name: 'Bosse Saknad' },
  { ...base, submission_id: 's-corr', group: 'correction', state: 'correction_requested', personnel_id: 'p-c', personnel_name: 'Cilla Rättelse' },
  { ...base, submission_id: 's-open', group: 'approved', state: 'approved', personnel_id: 'p-d', personnel_name: 'David Utlägg' },
  { ...base, submission_id: 's-unbound', group: 'approved', state: 'approved', personnel_id: 'p-e', personnel_name: 'Eva Obunden' },
  { ...base, submission_id: 's-settled', group: 'approved', state: 'approved', personnel_id: 'p-f', personnel_name: 'Filip Klar' },
];

const BOUND = { status: 'bound', bookingId: 'b-1', bookingNumber: '2604-29', bookingTitle: 'Westmans middag', projectId: 'proj-1', projectName: 'Westmans', reason: null };
const UNBOUND = { status: 'unbound', bookingId: null, bookingNumber: null, bookingTitle: null, projectId: null, projectName: null, reason: 'booking_not_in_tenant' };

const expenseRows = [
  { submission: realShapedSubmission({ submissionId: 'e0000000-0000-4000-8000-00000000000a', worker: { personnelId: 'p-d', displayName: 'David Utlägg' } }), binding: BOUND },
  { submission: realShapedSubmission({ submissionId: 'e0000000-0000-4000-8000-00000000000b', worker: { personnelId: 'p-e', displayName: 'Eva Obunden' } }), binding: UNBOUND },
  { submission: realShapedSubmission({ submissionId: 'e0000000-0000-4000-8000-00000000000c', state: 'approved', worker: { personnelId: 'p-f', displayName: 'Filip Klar' } }), binding: BOUND },
];

vi.mock('@/features/time-v2/lib/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/time-v2/lib/client')>('@/features/time-v2/lib/client');
  const { normalizeReviewQueueList, normalizeSubmissionDetail } = await vi.importActual<typeof import('@/features/time-v2/lib/contract')>('@/features/time-v2/lib/contract');
  return {
    ...actual,
    getTimeV2BaseUrl: () => 'https://time.staging.test',
    fetchTimeV2ReviewQueue: async () => normalizeReviewQueueList({ generated_at: '2026-06-05T08:00:00Z', rows: queueRows }),
    fetchTimeV2SubmissionDetail: async (_org: string, submissionId: string) => {
      const q = queueRows.find((r) => r.submission_id === submissionId) ?? queueRows[0];
      return normalizeSubmissionDetail({
        submission_id: q.submission_id,
        date: q.date,
        personnel_name: q.personnel_name,
        personnel_id: q.personnel_id,
        state: q.state,
        group: q.group,
        revision: q.revision,
        snapshot_version: `snap-${q.submission_id}`,
        totals: { total_minutes: q.total_minutes, work_minutes: q.total_minutes, travel_minutes: q.travel_minutes, break_minutes: q.break_minutes },
        targets: [],
        segments: [],
        correction: { requested: q.group === 'correction' },
        attestability: { payroll: false, project: false, payroll_attested: false, project_attested: false, blocked_reason: null },
      });
    },
  };
});

vi.mock('@/features/time-v2/lib/commands', () => ({
  requestTimeV2Correction: async () => { throw new Error('no decisions in this journey'); },
  attestTimeV2Payroll: async () => { throw new Error('no decisions in this journey'); },
  attestTimeV2Project: async () => { throw new Error('no decisions in this journey'); },
}));

vi.mock('@/features/time-v2/lib/expenseClient', async () => {
  const { mapExpenseList } = await vi.importActual<typeof import('@/features/time-v2/lib/expenseContract')>('@/features/time-v2/lib/expenseContract');
  return {
    fetchTimeV2Expenses: async () => mapExpenseList({ scope: 'all', rows: expenseRows, counts: {} }, '2026-06-05T08:00:00Z'),
    fetchTimeV2ExpenseChain: async () => ({ scope: 'all', rows: [], counts: {}, generatedAt: null }),
    decideTimeV2Expense: async () => { throw new Error('no decisions in this journey'); },
    fetchTimeV2ReceiptUrl: async () => { throw new Error('no receipt reads in this journey'); },
  };
});

const TimeV2OperationsPage = (await import('@/features/time-v2/pages/TimeV2OperationsPage')).default;

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/time-v2/operations']}>
        <Routes>
          <Route path="/time-v2/operations" element={<TimeV2OperationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const rowByWorker = (name: string) =>
  screen.getAllByTestId('time-v2-ops-row').find((el) => el.textContent?.includes(name)) ?? null;

/** Both Time contracts load independently; wait until the join has settled on `n` rows. */
const awaitRows = (n: number) =>
  waitFor(() => expect(screen.getAllByTestId('time-v2-ops-row')).toHaveLength(n));

describe('Planning "Tid & utlägg — drift": default "Kräver åtgärd" view', () => {
  it('lists every actionable case with its operator reason and hides the settled day', async () => {
    renderPage();
    await awaitRows(5);

    const rows = screen.getAllByTestId('time-v2-ops-row');
    expect(rows.every((r) => r.getAttribute('data-needs-action') === 'true')).toBe(true);

    const review = rowByWorker('Anna Granska')!;
    expect(within(review).getByTestId('time-v2-ops-action-reasons').textContent).toContain('Arbetstid väntar på granskning');

    const missing = rowByWorker('Bosse Saknad')!;
    expect(within(missing).getByTestId('time-v2-ops-action-reasons').textContent).toContain('Arbetstid saknas för dagen');
    expect(missing.textContent).toContain('Saknas');

    const correction = rowByWorker('Cilla Rättelse')!;
    expect(within(correction).getByTestId('time-v2-ops-action-reasons').textContent).toContain('Rättelse av arbetstid pågår');

    const open = rowByWorker('David Utlägg')!;
    expect(within(open).getByTestId('time-v2-ops-action-reasons').textContent).toContain('1 utlägg väntar på beslut');

    const unbound = rowByWorker('Eva Obunden')!;
    const unboundReasons = within(unbound).getByTestId('time-v2-ops-action-reasons').textContent ?? '';
    expect(unboundReasons).toContain('1 utlägg väntar på beslut');
    expect(unboundReasons).toContain('1 utlägg saknar bokning/projekt i din organisation');

    expect(rowByWorker('Filip Klar')).toBeNull();
  });

  it('exposes the counters for every actionable case', async () => {
    renderPage();
    await awaitRows(5);
    expect(screen.getByTestId('time-v2-ops-count-rows').textContent).toContain('5');
    expect(screen.getByTestId('time-v2-ops-count-action').textContent).toContain('5');
    expect(screen.getByTestId('time-v2-ops-count-time').textContent).toContain('1');
    expect(screen.getByTestId('time-v2-ops-count-missing').textContent).toContain('1');
    expect(screen.getByTestId('time-v2-ops-count-correction').textContent).toContain('1');
    expect(screen.getByTestId('time-v2-ops-count-expenses').textContent).toContain('2');
    expect(screen.getByTestId('time-v2-ops-count-unbound').textContent).toContain('1');
  });

  it('shows the settled day only under "Alla dagar", marked as done with no reasons', async () => {
    renderPage();
    await awaitRows(5);
    fireEvent.click(screen.getByTestId('time-v2-ops-view-all'));
    await awaitRows(6);
    const settled = rowByWorker('Filip Klar')!;
    expect(settled.getAttribute('data-needs-action')).toBe('false');
    expect(within(settled).getByTestId('time-v2-ops-settled').textContent).toBe('Klar');
    expect(within(settled).queryByTestId('time-v2-ops-action-reasons')).toBeNull();
    expect(screen.getByTestId('time-v2-ops-count-action').textContent).toContain('5');

    fireEvent.click(settled);
    const detail = await screen.findByTestId('time-v2-ops-detail');
    expect(within(detail).getByTestId('time-v2-ops-detail-reasons-none').textContent).toContain('Inget kräver åtgärd');
  });

  it('carries the reasons into the detail header when a missing-time day is opened', async () => {
    renderPage();
    await awaitRows(5);
    fireEvent.click(rowByWorker('Bosse Saknad')!);
    const detail = await screen.findByTestId('time-v2-ops-detail');
    expect(within(detail).getByTestId('time-v2-ops-detail-reasons').textContent).toContain('Arbetstid saknas för dagen');
  });
});

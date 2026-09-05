/**
 * Rendered planner journey through the operational surface:
 * one worker + work date shows submitted time, travel, expense with amount /
 * category / comment / receipt, deviation and immutable version — and the
 * planner can request a time correction, attest payroll and decide the expense
 * against its exact immutable version. No Planning source data is mutated and
 * nothing posts payroll / bookkeeping / project cost.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HASH_A, V1, realShapedSubmission } from './fixtures/expenseFixture';

const PLANNING_ORG = 'f5e5cade-0000-4000-8000-000000000001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: PLANNING_ORG, isLoading: false, error: null }),
}));

vi.mock('@/features/time-v2/hooks/useTimeV2Flag', () => ({
  useTimeV2Flag: () => ({ enabled: true, isLoading: false, organizationId: PLANNING_ORG, isTestOverride: true, source: 'local_test_override', reason: 'test' }),
}));

const queueRow = {
  submission_id: 'sub-1',
  group: 'needs_review',
  state: 'submitted',
  date: '2026-06-04',
  personnel_id: 'p-1',
  personnel_name: 'Raivis',
  project_id: 'proj-1',
  project_name: 'Westmans',
  total_minutes: 480,
  travel_minutes: 60,
  break_minutes: 30,
  revision: 3,
  payroll_attestable: true,
  project_attestable: true,
};

const detail = {
  submission_id: 'sub-1',
  date: '2026-06-04',
  personnel_name: 'Raivis',
  personnel_id: 'p-1',
  state: 'submitted',
  group: 'needs_review',
  revision: 3,
  snapshot_version: 'snap-3-abc',
  totals: { total_minutes: 480, work_minutes: 390, travel_minutes: 60, break_minutes: 30 },
  targets: [{ target_id: 'proj-1', target_name: 'Westmans', minutes: 390 }],
  segments: [
    { id: 's1', kind: 'work', label: 'Rigg Riddarhustorget', minutes: 390, target_name: 'Westmans' },
    { id: 's2', kind: 'travel', label: 'Resa till plats', minutes: 60 },
  ],
  correction: { requested: false },
  attestability: { payroll: true, project: true, payroll_attested: false, project_attested: false, blocked_reason: null },
};

const calls: Array<{ op: string; payload: unknown }> = [];

vi.mock('@/features/time-v2/lib/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/time-v2/lib/client')>('@/features/time-v2/lib/client');
  const { normalizeReviewQueueList, normalizeSubmissionDetail } = await vi.importActual<typeof import('@/features/time-v2/lib/contract')>('@/features/time-v2/lib/contract');
  return {
    ...actual,
    getTimeV2BaseUrl: () => 'https://time.staging.test',
    fetchTimeV2ReviewQueue: async () => normalizeReviewQueueList({ generated_at: '2026-06-05T08:00:00Z', rows: [queueRow] }),
    fetchTimeV2SubmissionDetail: async () => normalizeSubmissionDetail(detail),
  };
});

vi.mock('@/features/time-v2/lib/commands', () => ({
  requestTimeV2Correction: async (input: unknown) => { calls.push({ op: 'time.correction', payload: input }); return { ok: true }; },
  attestTimeV2Payroll: async (input: unknown) => { calls.push({ op: 'time.attestPayroll', payload: input }); return { ok: true }; },
  attestTimeV2Project: async (input: unknown) => { calls.push({ op: 'time.attestProject', payload: input }); return { ok: true }; },
}));

vi.mock('@/features/time-v2/lib/expenseClient', async () => {
  const { mapExpenseList } = await vi.importActual<typeof import('@/features/time-v2/lib/expenseContract')>('@/features/time-v2/lib/expenseContract');
  return {
    fetchTimeV2Expenses: async () =>
      mapExpenseList(
        {
          scope: 'all',
          rows: [
            {
              submission: realShapedSubmission(),
              binding: { status: 'bound', bookingId: 'b-1', bookingNumber: '2604-29', bookingTitle: 'Westmans middag', projectId: 'proj-1', projectName: 'Westmans', reason: null },
            },
          ],
          counts: {},
        },
        '2026-06-05T08:00:00Z',
      ),
    fetchTimeV2ExpenseChain: async () => ({ scope: 'all', rows: [], counts: {}, generatedAt: null }),
    decideTimeV2Expense: async (input: unknown) => {
      calls.push({ op: 'expenses.decide', payload: input });
      const i = input as { submissionId: string; submissionVersion: number; expectedSnapshotHash: string; decision: string; reason?: string };
      return {
        decision: {
          decisionId: 'd-1',
          submissionId: i.submissionId,
          submissionVersion: i.submissionVersion,
          snapshotHash: i.expectedSnapshotHash,
          decision: i.decision,
          reason: i.reason ?? null,
          decidedAt: '2026-06-05T08:10:00Z',
          decidedBy: 'planner@test',
        },
        idempotencyKey: 'idem-1',
      };
    },
    fetchTimeV2ReceiptUrl: async () => ({ url: 'https://storage.test/signed', expiresAt: null, ttlSeconds: 120, attachmentId: 'att-1', sha256: null, mimeType: 'image/jpeg' }),
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

describe('Planning "Tid & utlägg — drift" journey', () => {
  beforeEach(() => { calls.length = 0; });

  it('shows worker + work date with time, travel, expense and booking/project binding', async () => {
    renderPage();
    const row = await screen.findByTestId('time-v2-ops-row');
    expect(within(row).getByText('Raivis')).toBeTruthy();
    expect(within(row).getByText('2026-06-04')).toBeTruthy();
    expect(row.textContent).toContain('8 h 00 min');
    expect(row.textContent).toContain('Bokning 2604-29');
    expect(within(row).getByTestId('time-v2-ops-expense-total').textContent).toContain('1 utlägg');
    expect(screen.getByTestId('time-v2-ops-count-action').textContent).toContain('1');
  });

  it('opens the exact submission with segments, immutable version and the expense snapshot', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('time-v2-ops-row'));

    const timeBlock = await screen.findByTestId('time-v2-ops-time-block');
    expect(timeBlock.textContent).toContain('rev 3');
    expect(timeBlock.textContent).toContain('snap-3-abc');
    expect(within(screen.getByTestId('time-v2-ops-segments')).getAllByRole('listitem')).toHaveLength(2);

    const expense = await screen.findByTestId('time-v2-ops-expense');
    expect(expense.getAttribute('data-submission-id')).toBe(V1);
    expect(expense.textContent).toContain('material');
    expect(expense.textContent).toContain('Bauhaus');
    expect(expense.textContent).toContain('Buntband till riggen');
    expect(within(expense).getByTestId('time-v2-expense-receipt')).toBeTruthy();
  });

  it('lets the planner request a time correction and attest payroll from the same flow', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('time-v2-ops-row'));

    const reason = await screen.findByTestId('time-v2-correction-reason');
    fireEvent.change(reason, { target: { value: 'Rasten saknas på eftermiddagen.' } });
    fireEvent.click(screen.getByTestId('time-v2-request-correction'));
    await waitFor(() => expect(calls.some((c) => c.op === 'time.correction')).toBe(true));
    expect(calls.find((c) => c.op === 'time.correction')!.payload).toMatchObject({ expectedRevision: 3, reason: 'Rasten saknas på eftermiddagen.' });

    fireEvent.click(screen.getByTestId('time-v2-attest-payroll'));
    await waitFor(() => expect(calls.some((c) => c.op === 'time.attestPayroll')).toBe(true));
  });

  it('decides the expense against its exact immutable version and hash', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('time-v2-ops-row'));
    fireEvent.click(await screen.findByTestId('time-v2-expense-approve'));

    await waitFor(() => expect(calls.some((c) => c.op === 'expenses.decide')).toBe(true));
    expect(calls.find((c) => c.op === 'expenses.decide')!.payload).toMatchObject({
      submissionId: V1,
      submissionVersion: 1,
      expectedSnapshotHash: HASH_A,
      decision: 'approved',
    });
    expect(await screen.findByTestId('time-v2-expense-decided')).toBeTruthy();
  });

  it('opens the receipt only through a freshly minted short-lived signed read', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    fireEvent.click(await screen.findByTestId('time-v2-ops-row'));
    fireEvent.click(await screen.findByTestId('time-v2-open-receipt'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://storage.test/signed', '_blank', 'noopener,noreferrer'));
    expect((await screen.findByTestId('time-v2-receipt-ttl')).textContent).toContain('120');
    open.mockRestore();
  });
});

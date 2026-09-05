import { describe, it, expect } from 'vitest';
import {
  buildOperationsRows,
  filterOperationsRows,
  operationsCounts,
  describeTargets,
  workerKeyOf,
} from '@/features/time-v2/lib/operations';
import { buildExpenseChains } from '@/features/time-v2/lib/expenseContract';
import { normalizeQueueRow, type TimeV2QueueRow } from '@/features/time-v2/lib/contract';
import { parseExpenseSubmissionV1 } from '../../../../supabase/functions/_shared/time-v2/expenseReviewV1';
import { HASH_A, HASH_B, V1, V2, realShapedSubmission } from './fixtures/expenseFixture';

const queueRow = (over: Partial<Record<string, unknown>> = {}): TimeV2QueueRow =>
  normalizeQueueRow({
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
    revision: 1,
    payroll_attestable: true,
    project_attestable: true,
    ...over,
  }) as TimeV2QueueRow;

const chainsOf = (...subs: unknown[]) =>
  buildExpenseChains(
    subs.map((raw) => ({
      submission: parseExpenseSubmissionV1(raw)!,
      binding: {
        status: 'bound' as const,
        bookingId: 'b-1',
        bookingNumber: '2604-29',
        bookingTitle: 'Westmans middag',
        projectId: 'proj-1',
        projectName: 'Westmans',
        reason: null,
      },
    })),
  );

describe('Time V2 operations join (worker + work date)', () => {
  it('joins one time submission and its expenses into a single operational row', () => {
    const rows = buildOperationsRows({
      queueRows: [queueRow()],
      expenseChains: chainsOf(realShapedSubmission()),
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.workerName).toBe('Raivis');
    expect(r.date).toBe('2026-06-04');
    expect(r.time?.submissionId).toBe('sub-1');
    expect(r.totals.totalMinutes).toBe(480);
    expect(r.totals.expenseCount).toBe(1);
    expect(r.totals.expenseByCurrency).toEqual([{ currency: 'SEK', amountMinor: 24900 }]);
    expect(r.flags.openExpenses).toBe(1);
    expect(r.needsAction).toBe(true);
    expect(describeTargets(r)).toContain('Bokning 2604-29');
  });

  it('keeps an expense day without a submitted work time visible instead of hiding it', () => {
    const rows = buildOperationsRows({ queueRows: [], expenseChains: chainsOf(realShapedSubmission()) });
    expect(rows[0].time).toBeNull();
    expect(rows[0].needsAction).toBe(true);
  });

  it('counts only the latest revision of an immutable chain', () => {
    const chains = chainsOf(
      realShapedSubmission({ state: 'superseded' }),
      realShapedSubmission({
        submissionId: V2,
        version: 2,
        previousSubmissionId: V1,
        canonicalHash: HASH_B,
        money: { amountMinor: 8900, currency: 'SEK' },
        submittedAt: '2026-06-05T09:00:00Z',
        state: 'submitted',
      }),
    );
    const rows = buildOperationsRows({ queueRows: [queueRow()], expenseChains: chains });
    expect(rows[0].expenses).toHaveLength(1);
    expect(rows[0].expenses[0].latest.version).toBe(2);
    expect(rows[0].expenses[0].revisions).toHaveLength(2);
    expect(rows[0].totals.expenseByCurrency).toEqual([{ currency: 'SEK', amountMinor: 8900 }]);
    expect(rows[0].expenses[0].latest.canonicalHash).toBe(HASH_B);
    expect(rows[0].expenses[0].revisions[0].canonicalHash).toBe(HASH_A);
  });

  it('never merges two different workers or two different dates', () => {
    const rows = buildOperationsRows({
      queueRows: [queueRow(), queueRow({ submission_id: 'sub-2', personnel_id: 'p-2', personnel_name: 'Anna' })],
      expenseChains: chainsOf(realShapedSubmission({ expenseDate: '2026-06-05' })),
    });
    expect(rows).toHaveLength(3);
    expect(workerKeyOf('p-1', 'Raivis')).not.toBe(workerKeyOf('p-2', 'Anna'));
  });

  it('filters by date range, view and free text without re-deriving anything', () => {
    const rows = buildOperationsRows({
      queueRows: [queueRow(), queueRow({ submission_id: 'sub-2', group: 'approved', date: '2026-05-01', personnel_id: 'p-3', personnel_name: 'Kim' })],
      expenseChains: [],
    });
    expect(filterOperationsRows(rows, { view: 'needs_action' })).toHaveLength(1);
    expect(filterOperationsRows(rows, { view: 'all' })).toHaveLength(2);
    expect(filterOperationsRows(rows, { view: 'all', from: '2026-06-01' })).toHaveLength(1);
    expect(filterOperationsRows(rows, { view: 'all', query: 'kim' })).toHaveLength(1);
    expect(filterOperationsRows(rows, { view: 'expenses' })).toHaveLength(0);
  });

  it('summarises the planner workload from contract fields only', () => {
    const chains = buildExpenseChains([
      {
        submission: parseExpenseSubmissionV1(realShapedSubmission())!,
        binding: { status: 'unbound', bookingId: null, bookingNumber: null, bookingTitle: null, projectId: null, projectName: null, reason: 'booking_not_in_tenant' },
      },
    ]);
    const rows = buildOperationsRows({ queueRows: [queueRow()], expenseChains: chains });
    const c = operationsCounts(rows);
    expect(c).toMatchObject({ rows: 1, needsAction: 1, timeNeedsReview: 1, openExpenses: 1, unboundExpenses: 1, workers: 1 });
  });
});

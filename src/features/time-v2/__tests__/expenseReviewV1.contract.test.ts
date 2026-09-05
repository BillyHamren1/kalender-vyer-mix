import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EXPENSE_DECISIONS,
  EXPENSE_LIMITS,
  EXPENSE_OPERATIONS,
  EXPENSE_REVIEW_SCHEMA,
  assertNoPostingFields,
  expenseDecisionIdempotencyKey,
  groupIntoChains,
  orderRevisionChain,
  parseExpenseSubmissionV1,
  validateExpenseDecideInput,
} from '../../../../supabase/functions/_shared/time-v2/expenseReviewV1';
import * as frontend from '@/features/time-v2/lib/expenseContract';
import { TIME_OPERATIONS } from '@/features/time-v2/lib/boundary';

import { HASH_A, HASH_B, V1, V2, realShapedSubmission } from './fixtures/expenseFixture';

describe('planning-expense-review.v1 — contract', () => {
  it('pins the schema and operation names', () => {
    expect(EXPENSE_REVIEW_SCHEMA).toBe('planning-expense-review.v1');
    expect(EXPENSE_OPERATIONS).toEqual({ list: 'expenses.list', decide: 'expenses.decide', receiptUrl: 'expenses.receiptUrl' });
    expect(TIME_OPERATIONS.expensesList).toBe(EXPENSE_OPERATIONS.list);
    expect(TIME_OPERATIONS.expensesDecide).toBe(EXPENSE_OPERATIONS.decide);
    expect(TIME_OPERATIONS.expensesReceiptUrl).toBe(EXPENSE_OPERATIONS.receiptUrl);
    expect(EXPENSE_DECISIONS).toEqual(['approved', 'rejected', 'correction_requested']);
  });

  it('frontend uses the SAME contract module (no drift possible)', () => {
    expect(frontend.parseExpenseSubmissionV1).toBe(parseExpenseSubmissionV1);
    expect(frontend.EXPENSE_OPERATIONS).toBe(EXPENSE_OPERATIONS);
    const shared = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/time-v2/expenseReviewV1.ts'), 'utf8');
    expect(shared).not.toMatch(/^import /m); // dependency-free so both runtimes can load it
  });

  it('parses a real-shaped Time snapshot and drops the storage path', () => {
    const s = parseExpenseSubmissionV1(realShapedSubmission());
    expect(s).not.toBeNull();
    expect(s!.money).toEqual({ amountMinor: 24900, currency: 'SEK' });
    expect(s!.attachments[0]).not.toHaveProperty('objectPath');
    expect(s!.attachments[0].sha256).toBe('c'.repeat(64));
    expect(s!.isTestFixture).toBe(true);
    expect(s!.worker?.displayName).toBe('Raivis');
    // VAT is not part of Time's contract: nothing invents it.
    expect(JSON.stringify(s)).not.toMatch(/vat|moms/i);
  });

  it('fails closed on every required field', () => {
    const bad = [
      { schema: 'expense-submission.v2' },
      { submissionId: 'not-a-uuid' },
      { version: 0 },
      { version: 1.5 },
      { organizationId: 'x' },
      { canonicalHash: 'abc' },
      { expenseDate: '4 juni' },
      { money: { amountMinor: 12.5, currency: 'SEK' } },
      { money: { amountMinor: -1, currency: 'SEK' } },
      { money: { amountMinor: 100, currency: 'kr' } },
      { state: 'draft' },
      { attachments: [{ mimeType: 'image/jpeg' }] },
    ];
    for (const over of bad) expect(parseExpenseSubmissionV1(realShapedSubmission(over)), JSON.stringify(over)).toBeNull();
    expect(parseExpenseSubmissionV1(null)).toBeNull();
    expect(parseExpenseSubmissionV1('str')).toBeNull();
  });

  it('binds the idempotency key to submission + version + hash + decision', () => {
    const k1 = expenseDecisionIdempotencyKey({ submissionId: V1, submissionVersion: 1, canonicalHash: HASH_A, decision: 'approved' });
    const k1b = expenseDecisionIdempotencyKey({ submissionId: V1, submissionVersion: 1, canonicalHash: HASH_A, decision: 'approved' });
    const k2 = expenseDecisionIdempotencyKey({ submissionId: V1, submissionVersion: 2, canonicalHash: HASH_A, decision: 'approved' });
    const k3 = expenseDecisionIdempotencyKey({ submissionId: V1, submissionVersion: 1, canonicalHash: HASH_B, decision: 'approved' });
    const k4 = expenseDecisionIdempotencyKey({ submissionId: V1, submissionVersion: 1, canonicalHash: HASH_A, decision: 'rejected' });
    expect(k1).toBe(k1b);
    expect(new Set([k1, k2, k3, k4]).size).toBe(4);
    expect(k1.length).toBeGreaterThanOrEqual(EXPENSE_LIMITS.idempotencyKeyMin);
    expect(k1.length).toBeLessThanOrEqual(EXPENSE_LIMITS.idempotencyKeyMax);
    expect(k1).not.toMatch(/booking|calendar_events|customer/);
  });

  it('requires a visible reason for rejection and correction, not for approval', () => {
    const base = { submissionId: V1, submissionVersion: 1, expectedSnapshotHash: HASH_A };
    expect(validateExpenseDecideInput({ ...base, decision: 'approved' }).ok).toBe(true);
    const r = validateExpenseDecideInput({ ...base, decision: 'rejected', reason: '  ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('reason_required');
    const c = validateExpenseDecideInput({ ...base, decision: 'correction_requested', reason: 'Kvittot är oläsligt' });
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.value.reason).toBe('Kvittot är oläsligt');
    expect(validateExpenseDecideInput({ ...base, decision: 'approved', expectedSnapshotHash: 'nope' }).ok).toBe(false);
    expect(validateExpenseDecideInput({ ...base, decision: 'approved', submissionVersion: '1' }).ok).toBe(false);
  });

  it('refuses any payroll/bookkeeping/project-cost posting field', () => {
    expect(() => assertNoPostingFields(realShapedSubmission())).not.toThrow();
    expect(() => assertNoPostingFields({ ok: true, payrollExport: {} })).toThrow(/payroll/);
    expect(() => assertNoPostingFields({ nested: [{ ledgerVoucherId: 1 }] })).toThrow(/ledger/);
    expect(() => assertNoPostingFields({ project_cost_line: 1 })).toThrow(/project_cost/);
  });

  it('keeps every revision whole and orders chains oldest → newest', () => {
    const v1 = parseExpenseSubmissionV1(realShapedSubmission({ state: 'correction_requested' }))!;
    const v2 = parseExpenseSubmissionV1(realShapedSubmission({ submissionId: V2, version: 2, previousSubmissionId: V1, canonicalHash: HASH_B }))!;
    const ordered = orderRevisionChain([v2, v1]);
    expect(ordered.map((r) => r.version)).toEqual([1, 2]);
    expect(ordered[0].canonicalHash).toBe(HASH_A);
    expect(ordered[1].canonicalHash).toBe(HASH_B);
    const chains = groupIntoChains([v2, v1]);
    expect([...chains.keys()]).toEqual([V1]);
    expect(chains.get(V1)!.map((r) => r.submissionId)).toEqual([V1, V2]);
  });

  it('formats minor units by the currency, never inventing VAT', () => {
    expect(frontend.formatExpenseAmount({ amountMinor: 24900, currency: 'SEK' })).toMatch(/249/);
    expect(frontend.formatExpenseAmount({ amountMinor: 1050, currency: 'EUR' })).toMatch(/10,50/);
    expect(frontend.formatExpenseAmount({ amountMinor: 500, currency: 'JPY' })).toMatch(/500/);
  });
});

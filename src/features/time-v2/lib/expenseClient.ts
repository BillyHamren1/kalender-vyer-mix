/**
 * Time V2 expense client — reads AND commands of `planning-expense-review.v1`.
 *
 * Every call goes through Planning's same-origin proxy (`callTimeBoundary`);
 * the browser never holds a Time credential, never reads a Time table and
 * never receives a storage path — receipts arrive only as short-lived signed
 * https URLs minted server-side per request.
 */

import { callTimeBoundary, TIME_OPERATIONS, type TimeBoundaryOptions } from './boundary';
import { TimeV2ClientError } from './errors';
import {
  mapExpenseList,
  parseExpenseDecisionRecordV1,
  validateExpenseDecideInput,
  type ExpenseDecision,
  type ExpenseDecisionRecordV1,
  type ExpenseListView,
  type ExpenseScope,
} from './expenseContract';

export interface ExpenseClientOptions extends TimeBoundaryOptions {
  signal?: AbortSignal;
}

export async function fetchTimeV2Expenses(scope: ExpenseScope, opts: ExpenseClientOptions = {}): Promise<ExpenseListView> {
  const env = await callTimeBoundary(TIME_OPERATIONS.expensesList, { scope }, opts);
  return mapExpenseList(env.data, env.generatedAt);
}

/** Full immutable chain (all revisions) for one submission id. */
export async function fetchTimeV2ExpenseChain(submissionId: string, opts: ExpenseClientOptions = {}): Promise<ExpenseListView> {
  const env = await callTimeBoundary(TIME_OPERATIONS.expensesList, { scope: 'all', submissionId }, opts);
  return mapExpenseList(env.data, env.generatedAt);
}

export interface DecideExpenseInput {
  submissionId: string;
  /** Exact version rendered when the planner decided. */
  submissionVersion: number;
  /** Exact canonicalHash rendered when the planner decided. */
  expectedSnapshotHash: string;
  decision: ExpenseDecision;
  reason?: string;
}

export interface DecideExpenseResult {
  decision: ExpenseDecisionRecordV1;
  idempotencyKey: string;
}

export async function decideTimeV2Expense(input: DecideExpenseInput, opts: ExpenseClientOptions = {}): Promise<DecideExpenseResult> {
  const v = validateExpenseDecideInput(input);
  if (v.ok === false) throw new TimeV2ClientError('invalid_input', v.message, 400, v.code);
  const env = await callTimeBoundary(TIME_OPERATIONS.expensesDecide, {
    submissionId: v.value.submissionId,
    submissionVersion: v.value.submissionVersion,
    expectedSnapshotHash: v.value.expectedSnapshotHash,
    decision: v.value.decision,
    reason: v.value.reason,
    idempotencyKey: v.value.idempotencyKey,
  }, opts);
  const d = (env.data ?? {}) as Record<string, unknown>;
  const decision = parseExpenseDecisionRecordV1(d.decision);
  if (!decision) throw new TimeV2ClientError('bad_payload', 'Proxyn returnerade inget giltigt beslutskvitto.');
  if (decision.submissionVersion !== v.value.submissionVersion || decision.snapshotHash !== v.value.expectedSnapshotHash) {
    throw new TimeV2ClientError('bad_payload', 'Beslutskvittot gäller en annan version/hash än den du såg.');
  }
  return { decision, idempotencyKey: typeof d.idempotencyKey === 'string' ? d.idempotencyKey : v.value.idempotencyKey };
}

export interface ReceiptUrlResult {
  url: string;
  expiresAt: string | null;
  ttlSeconds: number;
  attachmentId: string;
  sha256: string | null;
  mimeType: string | null;
}

export async function fetchTimeV2ReceiptUrl(
  input: { submissionId: string; attachmentId: string },
  opts: ExpenseClientOptions = {},
): Promise<ReceiptUrlResult> {
  const env = await callTimeBoundary(TIME_OPERATIONS.expensesReceiptUrl, input, opts);
  const d = (env.data ?? {}) as Record<string, unknown>;
  const url = typeof d.url === 'string' && /^https:\/\//i.test(d.url) ? d.url : null;
  if (!url) throw new TimeV2ClientError('bad_payload', 'Ingen signerad https-läsning returnerades.');
  return {
    url,
    expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : null,
    ttlSeconds: typeof d.ttlSeconds === 'number' ? d.ttlSeconds : 120,
    attachmentId: input.attachmentId,
    sha256: typeof d.sha256 === 'string' ? d.sha256 : null,
    mimeType: typeof d.mimeType === 'string' ? d.mimeType : null,
  };
}

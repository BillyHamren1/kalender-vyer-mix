/**
 * planning-expense-review.v1 — Planning's versioned view of Time V2 expenses.
 *
 * Time owns every expense submission as an IMMUTABLE snapshot
 * (`expense-submission.v1`: submissionId, version, previousSubmissionId,
 * canonicalHash, money, attachments, state). Planning never stores, mirrors or
 * rewrites a submission; it renders the exact snapshot Time returns and issues
 * decisions bound to the exact (submissionId, version, canonicalHash) triple.
 *
 * This file is dependency-free so the frontend mirror
 * (`src/features/time-v2/lib/expenseContract.ts`) can be locked 1:1 by test.
 *
 * Nothing here performs or models payroll, bookkeeping or project-cost posting.
 */

export const EXPENSE_REVIEW_SCHEMA = 'planning-expense-review.v1' as const;

/** Time's own submission schema this contract consumes verbatim. */
export const TIME_EXPENSE_SUBMISSION_SCHEMA = 'expense-submission.v1' as const;

/** Adapter operations Planning issues (through its same-origin proxy only). */
export const EXPENSE_OPERATIONS = {
  list: 'expenses.list',
  decide: 'expenses.decide',
  receiptUrl: 'expenses.receiptUrl',
} as const;

export type ExpenseOperation = (typeof EXPENSE_OPERATIONS)[keyof typeof EXPENSE_OPERATIONS];

export const EXPENSE_DECISIONS = ['approved', 'rejected', 'correction_requested'] as const;
export type ExpenseDecision = (typeof EXPENSE_DECISIONS)[number];

/** Decisions that MUST carry a visible reason (Time rejects `reason_required`). */
export const EXPENSE_DECISIONS_REQUIRING_REASON: readonly ExpenseDecision[] = [
  'rejected',
  'correction_requested',
];

export const EXPENSE_SUBMISSION_STATES = [
  'submitted',
  'approved',
  'rejected',
  'correction_requested',
  'superseded',
] as const;
export type ExpenseSubmissionState = (typeof EXPENSE_SUBMISSION_STATES)[number];

/** States a planner may still decide on. */
export const EXPENSE_OPEN_STATES: readonly ExpenseSubmissionState[] = ['submitted'];

export const EXPENSE_ATTACHMENT_STATES = ['pending', 'registered', 'carried', 'missing'] as const;

/** Signed receipt reads are short-lived by contract (Time: 120 s). */
export const EXPENSE_RECEIPT_URL_TTL_SECONDS = 120;

export const EXPENSE_LIMITS = {
  reasonMin: 3,
  reasonMax: 1_000,
  idempotencyKeyMin: 8,
  idempotencyKeyMax: 200,
  maxSubmissionsPerRead: 500,
} as const;

/**
 * Terms that must never appear as keys in anything Planning emits or renders
 * from this contract: Planning does not post to payroll, bookkeeping or project
 * cost, so those fields cannot exist in the boundary.
 */
export const EXPENSE_FORBIDDEN_KEY_TERMS = [
  'payroll',
  'salary',
  'ledger',
  'voucher',
  'bookkeeping',
  'account_number',
  'accountnumber',
  'projectcost',
  'project_cost',
  'posting',
  'exported',
  'fortnox',
] as const;

/* --------------------------------- shapes --------------------------------- */

export interface ExpenseMoneyV1 {
  amountMinor: number;
  currency: string;
}

export interface ExpenseLineageV1 {
  assignmentId: string | null;
  importId: string | null;
  bookingRef: string | null;
  projectRef: string | null;
  sourceVersion: string | null;
}

export interface ExpenseAttachmentV1 {
  attachmentId: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  state: string;
  carriedFromSubmissionId: string | null;
  registeredAt: string | null;
}

export interface ExpenseWorkerV1 {
  personnelId: string | null;
  displayName: string | null;
}

export interface ExpenseDecisionRecordV1 {
  decisionId: string;
  decision: ExpenseDecision;
  submissionVersion: number;
  snapshotHash: string;
  reason: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
}

/** One immutable Time snapshot, parsed fail-closed. */
export interface ExpenseSubmissionV1 {
  schema: typeof TIME_EXPENSE_SUBMISSION_SCHEMA;
  submissionId: string;
  version: number;
  previousSubmissionId: string | null;
  organizationId: string;
  personnelAccountId: string | null;
  lineage: ExpenseLineageV1;
  expenseDate: string;
  money: ExpenseMoneyV1;
  categoryRef: string | null;
  supplier: string | null;
  workerStatement: string | null;
  canonicalHash: string;
  submittedAt: string | null;
  state: ExpenseSubmissionState;
  attachments: ExpenseAttachmentV1[];
  worker: ExpenseWorkerV1 | null;
  decision: ExpenseDecisionRecordV1 | null;
  /** Time marks synthetic staging fixtures; Planning renders them as TEST. */
  isTestFixture: boolean;
}

/** Planning-side binding of a snapshot to its exact source records. */
export interface ExpensePlanningBindingV1 {
  status: 'bound' | 'unbound';
  bookingId: string | null;
  bookingNumber: string | null;
  bookingTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  /** Machine-readable reason when `status === 'unbound'`. */
  reason: string | null;
}

export interface ExpenseReviewRowV1 {
  submission: ExpenseSubmissionV1;
  binding: ExpensePlanningBindingV1;
}

export interface ExpenseDecideInputV1 {
  submissionId: string;
  submissionVersion: number;
  expectedSnapshotHash: string;
  decision: ExpenseDecision;
  reason: string | null;
  idempotencyKey: string;
}

/* -------------------------------- helpers --------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) ? v : null;
const bool = (v: unknown): boolean => v === true;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const isSha256Hex = (v: unknown): v is string => typeof v === 'string' && SHA256_RE.test(v);
export const isExpenseDecision = (v: unknown): v is ExpenseDecision =>
  typeof v === 'string' && (EXPENSE_DECISIONS as readonly string[]).includes(v);
export const isExpenseState = (v: unknown): v is ExpenseSubmissionState =>
  typeof v === 'string' && (EXPENSE_SUBMISSION_STATES as readonly string[]).includes(v);

export function parseExpenseAttachmentV1(raw: unknown): ExpenseAttachmentV1 | null {
  const r = rec(raw);
  if (!r) return null;
  const attachmentId = str(r.attachmentId);
  const state = str(r.state);
  if (!attachmentId || !state) return null;
  return {
    attachmentId,
    mimeType: str(r.mimeType),
    sizeBytes: int(r.sizeBytes),
    sha256: isSha256Hex(r.sha256) ? (r.sha256 as string).toLowerCase() : null,
    state,
    carriedFromSubmissionId: isUuid(r.carriedFromSubmissionId) ? (r.carriedFromSubmissionId as string) : null,
    registeredAt: str(r.registeredAt),
  };
}

export function parseExpenseDecisionRecordV1(raw: unknown): ExpenseDecisionRecordV1 | null {
  const r = rec(raw);
  if (!r) return null;
  const decisionId = str(r.decisionId);
  const version = int(r.submissionVersion);
  if (!decisionId || !isExpenseDecision(r.decision) || version === null || !isSha256Hex(r.snapshotHash)) {
    return null;
  }
  return {
    decisionId,
    decision: r.decision,
    submissionVersion: version,
    snapshotHash: (r.snapshotHash as string).toLowerCase(),
    reason: str(r.reason),
    decidedAt: str(r.decidedAt),
    decidedBy: str(r.decidedBy),
  };
}

/**
 * Fail-closed parser: any missing/invalid required field yields `null` — the
 * row is then reported as unreadable instead of rendered with guesses.
 */
export function parseExpenseSubmissionV1(raw: unknown): ExpenseSubmissionV1 | null {
  const r = rec(raw);
  if (!r) return null;
  if (r.schema !== TIME_EXPENSE_SUBMISSION_SCHEMA) return null;
  const version = int(r.version);
  const money = rec(r.money);
  const amountMinor = money ? int(money.amountMinor) : null;
  const currency = money && typeof money.currency === 'string' ? money.currency.toUpperCase() : null;
  if (
    !isUuid(r.submissionId) ||
    version === null || version < 1 ||
    !isUuid(r.organizationId) ||
    !isSha256Hex(r.canonicalHash) ||
    typeof r.expenseDate !== 'string' || !DATE_RE.test(r.expenseDate) ||
    amountMinor === null || amountMinor < 0 ||
    !currency || !CURRENCY_RE.test(currency) ||
    !isExpenseState(r.state)
  ) {
    return null;
  }
  const lineage = rec(r.lineage) ?? {};
  const attachmentsRaw = Array.isArray(r.attachments) ? r.attachments : [];
  const attachments: ExpenseAttachmentV1[] = [];
  for (const a of attachmentsRaw) {
    const parsed = parseExpenseAttachmentV1(a);
    if (!parsed) return null; // a broken attachment poisons the snapshot
    attachments.push(parsed);
  }
  const worker = rec(r.worker);
  return {
    schema: TIME_EXPENSE_SUBMISSION_SCHEMA,
    submissionId: r.submissionId as string,
    version,
    previousSubmissionId: isUuid(r.previousSubmissionId) ? (r.previousSubmissionId as string) : null,
    organizationId: r.organizationId as string,
    personnelAccountId: str(r.personnelAccountId),
    lineage: {
      assignmentId: str(lineage.assignmentId),
      importId: str(lineage.importId),
      bookingRef: str(lineage.bookingRef),
      projectRef: str(lineage.projectRef),
      sourceVersion: str(lineage.sourceVersion),
    },
    expenseDate: r.expenseDate,
    money: { amountMinor, currency },
    categoryRef: str(r.categoryRef),
    supplier: str(r.supplier),
    workerStatement: str(r.workerStatement),
    canonicalHash: (r.canonicalHash as string).toLowerCase(),
    submittedAt: str(r.submittedAt),
    state: r.state,
    attachments,
    worker: worker ? { personnelId: str(worker.personnelId), displayName: str(worker.displayName) } : null,
    decision: parseExpenseDecisionRecordV1(r.decision),
    isTestFixture: bool(r.isTestFixture) || bool(r.test) || r.environment === 'staging',
  };
}

/**
 * Idempotency key bound to the EXACT snapshot the planner saw. Same input →
 * same key; a new revision or a changed hash yields a new key, so a stale
 * decision can never be replayed onto a newer snapshot.
 */
export function expenseDecisionIdempotencyKey(input: {
  submissionId: string;
  submissionVersion: number;
  canonicalHash: string;
  decision: ExpenseDecision;
}): string {
  const key = `planning:expenses.decide:${input.submissionId}:v${input.submissionVersion}:${input.canonicalHash.slice(0, 16)}:${input.decision}`;
  if (key.length < EXPENSE_LIMITS.idempotencyKeyMin || key.length > EXPENSE_LIMITS.idempotencyKeyMax) {
    throw new Error('idempotency key out of contract bounds');
  }
  return key;
}

export type ExpenseDecideValidation =
  | { ok: true; value: ExpenseDecideInputV1 }
  | { ok: false; code: 'invalid_submission' | 'invalid_version' | 'invalid_hash' | 'invalid_decision' | 'reason_required' | 'reason_too_long'; message: string };

/** Validates a decision request before any network call (client AND proxy). */
export function validateExpenseDecideInput(raw: {
  submissionId: unknown;
  submissionVersion: unknown;
  expectedSnapshotHash: unknown;
  decision: unknown;
  reason?: unknown;
}): ExpenseDecideValidation {
  if (!isUuid(raw.submissionId)) {
    return { ok: false, code: 'invalid_submission', message: 'submissionId måste vara ett giltigt id.' };
  }
  const version = int(raw.submissionVersion);
  if (version === null || version < 1) {
    return { ok: false, code: 'invalid_version', message: 'submissionVersion måste vara ett heltal ≥ 1.' };
  }
  if (!isSha256Hex(raw.expectedSnapshotHash)) {
    return { ok: false, code: 'invalid_hash', message: 'expectedSnapshotHash måste vara en SHA-256.' };
  }
  if (!isExpenseDecision(raw.decision)) {
    return { ok: false, code: 'invalid_decision', message: 'Okänt beslut.' };
  }
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (EXPENSE_DECISIONS_REQUIRING_REASON.includes(raw.decision) && reason.length < EXPENSE_LIMITS.reasonMin) {
    return { ok: false, code: 'reason_required', message: 'En synlig motivering krävs för avslag och rättelse.' };
  }
  if (reason.length > EXPENSE_LIMITS.reasonMax) {
    return { ok: false, code: 'reason_too_long', message: `Motiveringen får vara högst ${EXPENSE_LIMITS.reasonMax} tecken.` };
  }
  const canonicalHash = (raw.expectedSnapshotHash as string).toLowerCase();
  return {
    ok: true,
    value: {
      submissionId: raw.submissionId as string,
      submissionVersion: version,
      expectedSnapshotHash: canonicalHash,
      decision: raw.decision,
      reason: reason || null,
      idempotencyKey: expenseDecisionIdempotencyKey({
        submissionId: raw.submissionId as string,
        submissionVersion: version,
        canonicalHash,
        decision: raw.decision,
      }),
    },
  };
}

/** Deep key scan — throws when a forbidden posting/payroll term is present. */
export function assertNoPostingFields(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPostingFields(v, `${path}[${i}]`));
    return;
  }
  const r = rec(value);
  if (!r) return;
  for (const [k, v] of Object.entries(r)) {
    const lower = k.toLowerCase();
    for (const term of EXPENSE_FORBIDDEN_KEY_TERMS) {
      if (lower.includes(term)) {
        throw new Error(`forbidden posting field "${k}" at ${path}`);
      }
    }
    assertNoPostingFields(v, `${path}.${k}`);
  }
}

/**
 * Orders a revision chain oldest → newest using `previousSubmissionId`, falling
 * back to version order. Never merges or rewrites — each snapshot stays whole.
 */
export function orderRevisionChain(rows: readonly ExpenseSubmissionV1[]): ExpenseSubmissionV1[] {
  const byId = new Map(rows.map((r) => [r.submissionId, r]));
  const roots = rows.filter((r) => !r.previousSubmissionId || !byId.has(r.previousSubmissionId));
  const out: ExpenseSubmissionV1[] = [];
  const seen = new Set<string>();
  const nextOf = new Map<string, ExpenseSubmissionV1[]>();
  for (const r of rows) {
    if (r.previousSubmissionId && byId.has(r.previousSubmissionId)) {
      const list = nextOf.get(r.previousSubmissionId) ?? [];
      list.push(r);
      nextOf.set(r.previousSubmissionId, list);
    }
  }
  const walk = (r: ExpenseSubmissionV1) => {
    if (seen.has(r.submissionId)) return;
    seen.add(r.submissionId);
    out.push(r);
    for (const n of (nextOf.get(r.submissionId) ?? []).sort((a, b) => a.version - b.version)) walk(n);
  };
  for (const root of roots.sort((a, b) => a.version - b.version)) walk(root);
  for (const r of rows) walk(r);
  return out;
}

/** Groups arbitrary rows into chains keyed by their root submission id. */
export function groupIntoChains(rows: readonly ExpenseSubmissionV1[]): Map<string, ExpenseSubmissionV1[]> {
  const byId = new Map(rows.map((r) => [r.submissionId, r]));
  const rootOf = (r: ExpenseSubmissionV1): string => {
    let cur = r;
    const guard = new Set<string>();
    while (cur.previousSubmissionId && byId.has(cur.previousSubmissionId) && !guard.has(cur.submissionId)) {
      guard.add(cur.submissionId);
      cur = byId.get(cur.previousSubmissionId) as ExpenseSubmissionV1;
    }
    return cur.submissionId;
  };
  const chains = new Map<string, ExpenseSubmissionV1[]>();
  for (const r of rows) {
    const root = rootOf(r);
    const list = chains.get(root) ?? [];
    list.push(r);
    chains.set(root, list);
  }
  for (const [k, list] of chains) chains.set(k, orderRevisionChain(list));
  return chains;
}

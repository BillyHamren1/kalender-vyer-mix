/**
 * Frontend binding of `planning-expense-review.v1`.
 *
 * The contract itself lives ONCE in the dependency-free shared module used by
 * Planning's proxy (`supabase/functions/_shared/time-v2/expenseReviewV1.ts`);
 * this file re-exports it and adds render-only helpers (labels, money
 * formatting, revision-chain views). Nothing here reads Time or Planning
 * tables and nothing models payroll/bookkeeping/project-cost posting.
 */

import {
  EXPENSE_OPEN_STATES,
  parseExpenseSubmissionV1,
  orderRevisionChain,
  groupIntoChains,
  type ExpenseDecision,
  type ExpenseMoneyV1,
  type ExpensePlanningBindingV1,
  type ExpenseReviewRowV1,
  type ExpenseSubmissionState,
  type ExpenseSubmissionV1,
} from '../../../../supabase/functions/_shared/time-v2/expenseReviewV1';

export * from '../../../../supabase/functions/_shared/time-v2/expenseReviewV1';

export type ExpenseScope = 'open' | 'all';

export const EXPENSE_STATE_LABELS: Record<ExpenseSubmissionState, string> = {
  submitted: 'Väntar på beslut',
  approved: 'Godkänt',
  rejected: 'Avslaget',
  correction_requested: 'Rättelse begärd',
  superseded: 'Ersatt av ny version',
};

export const EXPENSE_DECISION_LABELS: Record<ExpenseDecision, string> = {
  approved: 'Godkänn',
  rejected: 'Avslå',
  correction_requested: 'Begär rättelse',
};

export const EXPENSE_BINDING_REASON_LABELS: Record<string, string> = {
  lineage_missing: 'Time-snapshoten saknar koppling till bokning/projekt',
  booking_not_in_tenant: 'Bokningsnumret finns inte i din organisation',
  project_not_in_tenant: 'Projektet finns inte i din organisation',
  binding_conflict: 'Bokning och projekt pekar åt olika håll',
};

/** Minor units → localized amount; fraction digits come from the currency itself. */
export function formatExpenseAmount(money: ExpenseMoneyV1, locale = 'sv-SE'): string {
  try {
    const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
    const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    return fmt.format(money.amountMinor / 10 ** digits);
  } catch {
    return `${money.amountMinor} (${money.currency}, mindre enheter)`;
  }
}

export const shortHash = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-4)}`;

export interface ExpenseListCounts {
  total: number;
  open: number;
  bound: number;
  unbound: number;
  unreadable: number;
  foreignTenantDropped: number;
}

export interface ExpenseListView {
  scope: ExpenseScope;
  rows: ExpenseReviewRowV1[];
  counts: ExpenseListCounts;
  generatedAt: string | null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function parseBinding(raw: unknown): ExpensePlanningBindingV1 | null {
  const r = (raw ?? null) as Record<string, unknown> | null;
  if (!r || (r.status !== 'bound' && r.status !== 'unbound')) return null;
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    status: r.status,
    bookingId: s(r.bookingId),
    bookingNumber: s(r.bookingNumber),
    bookingTitle: s(r.bookingTitle),
    projectId: s(r.projectId),
    projectName: s(r.projectName),
    reason: s(r.reason),
  };
}

/** Re-parses the proxy payload fail-closed (never trusts a row it cannot type). */
export function mapExpenseList(data: unknown, generatedAt: string | null): ExpenseListView {
  const d = (data ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(d.rows) ? d.rows : [];
  const rows: ExpenseReviewRowV1[] = [];
  let dropped = 0;
  for (const item of rawRows) {
    const r = (item ?? {}) as Record<string, unknown>;
    const submission = parseExpenseSubmissionV1(r.submission);
    const binding = parseBinding(r.binding);
    if (!submission || !binding) { dropped += 1; continue; }
    rows.push({ submission, binding });
  }
  const c = (d.counts ?? {}) as Record<string, unknown>;
  return {
    scope: d.scope === 'all' ? 'all' : 'open',
    rows,
    counts: {
      total: rows.length,
      open: rows.filter((r) => EXPENSE_OPEN_STATES.includes(r.submission.state)).length,
      bound: rows.filter((r) => r.binding.status === 'bound').length,
      unbound: rows.filter((r) => r.binding.status === 'unbound').length,
      unreadable: num(c.unreadable) + dropped,
      foreignTenantDropped: num(c.foreignTenantDropped),
    },
    generatedAt,
  };
}

/** One expense as the planner thinks of it: a chain of immutable revisions. */
export interface ExpenseChainView {
  rootId: string;
  latest: ExpenseSubmissionV1;
  binding: ExpensePlanningBindingV1;
  revisions: ExpenseSubmissionV1[];
  /** True when the latest revision may still be decided and is bound. */
  decidable: boolean;
}

export function buildExpenseChains(rows: readonly ExpenseReviewRowV1[]): ExpenseChainView[] {
  const bindingById = new Map(rows.map((r) => [r.submission.submissionId, r.binding]));
  const chains = groupIntoChains(rows.map((r) => r.submission));
  const views: ExpenseChainView[] = [];
  for (const [rootId, revisions] of chains) {
    const ordered = orderRevisionChain(revisions);
    const latest = ordered[ordered.length - 1];
    const binding = bindingById.get(latest.submissionId) as ExpensePlanningBindingV1;
    views.push({
      rootId,
      latest,
      binding,
      revisions: ordered,
      decidable: binding.status === 'bound' && EXPENSE_OPEN_STATES.includes(latest.state),
    });
  }
  return views.sort((a, b) => (b.latest.submittedAt ?? '').localeCompare(a.latest.submittedAt ?? ''));
}

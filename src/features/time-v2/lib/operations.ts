/**
 * Planning "Tid & utlägg — drift": the operational join between Time's two
 * versioned read contracts.
 *
 *  - time review queue  (`TimeV2QueueRow`, contract v1)
 *  - expense review     (`planning-expense-review.v1`)
 *
 * This module is PURE. It never reads Time or Planning tables, never invents a
 * row, never re-derives minutes or money, and models no payroll / bookkeeping /
 * project-cost posting. It only groups what the two contracts already state by
 * worker + work date, and exposes the exact immutable identities (revision,
 * version, canonicalHash) that any decision must be bound to.
 */

import type { TimeV2QueueRow } from './contract';
import {
  EXPENSE_OPEN_STATES,
  type ExpenseChainView,
  type ExpenseMoneyV1,
} from './expenseContract';

export type OperationsView = 'needs_action' | 'all' | 'time' | 'expenses';

export const OPERATIONS_VIEW_LABELS: Record<OperationsView, string> = {
  needs_action: 'Kräver åtgärd',
  all: 'Alla dagar',
  time: 'Endast tid',
  expenses: 'Endast utlägg',
};

export interface OperationsTargetRef {
  bookingId: string | null;
  bookingNumber: string | null;
  bookingTitle: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface OperationsRow {
  /** Stable UI key: worker identity + work date. */
  key: string;
  workerKey: string;
  personnelId: string | null;
  workerName: string;
  date: string;
  /** Exact time submission for the day, when Time has one. */
  time: TimeV2QueueRow | null;
  /** Immutable expense chains reported for the same worker + date. */
  expenses: ExpenseChainView[];
  /** Booking/project references stated by either contract (never guessed). */
  targets: OperationsTargetRef[];
  totals: {
    totalMinutes: number;
    travelMinutes: number;
    breakMinutes: number;
    /** Sum of the LATEST revision per chain, kept per currency. */
    expenseByCurrency: Array<{ currency: string; amountMinor: number }>;
    expenseCount: number;
  };
  flags: {
    timeNeedsReview: boolean;
    timeCorrection: boolean;
    timeMissing: boolean;
    openExpenses: number;
    unboundExpenses: number;
    isTestFixture: boolean;
  };
  /** True when a planner has something to decide on this row right now. */
  needsAction: boolean;
}

export interface OperationsCounts {
  rows: number;
  needsAction: number;
  timeNeedsReview: number;
  openExpenses: number;
  unboundExpenses: number;
  workers: number;
}

export interface OperationsFilters {
  from?: string;
  to?: string;
  query?: string;
  view?: OperationsView;
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

/** Worker identity: personnel id when both sides state one, else the name. */
export function workerKeyOf(personnelId: string | null, displayName: string | null): string {
  return personnelId ? `id:${norm(personnelId)}` : `name:${norm(displayName) || 'okänd'}`;
}

function sumMoney(list: ExpenseMoneyV1[]): Array<{ currency: string; amountMinor: number }> {
  const by = new Map<string, number>();
  for (const m of list) by.set(m.currency, (by.get(m.currency) ?? 0) + m.amountMinor);
  return Array.from(by, ([currency, amountMinor]) => ({ currency, amountMinor })).sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

function pushTarget(list: OperationsTargetRef[], t: OperationsTargetRef) {
  if (!t.bookingId && !t.bookingNumber && !t.projectId && !t.projectName) return;
  const same = list.some(
    (x) =>
      x.bookingId === t.bookingId &&
      x.bookingNumber === t.bookingNumber &&
      x.projectId === t.projectId &&
      x.projectName === t.projectName,
  );
  if (!same) list.push(t);
}

export interface BuildOperationsInput {
  queueRows: readonly TimeV2QueueRow[];
  expenseChains: readonly ExpenseChainView[];
}

/**
 * One row per worker + work date, carrying the exact time submission and every
 * expense chain the two contracts report for that same worker and date.
 */
export function buildOperationsRows({ queueRows, expenseChains }: BuildOperationsInput): OperationsRow[] {
  const rows = new Map<string, OperationsRow>();

  const ensure = (
    personnelId: string | null,
    workerName: string,
    date: string,
  ): OperationsRow => {
    const workerKey = workerKeyOf(personnelId, workerName);
    const key = `${workerKey}|${date}`;
    const existing = rows.get(key);
    if (existing) {
      if (!existing.personnelId && personnelId) existing.personnelId = personnelId;
      return existing;
    }
    const created: OperationsRow = {
      key,
      workerKey,
      personnelId,
      workerName,
      date,
      time: null,
      expenses: [],
      targets: [],
      totals: { totalMinutes: 0, travelMinutes: 0, breakMinutes: 0, expenseByCurrency: [], expenseCount: 0 },
      flags: {
        timeNeedsReview: false,
        timeCorrection: false,
        timeMissing: false,
        openExpenses: 0,
        unboundExpenses: 0,
        isTestFixture: false,
      },
      needsAction: false,
    };
    rows.set(key, created);
    return created;
  };

  for (const q of queueRows) {
    const row = ensure(q.personnelId, q.personnelName, q.date);
    row.time = q;
    row.totals.totalMinutes = q.totalMinutes;
    row.totals.travelMinutes = q.travelMinutes;
    row.totals.breakMinutes = q.breakMinutes;
    row.flags.timeNeedsReview = q.group === 'needs_review';
    row.flags.timeCorrection = q.group === 'correction';
    row.flags.timeMissing = q.group === 'missing';
    row.flags.isTestFixture = row.flags.isTestFixture || q.isTestFixture;
    pushTarget(row.targets, {
      bookingId: null,
      bookingNumber: null,
      bookingTitle: null,
      projectId: q.projectId,
      projectName: q.projectName,
    });
  }

  for (const chain of expenseChains) {
    const s = chain.latest;
    const row = ensure(s.worker?.personnelId ?? null, s.worker?.displayName ?? 'Okänd medarbetare', s.expenseDate);
    row.expenses.push(chain);
    row.flags.isTestFixture = row.flags.isTestFixture || s.isTestFixture;
    if (EXPENSE_OPEN_STATES.includes(s.state)) row.flags.openExpenses += 1;
    if (chain.binding.status === 'unbound') row.flags.unboundExpenses += 1;
    pushTarget(row.targets, {
      bookingId: chain.binding.bookingId,
      bookingNumber: chain.binding.bookingNumber,
      bookingTitle: chain.binding.bookingTitle,
      projectId: chain.binding.projectId,
      projectName: chain.binding.projectName,
    });
  }

  for (const row of rows.values()) {
    row.expenses.sort((a, b) => (b.latest.submittedAt ?? '').localeCompare(a.latest.submittedAt ?? ''));
    row.totals.expenseCount = row.expenses.length;
    row.totals.expenseByCurrency = sumMoney(row.expenses.map((c) => c.latest.money));
    row.needsAction = row.flags.timeNeedsReview || row.flags.openExpenses > 0;
  }

  return Array.from(rows.values()).sort(
    (a, b) => b.date.localeCompare(a.date) || a.workerName.localeCompare(b.workerName),
  );
}

/** Pure filtering over contract fields only. */
export function filterOperationsRows(rows: readonly OperationsRow[], f: OperationsFilters): OperationsRow[] {
  const q = norm(f.query);
  const view = f.view ?? 'needs_action';
  return rows.filter((row) => {
    if (f.from && row.date < f.from) return false;
    if (f.to && row.date > f.to) return false;
    if (view === 'needs_action' && !row.needsAction) return false;
    if (view === 'time' && !row.time) return false;
    if (view === 'expenses' && row.expenses.length === 0) return false;
    if (q) {
      const hay = [
        row.workerName,
        row.date,
        row.time?.state ?? '',
        ...row.targets.flatMap((t) => [t.bookingNumber, t.bookingTitle, t.projectName]),
        ...row.expenses.map((c) => `${c.latest.categoryRef ?? ''} ${c.latest.supplier ?? ''}`),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function operationsCounts(rows: readonly OperationsRow[]): OperationsCounts {
  return {
    rows: rows.length,
    needsAction: rows.filter((r) => r.needsAction).length,
    timeNeedsReview: rows.filter((r) => r.flags.timeNeedsReview).length,
    openExpenses: rows.reduce((n, r) => n + r.flags.openExpenses, 0),
    unboundExpenses: rows.reduce((n, r) => n + r.flags.unboundExpenses, 0),
    workers: new Set(rows.map((r) => r.workerKey)).size,
  };
}

/** Short human label of the row's booking/project binding. */
export function describeTargets(row: OperationsRow): string {
  if (row.targets.length === 0) return 'Ingen bokning/projekt angiven i kontraktet';
  return row.targets
    .map((t) =>
      [t.bookingNumber ? `Bokning ${t.bookingNumber}` : null, t.bookingTitle, t.projectName]
        .filter(Boolean)
        .join(' · '),
    )
    .filter(Boolean)
    .join(' | ');
}

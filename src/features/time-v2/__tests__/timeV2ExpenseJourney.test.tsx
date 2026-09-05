/**
 * End-to-end PREVIEW journey through the real UI, the real boundary transport
 * and the REAL proxy handler code, against a synthetic Time staging fixture:
 *
 *   Time worker expense v1 + receipt → visible in Planning → request correction
 *   → worker submits v2 (new immutable revision) → visible as new version
 *   → approve EXACT v2 hash → TEST/PREVIEW decision receipt.
 *
 * Plus: stale hash surfaces truthfully, the external gate renders as a gate,
 * and the receipt opens only through a short-lived signed https read.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearLocalOverrides, writeLocalOverride } from '@/features/time-v2/lib/moduleFlag';
import { handleExpenseOperation, type ExpenseHandlerContext } from '../../../../supabase/functions/time-planning-proxy/expenseHandlers';
import { EXPENSE_PREVIEW_ALLOWED_TIME_HOSTS } from '../../../../supabase/functions/time-planning-proxy/expenseAdapter';
import { HASH_A, HASH_B, ORG as TIME_ORG, V1, V2, realShapedSubmission } from './fixtures/expenseFixture';

const PLANNING_ORG = 'f5e5cade-0000-4000-8000-000000000001';
const BOOKING_ID = 'bc9a73e7-0000-4000-8000-000000000001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: PLANNING_ORG, isLoading: false, error: null }),
}));

/* ----------------------- synthetic Time staging fixture ---------------------- */

type Sub = ReturnType<typeof realShapedSubmission>;

const timeStaging = {
  gateOpen: true,
  submissions: [] as Sub[],
  decisions: [] as Array<Record<string, unknown>>,
  receiptReads: 0,
  reset() {
    this.gateOpen = true;
    this.submissions = [realShapedSubmission()];
    this.decisions = [];
    this.receiptReads = 0;
  },
  manifest() {
    const base = ['manifest', 'status', 'days.queue'];
    return this.gateOpen ? [...base, 'expenses.list', 'expenses.decide', 'expenses.receiptUrl'] : base;
  },
  chainOf(id: string) {
    const byId = new Map<string, Sub>(this.submissions.map((s) => [String(s.submissionId), s]));
    let root: Sub | undefined = byId.get(id);
    while (root && root.previousSubmissionId && byId.has(String(root.previousSubmissionId))) {
      root = byId.get(String(root.previousSubmissionId));
    }
    const out: Sub[] = [];
    let cur: Sub | undefined = root;
    while (cur) {
      out.push(cur);
      const currentId = cur.submissionId;
      cur = this.submissions.find((s) => s.previousSubmissionId === currentId);
    }
    return out;
  },
  handle(op: string, p: Record<string, unknown>): { status: number; body: unknown } {
    const env = (data: unknown) => ({ status: 200, body: { adapterVersion: 'time-planning-adapter.v2', operation: op, generatedAt: '2026-06-05T08:00:00Z', data } });
    if (op === 'manifest') return env({ operations: this.manifest() });
    if (!this.gateOpen || !this.manifest().includes(op)) {
      return { status: 400, body: { code: 'invalid_request', error: `operation: Invalid enum value '${op}'` } };
    }
    if (op === 'expenses.list') {
      const rows = p.submissionId ? this.chainOf(String(p.submissionId)) : this.submissions;
      const scoped = p.scope === 'open' ? rows.filter((s) => s.state === 'submitted') : rows;
      return env({ submissions: scoped.map((s) => ({ ...s, decision: this.decisions.find((d) => d.submissionId === s.submissionId) ?? null })) });
    }
    if (op === 'expenses.decide') {
      const s = this.submissions.find((x) => x.submissionId === p.submissionId);
      if (!s || s.version !== p.submissionVersion || s.canonicalHash !== p.expectedSnapshotHash) {
        return { status: 409, body: { code: 'stale_version', error: 'stale' } };
      }
      const decision = { decisionId: `d-${this.decisions.length + 1}`, submissionId: s.submissionId, decision: p.decision, submissionVersion: s.version, snapshotHash: s.canonicalHash, reason: p.reason ?? null, decidedAt: '2026-06-05T08:01:00Z', decidedBy: 'planner@test', idempotencyKey: p.idempotencyKey };
      this.decisions.push(decision);
      s.state = String(p.decision);
      return env({ decision });
    }
    if (op === 'expenses.receiptUrl') {
      this.receiptReads += 1;
      return env({ url: `https://${EXPENSE_PREVIEW_ALLOWED_TIME_HOSTS[0]}/storage/v1/object/sign/receipts/${p.attachmentId}?token=short-lived`, expiresAt: '2026-06-05T08:02:00Z', ttlSeconds: 120 });
    }
    return { status: 400, body: { code: 'invalid_request', error: 'unknown' } };
  },
  /** Time worker corrects: a NEW immutable revision; v1 is never rewritten. */
  workerSubmitsV2() {
    const v1 = this.submissions[0];
    this.submissions.push(realShapedSubmission({
      submissionId: V2, version: 2, previousSubmissionId: V1, canonicalHash: HASH_B,
      money: { amountMinor: 24900, currency: 'SEK' }, workerStatement: 'Buntband till riggen (kvitto med datum)',
      submittedAt: '2026-06-05T09:00:00Z', state: 'submitted',
      attachments: [{ ...(v1.attachments as Array<Record<string, unknown>>)[0], attachmentId: 'att-2', carriedFromSubmissionId: V1 }],
    }));
  },
};

const fakeFetch = (async (_url: string, init: RequestInit) => {
  const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
  const { operation, schema: _s, organizationId: _o, ...params } = payload;
  const r = timeStaging.handle(String(operation), params);
  return new Response(JSON.stringify(r.body), { status: r.status });
}) as unknown as typeof fetch;

const admin = {
  from: (name: string) => {
    const rows = name === 'bookings'
      ? [{ id: BOOKING_ID, booking_number: '2604-29', title: 'Westmans Uthyrning', assigned_project_id: BOOKING_ID, organization_id: PLANNING_ORG }]
      : [{ id: BOOKING_ID, name: 'Westmans Uthyrning - 6 juni 2026', booking_id: BOOKING_ID, organization_id: PLANNING_ORG }];
    let org = '';
    const b = {
      select: () => b, eq: (_c: string, v: string) => { org = v; return b; }, in: () => b, or: () => b,
      then: (res: (v: unknown) => void) => res({ data: rows.filter((r) => r.organization_id === org), error: null }),
    };
    return b;
  },
};

const proxyCtx: ExpenseHandlerContext = {
  admin, organizationId: PLANNING_ORG, timeOrganizationId: TIME_ORG,
  adapterUrl: `https://${EXPENSE_PREVIEW_ALLOWED_TIME_HOSTS[0]}/functions/v1`,
  signingSeed: 'journey-seed-not-a-real-secret-0123456789', fetchImpl: fakeFetch,
};

/** Same-origin proxy exactly as supabase-js surfaces it (Response in error.context). */
const invoke = vi.fn(async (body: Record<string, unknown>) => {
  const r = await handleExpenseOperation(proxyCtx, String(body.operation), body);
  if (r.status >= 400) {
    return { data: null, error: { context: new Response(JSON.stringify(r.body), { status: r.status }), message: `Edge Function returned ${r.status}` } };
  }
  return { data: r.body, error: null };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (_name: string, opts: { body: Record<string, unknown> }) => invoke(opts.body) } },
}));

import TimeV2ExpensesPage from '@/features/time-v2/pages/TimeV2ExpensesPage';
import TimeV2ExpenseDetailPage from '@/features/time-v2/pages/TimeV2ExpenseDetailPage';

const renderAt = (path: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/time-v2/expenses" element={<TimeV2ExpensesPage />} />
          <Route path="/time-v2/expenses/:submissionId" element={<TimeV2ExpenseDetailPage />} />
          <Route path="/staff-management/time" element={<div>legacy</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Time V2 expenses — hosted PREVIEW journey (real UI + real proxy code + synthetic Time staging)', () => {
  beforeEach(() => {
    clearLocalOverrides();
    writeLocalOverride(PLANNING_ORG, true);
    timeStaging.reset();
    invoke.mockClear();
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('v1 visible → request correction → worker v2 visible as new revision → approve exact v2 hash', async () => {
    // 1. Pending Time expense visible in Planning, bound to the exact booking/project.
    const list = renderAt('/time-v2/expenses');
    const row = await screen.findByTestId('time-v2-expense-row');
    expect(row).toHaveAttribute('data-submission-id', V1);
    expect(row).toHaveAttribute('data-version', '1');
    expect(within(row).getByTestId('time-v2-expense-amount').textContent).toMatch(/249/);
    expect(row.textContent).toContain('Bokning 2604-29');
    expect(row.textContent).toContain('Westmans Uthyrning - 6 juni 2026');
    expect(row.textContent).toContain('TEST');
    expect(row.textContent).toContain('Raivis');
    expect(screen.getByTestId('time-v2-expenses-count-open').textContent).toContain('1');
    list.unmount();

    // 2. Request a correction with a visible reason against exact v1/hash A.
    const d1 = renderAt(`/time-v2/expenses/${V1}`);
    await screen.findByTestId('time-v2-expense-decision-panel');
    expect(screen.getByTestId('time-v2-expense-hash').textContent).toBe(HASH_A);
    expect(screen.getByTestId('time-v2-expense-request-correction')).toBeDisabled();
    fireEvent.change(screen.getByTestId('time-v2-expense-reason'), { target: { value: 'Kvittot saknar datum' } });
    fireEvent.click(screen.getByTestId('time-v2-expense-request-correction'));
    const decided = await screen.findByTestId('time-v2-expense-decided');
    expect(decided.textContent).toContain('correction_requested');
    expect(decided.textContent).toContain('v1');
    expect(timeStaging.decisions[0]).toMatchObject({ decision: 'correction_requested', submissionVersion: 1, snapshotHash: HASH_A, reason: 'Kvittot saknar datum' });
    expect(String(timeStaging.decisions[0].idempotencyKey)).toBe(`planning:expenses.decide:${V1}:v1:${HASH_A.slice(0, 16)}:correction_requested`);
    // v1 is now closed for further decisions.
    await screen.findByTestId('time-v2-expense-closed');
    d1.unmount();

    // 3. Time worker submits v2 — a NEW immutable revision. v1 keeps its hash/state.
    timeStaging.workerSubmitsV2();
    expect(timeStaging.submissions[0]).toMatchObject({ submissionId: V1, version: 1, canonicalHash: HASH_A, state: 'correction_requested' });

    const d1b = renderAt(`/time-v2/expenses/${V1}`);
    await screen.findByTestId('time-v2-expense-not-latest');
    const chain = screen.getByTestId('time-v2-expense-chain');
    expect(within(chain).getAllByTestId('time-v2-expense-revision')).toHaveLength(2);
    expect(within(chain).getAllByTestId('time-v2-expense-revision')[1]).toHaveAttribute('data-version', '2');
    expect(chain.textContent).toContain(`ersätter ${V1}`);
    d1b.unmount();

    // 4. Approve EXACT v2 (hash B). Receipt is a carried attachment on v2.
    const d2 = renderAt(`/time-v2/expenses/${V2}`);
    await screen.findByTestId('time-v2-expense-decision-panel');
    expect(screen.getByTestId('time-v2-expense-hash').textContent).toBe(HASH_B);
    expect(screen.getByTestId('time-v2-expense-head').textContent).toContain('TEST/PREVIEW');
    expect(screen.queryByTestId('time-v2-expense-not-latest')).toBeNull();
    fireEvent.click(screen.getByTestId('time-v2-open-receipt'));
    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(1));
    const [url, target, features] = (window.open as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/pklkhhfvgmexsrkkpkzt\.supabase\.co\/storage\/v1\/object\/sign\//);
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    await screen.findByTestId('time-v2-receipt-ttl');

    fireEvent.click(screen.getByTestId('time-v2-expense-approve'));
    const approved = await screen.findByTestId('time-v2-expense-decided');
    expect(approved.textContent).toContain('approved');
    expect(approved.textContent).toContain('v2');
    expect(approved.textContent).toContain(HASH_B.slice(0, 8));
    expect(timeStaging.decisions[1]).toMatchObject({ decision: 'approved', submissionVersion: 2, snapshotHash: HASH_B });
    expect(timeStaging.decisions[1].snapshotHash).not.toBe(HASH_A);
    // Previous version untouched by the v2 decision.
    expect(timeStaging.submissions[0]).toMatchObject({ version: 1, canonicalHash: HASH_A, state: 'correction_requested' });
    d2.unmount();

    // Nothing in this journey posted payroll/bookkeeping/project cost.
    const ops = invoke.mock.calls.map((c) => String((c[0] as Record<string, unknown>).operation));
    expect(new Set(ops)).toEqual(new Set(['expenses.list', 'expenses.decide', 'expenses.receiptUrl']));
  });

  it('a decision against a snapshot Time no longer has surfaces as stale — never silently retried', async () => {
    renderAt(`/time-v2/expenses/${V1}`);
    await screen.findByTestId('time-v2-expense-decision-panel');
    // Snapshot changed in Time after the planner opened it (hash differs, same version).
    timeStaging.submissions[0].canonicalHash = HASH_B;
    fireEvent.click(screen.getByTestId('time-v2-expense-approve'));
    const stale = await screen.findByTestId('time-v2-expense-stale');
    expect(stale.textContent).toMatch(/hash/i);
    expect(timeStaging.decisions).toHaveLength(0);
    // Re-read shows the new hash — the planner decides against what they now see.
    fireEvent.click(within(stale).getByRole('button', { name: /Läs om snapshoten/ }));
    await waitFor(() => expect(screen.getByTestId('time-v2-expense-hash').textContent).toBe(HASH_B));
  });

  it('renders the EXTERNAL GATE (Time adapter without expense operations) as a gate, not an empty list', async () => {
    timeStaging.gateOpen = false;
    renderAt('/time-v2/expenses');
    const gate = await screen.findByTestId('time-v2-expenses-gate');
    expect(gate.textContent).toContain('expenses.list');
    expect(gate.textContent).toContain('time-planning-adapter');
    expect(screen.queryByTestId('time-v2-expenses-empty')).toBeNull();
    expect(screen.queryByTestId('time-v2-expense-row')).toBeNull();
  });

  it('an unbound snapshot is visible but blocked from decisions and receipts', async () => {
    timeStaging.submissions = [realShapedSubmission({ lineage: { bookingRef: 'WS-9999', projectRef: null } })];
    renderAt(`/time-v2/expenses/${V1}`);
    await screen.findByTestId('time-v2-expense-unbound-block');
    expect(screen.getByTestId('time-v2-expense-approve')).toBeDisabled();
    expect(screen.getByTestId('time-v2-open-receipt')).toBeDisabled();
    expect(screen.getByTestId('time-v2-expense-binding').textContent).toContain('Bokningsnumret finns inte i din organisation');
  });

  it('redirects to legacy Time when the module flag is off', async () => {
    clearLocalOverrides();
    renderAt('/time-v2/expenses');
    await screen.findByText('legacy');
  });
});

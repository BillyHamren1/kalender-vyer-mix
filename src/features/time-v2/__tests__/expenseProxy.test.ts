/**
 * Runs the REAL proxy handler code (`expenseHandlers.ts`) against a
 * contract-faithful fake Time adapter and a fake Planning admin client.
 * Locks: staging gate, tenant drop, assignment binding, read-before-write on
 * version + hash, upstream gate detection via manifest, receipt scoping and
 * that no storage path or posting field ever reaches the browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleExpenseOperation, type ExpenseHandlerContext } from '../../../../supabase/functions/time-planning-proxy/expenseHandlers';
import { EXPENSE_PREVIEW_ALLOWED_TIME_HOSTS, isExpensePreviewHost } from '../../../../supabase/functions/time-planning-proxy/expenseAdapter';
import { bindSubmission } from '../../../../supabase/functions/time-planning-proxy/expenseBinding';
import { assertNoPostingFields, parseExpenseSubmissionV1 } from '../../../../supabase/functions/_shared/time-v2/expenseReviewV1';
import { realShapedSubmission } from './expenseReviewV1.contract.test';

const STAGING = `https://${EXPENSE_PREVIEW_ALLOWED_TIME_HOSTS[0]}/functions/v1`;
const PLANNING_ORG = 'f5e5cade-0000-4000-8000-000000000001';
const TIME_ORG = 'c2a94d3e-6b71-4f28-8e5a-9d0c3b7f1a22';
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const BOOKING_ID = 'bc9a73e7-0000-4000-8000-000000000001';
const PROJECT_ID = 'bc9a73e7-0000-4000-8000-000000000001';

/** Minimal supabase-js query builder fake: org-scoped in-memory tables. */
const makeAdmin = (rows: { bookings: Record<string, unknown>[]; projects: Record<string, unknown>[] }) => {
  const filter = (table: Record<string, unknown>[], org: string, ids: string[] | null, numbers: string[] | null) =>
    table.filter((r) => r.organization_id === org && (
      (ids && ids.includes(String(r.id))) || (numbers && numbers.includes(String(r.booking_number)))
    ));
  return {
    from: (name: 'bookings' | 'projects') => {
      let org = '';
      let ids: string[] | null = null;
      let numbers: string[] | null = null;
      const b = {
        select: () => b,
        eq: (_c: string, v: string) => { org = v; return b; },
        in: (_c: string, v: string[]) => { ids = v; return b; },
        or: (expr: string) => {
          const m1 = expr.match(/booking_number\.in\.\(([^)]*)\)/);
          if (m1) numbers = m1[1].split(',').map((s) => s.replace(/"/g, ''));
          const m2 = expr.match(/(?:^|,)id\.in\.\(([^)]*)\)/);
          if (m2) ids = m2[1].split(',');
          return b;
        },
        then: (res: (v: unknown) => void) => res({ data: filter(rows[name], org, ids, numbers), error: null }),
      };
      return b;
    },
  };
};

type Upstream = (op: string, params: Record<string, unknown>) => { status: number; body: unknown };

const fakeFetch = (upstream: Upstream) =>
  vi.fn(async (_url: string, init: RequestInit) => {
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(init.headers).toHaveProperty('x-planning-service-proof');
    expect(payload.schema).toBe('time-planning-boundary.v1');
    expect(payload.organizationId).toBe(TIME_ORG);
    const { operation, schema: _s, organizationId: _o, ...params } = payload;
    const r = upstream(String(operation), params);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;

const envelope = (operation: string, data: unknown) => ({
  status: 200,
  body: { adapterVersion: 'time-planning-adapter.v2', operation, generatedAt: '2026-06-05T08:00:00Z', data },
});

const ctxFor = (fetchImpl: typeof fetch, over: Partial<ExpenseHandlerContext> = {}): ExpenseHandlerContext => ({
  admin: makeAdmin({
    bookings: [{ id: BOOKING_ID, booking_number: '2604-29', title: 'Westmans Uthyrning', assigned_project_id: PROJECT_ID, organization_id: PLANNING_ORG }],
    projects: [{ id: PROJECT_ID, name: 'Westmans Uthyrning - 6 juni 2026', booking_id: BOOKING_ID, organization_id: PLANNING_ORG }],
  }),
  organizationId: PLANNING_ORG,
  timeOrganizationId: TIME_ORG,
  adapterUrl: STAGING,
  signingSeed: 'test-seed-not-a-real-secret-0123456789',
  fetchImpl,
  ...over,
});

describe('expense proxy handlers (real handler code, fake Time + fake admin)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('locks the preview to Time staging only', () => {
    expect(isExpensePreviewHost(STAGING)).toBe(true);
    expect(isExpensePreviewHost('https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1')).toBe(false);
    expect(isExpensePreviewHost('not a url')).toBe(false);
  });

  it('fails closed (503 preview_gate_closed) for any non-staging adapter host', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 200, body: {} }));
    const r = await handleExpenseOperation(ctxFor(fetchImpl, { adapterUrl: 'https://example.supabase.co/functions/v1' }), 'expenses.list', {});
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('preview_gate_closed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports the EXTERNAL GATE precisely when Time\'s manifest lacks the operation', async () => {
    const fetchImpl = fakeFetch((op) => {
      if (op === 'manifest') return envelope('manifest', { operations: ['status', 'days.queue', 'attest.payroll'] });
      return { status: 400, body: { code: 'invalid_request', error: 'operation: Invalid enum value' } };
    });
    const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.list', {});
    expect(r.status).toBe(501);
    expect(r.body.code).toBe('upstream_operation_missing');
    expect(String(r.body.error)).toContain('expenses.list');
    expect(String(r.body.error)).toContain('time-planning-adapter');
  });

  it('passes a genuine 400 through when the manifest DOES list the operation', async () => {
    const fetchImpl = fakeFetch((op) => {
      if (op === 'manifest') return envelope('manifest', { operations: ['expenses.list'] });
      return { status: 400, body: { code: 'invalid_request', error: 'scope: bad' } };
    });
    const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.list', {});
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_request');
  });

  it('lists exact snapshots bound to exact Planning records; drops foreign tenants; strips objectPath', async () => {
    const fetchImpl = fakeFetch((op) => envelope(op, {
      submissions: [
        realShapedSubmission(),
        realShapedSubmission({ submissionId: V2, organizationId: '99999999-9999-4999-8999-999999999999' }),
        { schema: 'expense-submission.v1', garbage: true },
      ],
    }));
    const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.list', { scope: 'open' });
    expect(r.status).toBe(200);
    const data = r.body.data as { rows: Array<{ submission: Record<string, unknown>; binding: Record<string, unknown> }>; counts: Record<string, number> };
    expect(data.rows).toHaveLength(1);
    expect(data.counts).toMatchObject({ total: 1, open: 1, bound: 1, unbound: 0, unreadable: 1, foreignTenantDropped: 1 });
    expect(data.rows[0].binding).toMatchObject({ status: 'bound', bookingId: BOOKING_ID, bookingNumber: '2604-29', projectId: PROJECT_ID, projectName: 'Westmans Uthyrning - 6 juni 2026' });
    expect(JSON.stringify(r.body)).not.toContain('objectPath');
    expect(() => assertNoPostingFields(r.body)).not.toThrow();
  });

  it('binding: cross-tenant booking numbers and conflicting refs are unbound', () => {
    const s = parseExpenseSubmissionV1(realShapedSubmission())!;
    const empty = { bookingsByNumber: new Map(), bookingsById: new Map(), projectsById: new Map() };
    expect(bindSubmission(s, empty)).toMatchObject({ status: 'unbound', reason: 'booking_not_in_tenant' });
    const other = { id: 'other', booking_number: '2604-29', title: 'x', assigned_project_id: null };
    const conflicting = {
      bookingsByNumber: new Map([['2604-29', other]]),
      bookingsById: new Map([['other', other]]),
      projectsById: new Map([[PROJECT_ID, { id: PROJECT_ID, name: 'P', booking_id: 'someone-else' }]]),
    };
    expect(bindSubmission(s, conflicting)).toMatchObject({ status: 'unbound', reason: 'binding_conflict' });
    const noLineage = parseExpenseSubmissionV1(realShapedSubmission({ lineage: {} }))!;
    expect(bindSubmission(noLineage, empty)).toMatchObject({ status: 'unbound', reason: 'lineage_missing' });
  });

  describe('decide — read-before-write on exact version + hash', () => {
    const decideBody = (over: Record<string, unknown> = {}) => ({
      submissionId: V1, submissionVersion: 1, expectedSnapshotHash: HASH_A, decision: 'approved', ...over,
    });

    it('refuses an unbound snapshot (403) before calling Time', async () => {
      const calls: string[] = [];
      const fetchImpl = fakeFetch((op) => {
        calls.push(op);
        return envelope(op, { submissions: [realShapedSubmission({ lineage: { bookingRef: 'NOPE-1' } })] });
      });
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.decide', decideBody());
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('assignment_unbound');
      expect(calls).toEqual(['expenses.list']);
    });

    it('409 stale_revision when the planner saw an older version', async () => {
      const fetchImpl = fakeFetch((op) => envelope(op, { submissions: [realShapedSubmission({ version: 2 })] }));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.decide', decideBody());
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('stale_revision');
    });

    it('409 stale_hash when the version matches but the snapshot hash differs', async () => {
      const fetchImpl = fakeFetch((op) => envelope(op, { submissions: [realShapedSubmission({ canonicalHash: HASH_B })] }));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.decide', decideBody());
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('stale_hash');
    });

    it('409 already_decided for a closed snapshot', async () => {
      const fetchImpl = fakeFetch((op) => envelope(op, { submissions: [realShapedSubmission({ state: 'approved' })] }));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.decide', decideBody());
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('already_decided');
    });

    it('400 reason_required for rejection without a visible reason — no upstream call', async () => {
      const fetchImpl = fakeFetch((op) => envelope(op, {}));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.decide', decideBody({ decision: 'rejected' }));
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('reason_required');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('forwards the exact triple + deterministic idempotency key and verifies Time\'s receipt', async () => {
      const seen: Record<string, unknown>[] = [];
      const fetchImpl = fakeFetch((op, params) => {
        if (op === 'expenses.list') return envelope(op, { submissions: [realShapedSubmission()] });
        seen.push(params);
        return envelope(op, { decision: { decisionId: 'd-1', decision: params.decision, submissionVersion: params.submissionVersion, snapshotHash: params.expectedSnapshotHash, reason: params.reason ?? null, decidedAt: '2026-06-05T08:01:00Z', decidedBy: 'planner' } });
      });
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.decide', decideBody({ decision: 'correction_requested', reason: 'Kvittot saknar datum' }));
      expect(r.status).toBe(200);
      expect(seen[0]).toMatchObject({ submissionId: V1, submissionVersion: 1, expectedSnapshotHash: HASH_A, decision: 'correction_requested', reason: 'Kvittot saknar datum' });
      expect(String(seen[0].idempotencyKey)).toBe(`planning:expenses.decide:${V1}:v1:${HASH_A.slice(0, 16)}:correction_requested`);
      const data = r.body.data as { decision: Record<string, unknown> };
      expect(data.decision).toMatchObject({ decision: 'correction_requested', submissionVersion: 1, snapshotHash: HASH_A });
    });

    it('502 decision_hash_mismatch when Time acknowledges a different snapshot', async () => {
      const fetchImpl = fakeFetch((op) => op === 'expenses.list'
        ? envelope(op, { submissions: [realShapedSubmission()] })
        : envelope(op, { decision: { decisionId: 'd-2', decision: 'approved', submissionVersion: 1, snapshotHash: HASH_B } }));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.decide', decideBody());
      expect(r.status).toBe(502);
      expect(r.body.code).toBe('decision_hash_mismatch');
    });
  });

  describe('receiptUrl — short-lived signed read scoped to the snapshot', () => {
    it('403 when the attachment is not part of the snapshot', async () => {
      const fetchImpl = fakeFetch((op) => envelope(op, { submissions: [realShapedSubmission()] }));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.receiptUrl', { submissionId: V1, attachmentId: 'att-999' });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('attachment_not_in_submission');
    });

    it('returns only an https url + expiry, never a storage path', async () => {
      const fetchImpl = fakeFetch((op) => op === 'expenses.list'
        ? envelope(op, { submissions: [realShapedSubmission()] })
        : envelope(op, { url: 'https://pklkhhfvgmexsrkkpkzt.supabase.co/storage/v1/object/sign/x?token=abc', expiresAt: '2026-06-05T08:02:00Z', ttlSeconds: 120, objectPath: 'org/x/receipt.jpg' }));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.receiptUrl', { submissionId: V1, attachmentId: 'att-1' });
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>;
      expect(String(data.url)).toMatch(/^https:\/\//);
      expect(data.ttlSeconds).toBe(120);
      expect(data).not.toHaveProperty('objectPath');
    });

    it('rejects a non-https read from Time', async () => {
      const fetchImpl = fakeFetch((op) => op === 'expenses.list'
        ? envelope(op, { submissions: [realShapedSubmission()] })
        : envelope(op, { url: 'http://insecure/receipt.jpg' }));
      const r = await handleExpenseOperation(ctxFor(fetchImpl), 'expenses.receiptUrl', { submissionId: V1, attachmentId: 'att-1' });
      expect(r.status).toBe(502);
    });
  });
});

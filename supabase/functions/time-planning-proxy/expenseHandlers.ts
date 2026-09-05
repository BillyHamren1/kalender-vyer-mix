/**
 * `planning-expense-review.v1` handlers for the Planning→Time proxy.
 *
 * Fail-closed on every axis the package requires:
 *  - tenant:     snapshots from another Time tenant are dropped, never shown;
 *  - role:       caller already passed assertPlanningAccess (index.ts);
 *  - assignment: a snapshot whose lineage is not bound to a Planning booking /
 *                project in this tenant is visible as `unbound` but can never
 *                be decided and its receipt can never be opened;
 *  - version + hash: every decision is read-before-write against the exact
 *                snapshot and the upstream decision is verified to carry the
 *                same version and snapshotHash.
 *
 * No payroll, bookkeeping or project-cost posting exists here.
 */

import {
  EXPENSE_OPEN_STATES,
  EXPENSE_OPERATIONS,
  EXPENSE_RECEIPT_URL_TTL_SECONDS,
  EXPENSE_REVIEW_SCHEMA,
  parseExpenseDecisionRecordV1,
  parseExpenseSubmissionV1,
  validateExpenseDecideInput,
  type ExpenseReviewRowV1,
  type ExpenseSubmissionV1,
} from '../_shared/time-v2/expenseReviewV1.ts';
import { callTimeExpenseAdapter, isExpensePreviewHost, type ExpenseAdapterContext } from './expenseAdapter.ts';
import { bindSubmission, loadBindingSources } from './expenseBinding.ts';

export interface ExpenseHandlerContext extends ExpenseAdapterContext {
  // deno-lint-ignore no-explicit-any
  admin: any;
  /** Planning tenant of the authenticated caller (server-resolved). */
  organizationId: string;
}

export const EXPENSE_PROXY_OPERATIONS: ReadonlySet<string> = new Set(Object.values(EXPENSE_OPERATIONS));

/**
 * Handlers return plain results; index.ts wraps them into the CORS Response.
 * Keeping this module free of `npm:` imports lets the SAME code run under
 * vitest (Node) and Deno without a shim.
 */
export interface ExpenseProxyResult {
  status: number;
  body: Record<string, unknown>;
}

const json = (status: number, body: Record<string, unknown>): ExpenseProxyResult => ({ status, body });
const fail = (status: number, code: string, message: string, retryable = false): ExpenseProxyResult =>
  json(status, { schema: 'time-planning-boundary-error.v1', code, retryable, error: message });
const ok = (operation: string, data: unknown, generatedAt: string | null): ExpenseProxyResult =>
  json(200, {
    schema: 'time-planning-boundary-response.v1',
    adapterVersion: 'time-planning-adapter.v2',
    operation,
    generatedAt: generatedAt ?? new Date().toISOString(),
    data,
  });

interface ReadResult {
  rows: ExpenseReviewRowV1[];
  unreadable: number;
  foreignTenantDropped: number;
  generatedAt: string | null;
}

type ReadOutcome = { ok: true; value: ReadResult } | { ok: false; response: ExpenseProxyResult };

/** Reads snapshots from Time, parses fail-closed, drops foreign tenants, binds. */
async function readSnapshots(ctx: ExpenseHandlerContext, params: Record<string, unknown>): Promise<ReadOutcome> {
  const res = await callTimeExpenseAdapter(ctx, EXPENSE_OPERATIONS.list, params);
  if (!res.ok) return { ok: false, response: fail(res.status, res.code, res.message, res.retryable) };
  const data = (res.data ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(data.submissions) ? data.submissions : [];
  const parsed: ExpenseSubmissionV1[] = [];
  let unreadable = 0;
  let foreignTenantDropped = 0;
  for (const item of raw) {
    const s = parseExpenseSubmissionV1(item);
    if (!s) { unreadable += 1; continue; }
    if (s.organizationId !== ctx.timeOrganizationId) { foreignTenantDropped += 1; continue; }
    parsed.push(s);
  }
  let sources;
  try {
    sources = await loadBindingSources(ctx.admin, ctx.organizationId, parsed);
  } catch (e) {
    return { ok: false, response: fail(500, 'binding_read_failed', `Kunde inte läsa Planning-bindningen: ${(e as Error).message}`) };
  }
  const rows = parsed.map((submission) => ({ submission, binding: bindSubmission(submission, sources) }));
  return { ok: true, value: { rows, unreadable, foreignTenantDropped, generatedAt: res.generatedAt } };
}

async function handleList(ctx: ExpenseHandlerContext, body: Record<string, unknown>): Promise<ExpenseProxyResult> {
  const scope = body.scope === 'all' ? 'all' : 'open';
  const params: Record<string, unknown> = { scope };
  if (typeof body.submissionId === 'string') params.submissionId = body.submissionId;
  const read = await readSnapshots(ctx, params);
  if (!read.ok) return read.response;
  const { rows, unreadable, foreignTenantDropped, generatedAt } = read.value;
  return ok(EXPENSE_OPERATIONS.list, {
    schema: EXPENSE_REVIEW_SCHEMA,
    scope,
    rows,
    counts: {
      total: rows.length,
      open: rows.filter((r) => EXPENSE_OPEN_STATES.includes(r.submission.state)).length,
      bound: rows.filter((r) => r.binding.status === 'bound').length,
      unbound: rows.filter((r) => r.binding.status === 'unbound').length,
      unreadable,
      foreignTenantDropped,
    },
  }, generatedAt);
}

/** Loads exactly one snapshot (with its chain) and enforces every precondition. */
async function loadDecidable(
  ctx: ExpenseHandlerContext,
  submissionId: string,
): Promise<{ ok: true; row: ExpenseReviewRowV1 } | { ok: false; response: ExpenseProxyResult }> {
  const read = await readSnapshots(ctx, { scope: 'all', submissionId });
  if (!read.ok) return read;
  const row = read.value.rows.find((r) => r.submission.submissionId === submissionId);
  if (!row) return { ok: false, response: fail(404, 'submission_not_found', 'Utlägget finns inte i den här organisationens Time-tenant.') };
  if (row.binding.status !== 'bound') {
    return { ok: false, response: fail(403, 'assignment_unbound', `Utlägget är inte bundet till en bokning/ett projekt i Planning (${row.binding.reason}). Beslut och kvitto är spärrade.`) };
  }
  return { ok: true, row };
}

async function handleDecide(ctx: ExpenseHandlerContext, body: Record<string, unknown>): Promise<ExpenseProxyResult> {
  const v = validateExpenseDecideInput({
    submissionId: body.submissionId,
    submissionVersion: body.submissionVersion,
    expectedSnapshotHash: body.expectedSnapshotHash,
    decision: body.decision,
    reason: body.reason,
  });
  if (v.ok === false) return fail(400, v.code, v.message);
  const input = v.value;

  const loaded = await loadDecidable(ctx, input.submissionId);
  if (!loaded.ok) return loaded.response;
  const s = loaded.row.submission;
  if (!EXPENSE_OPEN_STATES.includes(s.state)) {
    return fail(409, 'already_decided', `Utlägget är redan i tillståndet "${s.state}" (v${s.version}).`);
  }
  if (s.version !== input.submissionVersion) {
    return fail(409, 'stale_revision', `Du tittade på v${input.submissionVersion}, men Time har v${s.version}. Läs om innan beslut.`);
  }
  if (s.canonicalHash !== input.expectedSnapshotHash) {
    return fail(409, 'stale_hash', 'Snapshotens hash matchar inte den du såg. Läs om innan beslut.');
  }

  const res = await callTimeExpenseAdapter(ctx, EXPENSE_OPERATIONS.decide, {
    submissionId: input.submissionId,
    submissionVersion: input.submissionVersion,
    expectedSnapshotHash: input.expectedSnapshotHash,
    decision: input.decision,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  });
  if (!res.ok) return fail(res.status, res.code, res.message, res.retryable);

  const decision = parseExpenseDecisionRecordV1((res.data as Record<string, unknown> | null)?.decision ?? res.data);
  if (!decision) return fail(502, 'contract_mismatch', 'Time returnerade inget giltigt beslutskvitto.');
  if (decision.submissionVersion !== input.submissionVersion || decision.snapshotHash !== input.expectedSnapshotHash) {
    return fail(502, 'decision_hash_mismatch',
      `Time kvitterade v${decision.submissionVersion}/${decision.snapshotHash.slice(0, 12)}… men beslutet gällde v${input.submissionVersion}/${input.expectedSnapshotHash.slice(0, 12)}…. Läs om kedjan.`);
  }
  return ok(EXPENSE_OPERATIONS.decide, { schema: EXPENSE_REVIEW_SCHEMA, decision, idempotencyKey: input.idempotencyKey }, res.generatedAt);
}

async function handleReceiptUrl(ctx: ExpenseHandlerContext, body: Record<string, unknown>): Promise<ExpenseProxyResult> {
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : '';
  const attachmentId = typeof body.attachmentId === 'string' ? body.attachmentId : '';
  if (!submissionId || !attachmentId) return fail(400, 'invalid_request', 'submissionId och attachmentId krävs.');

  const loaded = await loadDecidable(ctx, submissionId);
  if (!loaded.ok) return loaded.response;
  const att = loaded.row.submission.attachments.find((a) => a.attachmentId === attachmentId);
  if (!att) return fail(403, 'attachment_not_in_submission', 'Kvittot tillhör inte den här snapshoten.');

  const res = await callTimeExpenseAdapter(ctx, EXPENSE_OPERATIONS.receiptUrl, { submissionId, attachmentId });
  if (!res.ok) return fail(res.status, res.code, res.message, res.retryable);
  const data = (res.data ?? {}) as Record<string, unknown>;
  const url = typeof data.url === 'string' && /^https:\/\//i.test(data.url) ? data.url : null;
  if (!url) return fail(502, 'contract_mismatch', 'Time returnerade ingen signerad https-läsning.');
  return ok(EXPENSE_OPERATIONS.receiptUrl, {
    schema: EXPENSE_REVIEW_SCHEMA,
    url,
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
    ttlSeconds: typeof data.ttlSeconds === 'number' ? data.ttlSeconds : EXPENSE_RECEIPT_URL_TTL_SECONDS,
    attachmentId,
    sha256: att.sha256,
    mimeType: att.mimeType,
  }, res.generatedAt);
}

export async function handleExpenseOperation(
  ctx: ExpenseHandlerContext,
  operation: string,
  body: Record<string, unknown>,
): Promise<ExpenseProxyResult> {
  if (!EXPENSE_PROXY_OPERATIONS.has(operation)) return fail(400, 'unsupported_operation', `Unsupported Time operation: ${operation}`);
  if (!isExpensePreviewHost(ctx.adapterUrl)) {
    return fail(503, 'preview_gate_closed', 'Utläggsgranskning är låst till Times isolerade staging. Ingen produktionsväg finns.');
  }
  switch (operation) {
    case EXPENSE_OPERATIONS.list: return handleList(ctx, body);
    case EXPENSE_OPERATIONS.decide: return handleDecide(ctx, body);
    case EXPENSE_OPERATIONS.receiptUrl: return handleReceiptUrl(ctx, body);
    default: return fail(400, 'unsupported_operation', `Unsupported Time operation: ${operation}`);
  }
}

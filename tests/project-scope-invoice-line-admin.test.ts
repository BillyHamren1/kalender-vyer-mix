import {
  validateScopeInvoiceLineAdminEvidence,
  type ScopeInvoiceLineAdminEvidence,
  type ScopeInvoiceLineAdminRequest,
} from '../supabase/functions/_shared/project-scope-invoice-line-admin.ts';
import {
  readScopeInvoiceLines,
  type ScopeInvoiceLineReadClient,
} from '../src/lib/economy/projectScopeInvoiceLines.ts';

const assert = (condition: unknown, message = 'assertion failed'): asserts condition => {
  if (!condition) throw new Error(message);
};
async function rejects(run: () => unknown | Promise<unknown>, contains: string) {
  try { await run(); } catch (error) {
    assert(error instanceof Error && error.message.includes(contains), `unexpected error ${String(error)}`);
    return;
  }
  throw new Error('expected rejection');
}
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const org = id(1);
const request: ScopeInvoiceLineAdminRequest = {
  schema_version: 'operations-scope-invoice-line-admin-read.v1',
  root_kind: 'project',
  root_id: id(2),
  expected_composition_snapshot_id: id(3),
};
const line = (value: number) => ({
  source_organization_id: id(10),
  project_id: id(20 + value),
  invoice_id: id(30),
  source_allocation_id: id(40 + value),
  amount_minor: 60_000 + value,
  currency: 'SEK',
  source_economic_revision: 4,
  source_status: value % 2 ? 'confirmed' as const : 'preliminary' as const,
  source_economic_fingerprint: 'a'.repeat(64),
});
function evidence(lines = [line(1)]): ScopeInvoiceLineAdminEvidence {
  return {
    schema_version: 'operations-scope-invoice-line-admin-evidence.v1',
    authority_scope: 'canonical_scope_invoice_line_capture',
    organization_id: org,
    root_kind: request.root_kind,
    root_id: request.root_id,
    composition_snapshot_id: request.expected_composition_snapshot_id,
    scope_revision: 2,
    source_currentness: 'saved_receiver_heads_only',
    captured_inventory_matches_current: true,
    as_of: '2026-10-03T06:30:00Z',
    availability: lines.length ? 'available' : 'unavailable',
    lines,
    unavailable_source_count: 0,
    source_coverage: 'unavailable',
    credit_eligible: false,
  };
}

Deno.test('accepts exact positive split lines without calculating totals', () => {
  const value = evidence([line(1), line(2)]);
  assert(validateScopeInvoiceLineAdminEvidence(value, org, request).lines.length === 2);
  assert(!Object.hasOwn(value, 'known_total_minor'));
});

Deno.test('rejects zero, signed credit and rejected status instead of coercing them', async () => {
  for (const amount of [0, -1]) {
    const value = evidence();
    value.lines[0].amount_minor = amount;
    await rejects(() => validateScopeInvoiceLineAdminEvidence(value, org, request), 'invalid_scope_invoice_line_evidence');
  }
  const value = evidence() as unknown as { lines: { source_status: string }[] };
  value.lines[0].source_status = 'rejected';
  await rejects(() => validateScopeInvoiceLineAdminEvidence(value, org, request), 'invalid_scope_invoice_line_evidence');
});

Deno.test('rejects duplicate and noncanonical line identity order', async () => {
  const duplicate = evidence([line(1), line(1)]);
  await rejects(() => validateScopeInvoiceLineAdminEvidence(duplicate, org, request), 'invalid_scope_invoice_line_evidence');
  const reversed = evidence([line(2), line(1)]);
  await rejects(() => validateScopeInvoiceLineAdminEvidence(reversed, org, request), 'invalid_scope_invoice_line_evidence');
});

Deno.test('represents missing mapping and currentness as unavailable, never zero money', () => {
  const missing = evidence([]);
  missing.unavailable_source_count = 1;
  missing.captured_inventory_matches_current = false;
  const accepted = validateScopeInvoiceLineAdminEvidence(missing, org, request);
  assert(accepted.availability === 'unavailable' && accepted.lines.length === 0);
  assert(JSON.stringify(accepted).includes('amount_minor') === false);
  const partial = evidence();
  partial.captured_inventory_matches_current = false;
  partial.unavailable_source_count = 1;
  partial.availability = 'partial';
  assert(validateScopeInvoiceLineAdminEvidence(partial, org, request).availability === 'partial');
});

Deno.test('rejects cross-organization response', async () => {
  await rejects(() => validateScopeInvoiceLineAdminEvidence(evidence(), id(99), request), 'invalid_scope_invoice_line_evidence');
});

function clientFixture(options: { result?: unknown; error?: unknown; sessions?: string[] } = {}) {
  const calls: unknown[] = [];
  const headers: unknown[] = [];
  const signals: AbortSignal[] = [];
  const sessions = options.sessions ?? ['token-a', 'token-a'];
  let sessionIndex = 0;
  const client: ScopeInvoiceLineReadClient = {
    auth: { getSession: () => Promise.resolve({
      data: { session: { access_token: sessions[Math.min(sessionIndex++, sessions.length - 1)], user: { id: id(90) } } },
      error: null,
    }) },
    rpc: (name, args) => {
      calls.push([name, args]);
      return { setHeader: (header, value) => {
        headers.push([header, value]);
        return { abortSignal: (signal) => {
          signals.push(signal);
          return Promise.resolve({ data: options.result ?? evidence(), error: options.error ?? null });
        } };
      } };
    },
  };
  return { client, calls, headers, signals };
}
const authority = { actorId: id(90), accessToken: 'token-a', organizationId: org, request };

Deno.test('client binds exact authenticated RPC, bearer token and post-response session', async () => {
  const fixture = clientFixture();
  const result = await readScopeInvoiceLines(fixture.client, authority, new AbortController().signal);
  assert(result.lines.length === 1);
  assert(JSON.stringify(fixture.calls) === JSON.stringify([['read_operations_scope_invoice_lines_admin_v1', { p_request: request }]]));
  assert(JSON.stringify(fixture.headers) === JSON.stringify([['Authorization', 'Bearer token-a']]));
});

Deno.test('client rejects late session change and never returns copied rows', async () => {
  const fixture = clientFixture({ sessions: ['token-a', 'token-b'] });
  await rejects(() => readScopeInvoiceLines(fixture.client, authority, new AbortController().signal), 'Sessionen har ändrats');
});

Deno.test('client refuses an already-aborted request before RPC', async () => {
  const fixture = clientFixture();
  const controller = new AbortController();
  controller.abort();
  await rejects(() => readScopeInvoiceLines(fixture.client, authority, controller.signal), 'avbröts');
  assert(fixture.calls.length === 0);
});

Deno.test('client maps stale replay boundary to fixed PT409 message without private body', async () => {
  const fixture = clientFixture({ result: null, error: { code: 'PT409', message: 'private source identity' } });
  await rejects(() => readScopeInvoiceLines(fixture.client, authority, new AbortController().signal), 'har ändrats');
});

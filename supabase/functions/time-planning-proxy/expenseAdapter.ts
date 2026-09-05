/**
 * Signed transport for the expense operations of `planning-expense-review.v1`.
 *
 * Reuses the ONLY Planning→Time signing path (seed-derived ES256 service proof,
 * digest bound to the exact body bytes). Adds one thing the generic proxy path
 * lacks: precise detection of the EXTERNAL GATE — when Time's deployed adapter
 * manifest does not list an expense operation yet, the failure is reported as
 * `upstream_operation_missing` (HTTP 501) naming the exact operation, instead
 * of being blurred into a generic 400.
 */

import {
  buildServiceProofClaims,
  deriveSigningKeyFromSeed,
  SERVICE_PROOF_HEADER,
  sha256Hex,
  signServiceProofJwt,
} from '../_shared/timeServiceProof.ts';
import { EXPENSE_OPERATIONS } from '../_shared/time-v2/expenseReviewV1.ts';

const TIME_BOUNDARY_SCHEMA = 'time-planning-boundary.v1';
const TIME_ADAPTER_VERSION = 'time-planning-adapter.v2';

/**
 * Expense preview is locked to the ISOLATED Time staging project. Any other
 * adapter host fails closed — there is no production expense path yet.
 */
export const EXPENSE_PREVIEW_ALLOWED_TIME_HOSTS = ['pklkhhfvgmexsrkkpkzt.supabase.co'] as const;

export const isExpensePreviewHost = (adapterUrl: string): boolean => {
  try {
    const host = new URL(adapterUrl).host.toLowerCase();
    return (EXPENSE_PREVIEW_ALLOWED_TIME_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
};

export interface ExpenseAdapterContext {
  adapterUrl: string;
  anonKey?: string;
  signingSeed: string;
  timeOrganizationId: string;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export type ExpenseAdapterResult =
  | { ok: true; status: 200; data: unknown; generatedAt: string | null }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      retryable: boolean;
      /** True when Time's manifest proves the operation is not deployed. */
      upstreamMissing: boolean;
    };

const signedPost = async (
  ctx: ExpenseAdapterContext,
  operation: string,
  params: Record<string, unknown>,
): Promise<{ status: number; raw: Record<string, unknown> | null } | { transportError: string }> => {
  const payload = { schema: TIME_BOUNDARY_SCHEMA, organizationId: ctx.timeOrganizationId, operation, ...params };
  const bodyText = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-EventFlow-Consumer': 'planning-time-v2-expenses',
  };
  if (ctx.anonKey) headers.apikey = ctx.anonKey;
  const { key, keyId } = await deriveSigningKeyFromSeed(ctx.signingSeed);
  headers[SERVICE_PROOF_HEADER] = await signServiceProofJwt(
    key,
    keyId,
    buildServiceProofClaims({
      operation,
      organizationId: ctx.timeOrganizationId,
      bodySha256: await sha256Hex(bodyText),
    }),
  );
  try {
    const res = await (ctx.fetchImpl ?? fetch)(`${ctx.adapterUrl.replace(/\/+$/, '')}/time-planning-adapter`, {
      method: 'POST',
      headers,
      body: bodyText,
    });
    const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, raw };
  } catch (e) {
    return { transportError: (e as Error)?.message ?? 'okänt fel' };
  }
};

/** Reads Time's deployed operation list; empty when unreadable (fail closed). */
export async function readDeployedOperations(ctx: ExpenseAdapterContext): Promise<string[] | null> {
  const res = await signedPost(ctx, 'manifest', {});
  if ('transportError' in res || res.status !== 200 || !res.raw) return null;
  const data = (res.raw.data ?? {}) as Record<string, unknown>;
  const ops = Array.isArray(data.operations) ? data.operations : [];
  return ops
    .map((o) => (typeof o === 'string' ? o : (o as Record<string, unknown>)?.operation ?? (o as Record<string, unknown>)?.name))
    .filter((o): o is string => typeof o === 'string');
}

export const expenseGateMessage = (operation: string) =>
  `Extern gate: Times time-planning-adapter exponerar inte "${operation}" ännu (planning-expense-review.v1). ` +
  `Planning kan inte läsa eller besluta utlägg förrän Time lägger till operationen med server-härledd workspaceRef.`;

export async function callTimeExpenseAdapter(
  ctx: ExpenseAdapterContext,
  operation: (typeof EXPENSE_OPERATIONS)[keyof typeof EXPENSE_OPERATIONS],
  params: Record<string, unknown>,
): Promise<ExpenseAdapterResult> {
  const res = await signedPost(ctx, operation, params);
  if ('transportError' in res) {
    return { ok: false, status: 503, code: 'upstream_unavailable', message: `Time-gränsen gick inte att nå: ${res.transportError}`, retryable: true, upstreamMissing: false };
  }
  if (res.status === 200 && res.raw) {
    if (res.raw.adapterVersion !== TIME_ADAPTER_VERSION) {
      return { ok: false, status: 502, code: 'contract_mismatch', message: `Oväntad adapterversion från Time: ${String(res.raw.adapterVersion ?? 'okänd')}.`, retryable: false, upstreamMissing: false };
    }
    return { ok: true, status: 200, data: res.raw.data, generatedAt: typeof res.raw.generatedAt === 'string' ? res.raw.generatedAt : null };
  }
  const detail = res.raw ?? {};
  const code = typeof detail.code === 'string' ? detail.code : 'boundary_rejected';
  const message = typeof detail.error === 'string' ? detail.error : `Time-gränsen svarade ${res.status}.`;

  // 400 from Time can mean "operation not in the enum" OR "bad params". Only
  // the manifest can tell them apart — ask it before claiming a gate.
  if (res.status === 400 && (code === 'invalid_request' || code === 'unsupported_operation')) {
    const deployed = await readDeployedOperations(ctx);
    if (!deployed || !deployed.includes(operation)) {
      return { ok: false, status: 501, code: 'upstream_operation_missing', message: expenseGateMessage(operation), retryable: false, upstreamMissing: true };
    }
  }
  return { ok: false, status: res.status, code, message, retryable: detail.retryable === true, upstreamMissing: false };
}

/** Authenticated copied capture only. SQL owns authorization; Operations owns pricing. */
import {
  validateScopeInvoiceCaptureAdminRequest,
  validateScopeInvoiceCaptureAdminEvidence,
  type ScopeInvoiceCaptureAdminRequest,
  type ScopeInvoiceCaptureAdminEvidence,
} from '../../../supabase/functions/_shared/project-scope-invoice-capture-admin.ts';

export interface ScopeInvoiceCaptureReadAuthority {
  actorId: string;
  accessToken: string;
  organizationId: string;
  request: ScopeInvoiceCaptureAdminRequest;
}
export interface ScopeInvoiceCaptureReadClient {
  auth: { getSession(): PromiseLike<{
    data: { session: { access_token: string; user: { id: string } } | null };
    error: unknown;
  }> };
  rpc(name: 'read_operations_scope_invoice_capture_admin_v1', args: { p_request: ScopeInvoiceCaptureAdminRequest }): {
    setHeader(name: string, value: string): {
      abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

export async function readScopeInvoiceCapture(
  client: ScopeInvoiceCaptureReadClient,
  authority: ScopeInvoiceCaptureReadAuthority,
  signal: AbortSignal,
): Promise<ScopeInvoiceCaptureAdminEvidence> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!authority || typeof authority.accessToken !== 'string' || !authority.accessToken ||
    ![authority.actorId, authority.organizationId].every(v => typeof v === 'string' && uuid.test(v)))
    throw new Error('Underlagets läsbehörighet kunde inte verifieras.');
  const request = { ...validateScopeInvoiceCaptureAdminRequest(authority.request) };
  const { actorId, accessToken, organizationId } = authority;
  if (signal.aborted) throw new Error('Underlagsläsningen avbröts.');
  const controller = new AbortController(), started = performance.now();
  const forwardAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', forwardAbort, { once: true });
  if (signal.aborted) forwardAbort();
  const deadline = setTimeout(() => controller.abort(), 15_000);
  let onAbort: () => void = () => {};
  const stop = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Underlagsläsningen avbröts.'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  const fresh = () => {
    if (controller.signal.aborted || performance.now() - started >= 15_000)
      throw new Error('Underlagsläsningen avbröts.');
  };
  const checkSession = async () => {
    const result = await Promise.race([Promise.resolve(client.auth.getSession()), stop]);
    fresh();
    if (result.error || result.data.session?.access_token !== accessToken ||
      result.data.session.user.id !== actorId) throw new Error('Sessionen har ändrats.');
  };
  try {
    await checkSession();
    const result = await Promise.race([
      Promise.resolve(client.rpc('read_operations_scope_invoice_capture_admin_v1', { p_request: request })
        .setHeader('Authorization', `Bearer ${accessToken}`).abortSignal(controller.signal)), stop,
    ]);
    fresh();
    if (result.error) {
      if (typeof result.error === 'object' && result.error !== null &&
        (result.error as { code?: unknown }).code === 'PT409')
        throw new Error('Det visade underlaget har ändrats. Hämta projektets underlag igen.');
      throw new Error('Kostnadsunderlaget kunde inte hämtas.');
    }
    const value = await Promise.race([
      validateScopeInvoiceCaptureAdminEvidence(result.data, organizationId, request), stop,
    ]);
    fresh();
    // The final session check follows async fingerprint validation as well as RPC.
    await checkSession();
    fresh();
    return value;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

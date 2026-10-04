import {
  validateScopeInvoiceLineAdminEvidence,
  validateScopeInvoiceLineAdminRequest,
  type ScopeInvoiceLineAdminEvidence,
  type ScopeInvoiceLineAdminRequest,
} from '../../../supabase/functions/_shared/project-scope-invoice-line-admin.ts';

export interface ScopeInvoiceLineReadAuthority {
  actorId: string;
  accessToken: string;
  organizationId: string;
  request: ScopeInvoiceLineAdminRequest;
}

export interface ScopeInvoiceLineReadClient {
  auth: { getSession(): PromiseLike<{
    data: { session: { access_token: string; user: { id: string } } | null };
    error: unknown;
  }> };
  rpc(name: 'read_operations_scope_invoice_lines_admin_v1', args: { p_request: ScopeInvoiceLineAdminRequest }): {
    setHeader(name: string, value: string): {
      abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

export async function readScopeInvoiceLines(
  client: ScopeInvoiceLineReadClient,
  authority: ScopeInvoiceLineReadAuthority,
  signal: AbortSignal,
): Promise<ScopeInvoiceLineAdminEvidence> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!authority || typeof authority.accessToken !== 'string' || !authority.accessToken ||
    ![authority.actorId, authority.organizationId].every(value => typeof value === 'string' && uuid.test(value)))
    throw new Error('Raduppgifternas läsbehörighet kunde inte verifieras.');
  const request = { ...validateScopeInvoiceLineAdminRequest(authority.request) };
  const controller = new AbortController();
  const started = performance.now();
  const forwardAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', forwardAbort, { once: true });
  if (signal.aborted) forwardAbort();
  const deadline = setTimeout(() => controller.abort(), 15_000);
  let onAbort: () => void = () => {};
  const stop = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Raduppgifternas läsning avbröts.'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  const fresh = () => {
    if (controller.signal.aborted || performance.now() - started >= 15_000)
      throw new Error('Raduppgifternas läsning avbröts.');
  };
  const checkSession = async () => {
    const current = await Promise.race([Promise.resolve(client.auth.getSession()), stop]);
    fresh();
    if (current.error || current.data.session?.access_token !== authority.accessToken ||
      current.data.session.user.id !== authority.actorId) throw new Error('Sessionen har ändrats.');
  };
  try {
    await checkSession();
    const result = await Promise.race([
      Promise.resolve(client.rpc('read_operations_scope_invoice_lines_admin_v1', { p_request: request })
        .setHeader('Authorization', `Bearer ${authority.accessToken}`).abortSignal(controller.signal)),
      stop,
    ]);
    fresh();
    if (result.error) {
      if (typeof result.error === 'object' && result.error !== null &&
        (result.error as { code?: unknown }).code === 'PT409')
        throw new Error('Det visade raduppgifterna har ändrats. Hämta projektets underlag igen.');
      throw new Error('Raduppgifterna kunde inte hämtas.');
    }
    const evidence = validateScopeInvoiceLineAdminEvidence(result.data, authority.organizationId, request);
    fresh();
    await checkSession();
    fresh();
    return evidence;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

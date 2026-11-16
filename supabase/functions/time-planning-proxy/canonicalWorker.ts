import { UUID, isOpaqueStaffId, hasTimeAccess, readBoundedBody } from '../_shared/timePersonnelIdentity.ts';
export const IDENTITY_CONTEXT_REQUEST = { domain: 'personnel', activationMode: 'read_only' } as const;
export interface StaffRow {
  id: string; organization_id: string; is_active: boolean; tags: string[];
  name?: string; email?: string | null; role?: string | null;
}
export interface IdentityContext { operationsStaffId: string; organizationId: string }
export type Resolution = { ok: true; staff: StaffRow; via: 'operations_canonical' }
  | { ok: false; status: number; code: string; retryable: boolean };
const no = (status: number, code: string, retryable = false): Resolution => ({ ok: false, status, code, retryable });
/** Accept Time V2 and legacy field names; missing/invalid mappings never fall back to email. */
export function parseIdentityContext(body: unknown): IdentityContext | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const domain = value.identityDomain ?? value.domain;
  const organizationId = value.operationsOrganizationId ?? value.organizationId;
  if (domain !== 'personnel'
    || (value.domain !== undefined && value.domain !== 'personnel')
    || (value.identityDomain !== undefined && value.identityDomain !== 'personnel')
    || (value.activationMode !== undefined && value.activationMode !== 'read_only')
    || !isOpaqueStaffId(value.operationsStaffId) || typeof organizationId !== 'string'
    || !UUID.test(organizationId)) return null;
  return { operationsStaffId: value.operationsStaffId, organizationId: organizationId.toLowerCase() };
}
/** URL originates only from server TIME_ADAPTER_URL. No redirects or client endpoint. */
export async function fetchIdentityContext(adapterUrl: string, authorization: string, gatewayKey: string,
  fetcher: typeof fetch = fetch, timeoutMs = 5000): Promise<{ status: number; body: unknown } | null> {
  let url: URL;
  try {
    url = new URL(adapterUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !/^Bearer [^\s]+$/i.test(authorization)) return null;
    url = new URL('/functions/v1/identity-context', url.origin);
  } catch { return null; }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
  });
  const request = (async () => {
    try {
      const response = await fetcher(url.href, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { authorization, apikey: gatewayKey, 'content-type': 'application/json' },
        body: JSON.stringify(IDENTITY_CONTEXT_REQUEST) });
      if (response.redirected || (response.status >= 300 && response.status < 400)) return null;
      if (response.status !== 200) return { status: response.status, body: null };
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return null;
      return { status: 200, body: JSON.parse(await readBoundedBody(response, 4096)) as unknown };
    } catch { return null; }
  })();
  try { return await Promise.race([request, timeout]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
export interface ResolveDeps {
  fetchIdentityContext(): Promise<{ status: number; body: unknown } | null>;
  getStaffById(id: string, organizationId: string): Promise<StaffRow[]>;
  hasAccount(id: string, organizationId: string): Promise<boolean>;
}
export async function resolveWorkerStaff(deps: ResolveDeps): Promise<Resolution> {
  try {
    const response = await deps.fetchIdentityContext();
    if (!response) return no(503, 'identity_context_unavailable', true);
    if (response.status === 401 || response.status === 403) return no(response.status, 'identity_context_denied');
    if (response.status !== 200) return no(503, 'identity_context_unavailable', true);
    const identity = parseIdentityContext(response.body);
    if (!identity) return no(502, 'identity_context_invalid');
    const rows = await deps.getStaffById(identity.operationsStaffId, identity.organizationId);
    if (rows.length !== 1) return no(403, 'personnel_not_mapped');
    const staff = rows[0];
    if (staff.id !== identity.operationsStaffId || staff.organization_id.toLowerCase() !== identity.organizationId)
      return no(403, 'organization_mapping_mismatch');
    if (!staff.is_active || !hasTimeAccess(staff.tags)) return no(403, 'personnel_access_denied');
    if (!(await deps.hasAccount(staff.id, identity.organizationId))) return no(403, 'personnel_access_denied');
    return { ok: true, staff, via: 'operations_canonical' };
  } catch { return no(503, 'planning_read_failed', true); }
}

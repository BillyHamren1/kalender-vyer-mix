// Resolve the Operations staff row for a Time worker bearer via Time's verified
// identity-context (domain 'personnel', activationMode 'read_only').
// Pure + dependency-injected so it is unit tested; NOT under supabase/functions (auto-deploys).
import { isOpaqueStaffId } from '../time-staff-auth/core.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const IDENTITY_CONTEXT_REQUEST = { domain: 'personnel', activationMode: 'read_only' } as const;

export interface StaffRow { id: string; organization_id: string; name?: string; email?: string | null; role?: string | null; is_active: boolean }
export type IdentityContext =
  | { kind: 'operations'; operationsStaffId: string; organizationId: string }
  | { kind: 'legacy' }; // valid Time personnel profile with no Operations link

export type Resolution =
  | { ok: true; staff: StaffRow; via: 'operations_canonical' | 'legacy_email' }
  | { ok: false; status: number; code: string; retryable: boolean };

const no = (status: number, code: string, retryable = false): Resolution => ({ ok: false, status, code, retryable });

/** Strict payload check. Anything unexpected => null (fail closed, never fall back to email). */
export function parseIdentityContext(body: unknown): IdentityContext | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (b.domain !== 'personnel' || b.activationMode !== 'read_only') return null;
  if (b.operationsStaffId === null || b.operationsStaffId === undefined) {
    return 'organizationId' in b && b.organizationId != null && !(typeof b.organizationId === 'string' && UUID.test(b.organizationId)) ? null : { kind: 'legacy' };
  }
  if (!isOpaqueStaffId(b.operationsStaffId)) return null;
  if (typeof b.organizationId !== 'string' || !UUID.test(b.organizationId)) return null;
  return { kind: 'operations', operationsStaffId: b.operationsStaffId, organizationId: b.organizationId.toLowerCase() };
}

export interface ResolveDeps {
  /** POST IDENTITY_CONTEXT_REQUEST to Time with the worker's own bearer; null on network failure. */
  fetchIdentityContext(): Promise<{ status: number; body: unknown } | null>;
  /** Exact match on staff_members.id (TEXT). Never ilike, never lowercased. */
  getStaffById(id: string): Promise<StaffRow | null>;
  /** Legacy path only: verified Time user email -> exactly-one active staff row. */
  legacyByEmail(): Promise<Resolution>;
}

export async function resolveWorkerStaff(deps: ResolveDeps): Promise<Resolution> {
  const res = await deps.fetchIdentityContext();
  if (!res) return no(503, 'identity_context_unavailable', true);
  if (res.status === 401 || res.status === 403) return no(401, 'unauthorized');
  if (res.status !== 200) return no(503, 'identity_context_unavailable', res.status >= 500);
  const ctx = parseIdentityContext(res.body);
  if (!ctx) return no(502, 'identity_context_invalid');
  if (ctx.kind === 'legacy') return deps.legacyByEmail();

  const staff = await deps.getStaffById(ctx.operationsStaffId);
  if (!staff || staff.id !== ctx.operationsStaffId) return no(404, 'personnel_not_mapped');
  if (String(staff.organization_id).toLowerCase() !== ctx.organizationId) return no(409, 'organization_mapping_mismatch');
  if (staff.is_active !== true) return no(403, 'personnel_inactive');
  return { ok: true, staff, via: 'operations_canonical' };
}

// time-staff-auth — pure contract core (time-operations-auth.v1).
// Runtime-agnostic: no Deno/Supabase imports, so it is unit tested with vitest
// and wrapped by index.ts. NOT under supabase/functions/ on purpose: files there
// auto-deploy, and this contract must stay reviewable/non-live until approved.

export const SCHEMA = 'time-operations-auth.v1' as const;
export const SECRET_HEADER = 'x-time-operations-secret';
export const MAX_BODY_BYTES = 4096;
export const MIN_SECRET_LENGTH = 32;

export interface AccountRow { staff_id: string; organization_id: string; username: string; password_hash: string }
export interface StaffRow { id: string; organization_id: string; name: string; email: string | null; is_active: boolean }

export interface Deps {
  /** Rows whose email equals the identifier case-insensitively (caller must escape LIKE wildcards). */
  findStaffIdsByEmail(emailLower: string): Promise<{ id: string; email: string | null }[]>;
  findAccountsByStaffId(staffId: string): Promise<AccountRow[]>;
  findAccountsByUsername(usernameLower: string): Promise<AccountRow[]>;
  getStaff(staffId: string): Promise<StaffRow | null>;
  /** Durable limiter; true = allowed. Throwing = fail closed (503). */
  consumeRateLimit(bucket: string): Promise<boolean>;
  sha256Hex(input: string): Promise<string>;
}

export interface Result { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const err = (status: number, error: string): Result => ({ status, body: { schema: SCHEMA, error } });
const BAD_REQUEST = () => err(400, 'invalid_request');
const UNAUTHORIZED = () => err(401, 'invalid_credentials');
const FORBIDDEN = () => err(403, 'inactive');

/** Constant-time over the longer length; length mismatch still scans fully. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** Escape PostgreSQL LIKE/ILIKE metacharacters so the identifier is literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Same hash scheme as mobile-app-auth/mobile-app-api (`btoa(password) === hash`),
 * compared in constant time. Non-Latin1 input (btoa throws) never matches.
 */
export function verifyLegacyPasswordHash(password: string, storedHash: string): boolean {
  let encoded: string;
  try { encoded = btoa(password); } catch { return false; }
  return typeof storedHash === 'string' && storedHash.length > 0 && constantTimeEqual(encoded, storedHash);
}

export function checkSharedSecret(configured: string | undefined, presented: string | null): Result | null {
  if (!configured || configured.length < MIN_SECRET_LENGTH) return err(503, 'not_configured');
  if (!presented || !constantTimeEqual(presented, configured)) return err(401, 'unauthorized');
  return null;
}

type Parsed =
  | { action: 'verify_credentials'; identifier: string; password: string }
  | { action: 'resolve_active'; organizationId: string; staffId: string };

export function parseBody(raw: string): Parsed | null {
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(',');
  if (o.schema !== SCHEMA) return null;
  if (o.action === 'verify_credentials' && keys === 'action,identifier,password,schema') {
    const { identifier, password } = o;
    if (typeof identifier !== 'string' || typeof password !== 'string') return null;
    const id = identifier.trim();
    if (id.length < 1 || id.length > 320 || password.length < 1 || password.length > 256) return null;
    return { action: 'verify_credentials', identifier: id, password };
  }
  if (o.action === 'resolve_active' && keys === 'action,organizationId,schema,staffId') {
    const { organizationId, staffId } = o;
    if (typeof organizationId !== 'string' || typeof staffId !== 'string') return null;
    if (!UUID.test(organizationId) || !UUID.test(staffId)) return null;
    return { action: 'resolve_active', organizationId: organizationId.toLowerCase(), staffId: staffId.toLowerCase() };
  }
  return null;
}

function success(staff: StaffRow): Result {
  return {
    status: 200,
    body: {
      schema: SCHEMA,
      staff: { staffId: staff.id, organizationId: staff.organization_id, displayName: staff.name, email: staff.email ?? null },
    },
  };
}

/** Exactly-one account resolution, mirroring mobile-app-auth order but rejecting ambiguity. */
async function resolveAccount(deps: Deps, identifierLower: string): Promise<AccountRow | null | 'ambiguous'> {
  const byUsername = await deps.findAccountsByUsername(identifierLower);
  if (byUsername.length > 1) return 'ambiguous';
  if (!identifierLower.includes('@')) return byUsername[0] ?? null;

  const staffHits = (await deps.findStaffIdsByEmail(identifierLower))
    .filter((s) => (s.email ?? '').trim().toLowerCase() === identifierLower);
  if (staffHits.length > 1) return 'ambiguous';
  let byEmail: AccountRow | null = null;
  if (staffHits.length === 1) {
    const accounts = await deps.findAccountsByStaffId(staffHits[0].id);
    if (accounts.length > 1) return 'ambiguous';
    byEmail = accounts[0] ?? null;
  }
  // Email and username pointing at two different accounts is ambiguous, never a silent pick.
  if (byEmail && byUsername[0] && byUsername[0].staff_id !== byEmail.staff_id) return 'ambiguous';
  return byEmail ?? byUsername[0] ?? null;
}

export async function handle(deps: Deps, rawBody: string): Promise<Result> {
  const req = parseBody(rawBody);
  if (!req) return BAD_REQUEST();

  if (req.action === 'verify_credentials') {
    const idLower = req.identifier.toLowerCase();
    const idKey = await deps.sha256Hex(idLower); // never store the identifier in clear
    try {
      if (!(await deps.consumeRateLimit(`verify:id:${idKey}`))) return err(429, 'rate_limited');
      if (!(await deps.consumeRateLimit('verify:global'))) return err(429, 'rate_limited');
    } catch { return err(503, 'unavailable'); }

    const account = await resolveAccount(deps, idLower);
    if (!account || account === 'ambiguous') return UNAUTHORIZED();
    if (!verifyLegacyPasswordHash(req.password, account.password_hash)) return UNAUTHORIZED();
    const staff = await deps.getStaff(account.staff_id);
    // Identity comes only from validated rows; account/staff tenant mismatch is rejected.
    if (!staff || staff.id !== account.staff_id || staff.organization_id !== account.organization_id) return UNAUTHORIZED();
    if (!staff.is_active) return FORBIDDEN();
    return success(staff);
  }

  try {
    if (!(await deps.consumeRateLimit(`resolve:staff:${req.staffId}`))) return err(429, 'rate_limited');
  } catch { return err(503, 'unavailable'); }
  const staff = await deps.getStaff(req.staffId);
  if (!staff || staff.organization_id !== req.organizationId || !staff.is_active) return FORBIDDEN();
  const accounts = await deps.findAccountsByStaffId(staff.id);
  if (accounts.length !== 1 || accounts[0].organization_id !== staff.organization_id) return FORBIDDEN();
  return success(staff);
}

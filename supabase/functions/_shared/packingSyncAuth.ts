import type { TimeWmsActor } from './timeWmsProjection.ts';

export class PackingSyncAuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Only trusted service credentials or a verified same-tenant operational role
 * may invoke this service-role mutation. Profiles/user_metadata are not authority. */
export async function authorizePackingSync(
  admin: any,
  token: string,
  organizationId: string,
  serviceRoleKey: string,
): Promise<{ service: boolean; actor: TimeWmsActor | null }> {
  if (!token) throw new PackingSyncAuthError(401, 'unauthorized');
  if (serviceRoleKey && token === serviceRoleKey) return { service: true, actor: null };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new PackingSyncAuthError(401, 'unauthorized');
  const { data: roles, error: rolesError } = await admin.from('user_roles')
    .select('role').eq('user_id', data.user.id).eq('organization_id', organizationId);
  if (rolesError) throw new PackingSyncAuthError(503, 'role_lookup_failed');
  if (!(roles || []).some((row: any) => ['admin', 'projekt', 'lager', 'forsaljning'].includes(row.role))) {
    throw new PackingSyncAuthError(403, 'forbidden');
  }
  return { service: false, actor: { organizationId, personnelId: data.user.id, label: data.user.email || data.user.id } };
}

/** Dedicated cron secret or exact internal service credential, never an anon JWT. */
export function isPackingSyncWorkerAuthorized(
  token: string, providedCronSecret: string | null,
  serviceRoleKey: string, cronSecret: string,
): boolean {
  return Boolean((serviceRoleKey && token === serviceRoleKey) ||
    (cronSecret && providedCronSecret === cronSecret));
}

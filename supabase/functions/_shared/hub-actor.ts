/**
 * Shared HUB-subject -> local Planning principal resolution for signed BRAIN routes.
 * The request principal stays the canonical HUB subject. The local principal comes
 * only from the server-controlled resolve_hub_actor_v1 (auth.users id or immutable
 * hub_identity_links); user_metadata is never consulted. Authorization then uses
 * per-organization user_roles of the resolved local principal.
 */
export type HubActorAuthorization =
  | { ok: true; localUserId: string; mode: 'direct' | 'linked' }
  | { ok: false; status: 403 | 503; error: string; reason: string };

type AdminLike = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (table: string) => any;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Safe denial diagnostic: reason + route + org only, no subject/local ids or PII. */
export function logActorDenial(route: string, reason: string, organizationId: string) {
  console.warn(`[${route}] actor_denied ${JSON.stringify({ reason, organization_id: organizationId })}`);
}

export async function authorizeHubActor(
  admin: AdminLike,
  input: { hubSubject: string; organizationId: string; roles: readonly string[] },
): Promise<HubActorAuthorization> {
  const resolved = await admin.rpc('resolve_hub_actor_v1', { _hub_user_id: input.hubSubject });
  if (resolved.error) return { ok: false, status: 503, error: 'actor_lookup_failed', reason: 'resolver_unavailable' };
  const r = (resolved.data ?? {}) as { status?: unknown; mode?: unknown; localUserId?: unknown };
  if (r.status !== 'ok') {
    const reason = r.status === 'actor_ambiguous' ? 'actor_ambiguous' : 'actor_unmapped';
    return { ok: false, status: 403, error: 'actor_not_authorized', reason };
  }
  const localUserId = typeof r.localUserId === 'string' && UUID.test(r.localUserId) ? r.localUserId.toLowerCase() : null;
  const mode = r.mode === 'direct' || r.mode === 'linked' ? r.mode : null;
  if (!localUserId || !mode || (mode === 'direct' && localUserId !== input.hubSubject.toLowerCase())) {
    return { ok: false, status: 503, error: 'actor_lookup_failed', reason: 'resolver_malformed' };
  }
  const roles = await admin.from('user_roles')
    .select('role, organization_id')
    .eq('user_id', localUserId)
    .eq('organization_id', input.organizationId)
    .in('role', input.roles as string[]);
  if (roles.error) return { ok: false, status: 503, error: 'actor_lookup_failed', reason: 'roles_unavailable' };
  const allowed = ((roles.data ?? []) as { role?: unknown; organization_id?: unknown }[]).some((row) =>
    typeof row.organization_id === 'string' && row.organization_id.toLowerCase() === input.organizationId.toLowerCase() &&
    typeof row.role === 'string' && input.roles.includes(row.role));
  if (!allowed) return { ok: false, status: 403, error: 'actor_not_authorized', reason: 'actor_no_role' };
  return { ok: true, localUserId, mode };
}

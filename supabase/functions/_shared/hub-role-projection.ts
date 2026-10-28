// Both SSO and webhooks use canonical server-owned identity links. Email and
// editable user_metadata never choose an authorization principal.
export function sourceRevision(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)
    || value.length > 19 || BigInt(value) > 9223372036854775807n) {
    throw new Error('INVALID_SOURCE_REVISION');
  }
  return value;
}

export async function applyHubProjection(admin: any, input: {
  hubUserId: string; organizationId: string; email: string;
  fullName?: string; roles: string[]; revision: string | null;
}) {
  const { hubUserId, organizationId, email, fullName, roles, revision } = input;
  // Revocations must record a canonical tombstone even before a local identity
  // exists. Do not provision an account or move profile context to revoke.
  let userId: string | null = null;
  let localEmail = email;
  let created = false;
  if (roles.length) {
    const { data: identity, error: identityError } = await admin.rpc('resolve_hub_actor_v1', { _hub_user_id: hubUserId });
    if (identityError || !identity || !['ok', 'actor_unmapped'].includes(identity.status)) {
      return { ok: false, error: 'CANONICAL_IDENTITY_UNAVAILABLE' };
    }
    if (identity.status === 'ok') {
      userId = identity.localUserId;
      const { data: existing, error } = await admin.auth.admin.getUserById(userId);
      if (error || !existing?.user?.email) return { ok: false, error: 'IDENTITY_LOOKUP_FAILED' };
      localEmail = existing.user.email;
    } else {
      // A conflicting email must be explicitly mapped by the identity owner;
      // blindly adopting that account would cross authorization principals.
      const { data, error } = await admin.auth.admin.createUser({
        id: hubUserId, email, email_confirm: true,
        user_metadata: { full_name: fullName || '', hub_user_id: hubUserId, synced_from: 'eventflow_hub' },
      });
      if (error || data?.user?.id !== hubUserId) return { ok: false, error: 'CANONICAL_USER_CREATE_FAILED' };
      userId = data.user.id;
      localEmail = data.user.email || email;
      created = true;
    }
    const { error } = await admin.from('profiles').upsert({
      user_id: userId, email: localEmail, full_name: fullName || null, organization_id: organizationId,
    }, { onConflict: 'user_id' });
    if (error) return { ok: false, error: 'PROFILE_SYNC_FAILED' };
  }
  const { data: projection, error } = await admin.rpc('apply_hub_role_projection', {
    _hub_user_id: hubUserId, _organization_id: organizationId, _roles: roles, _source_revision: revision,
  });
  if (error || projection?.ok !== true) return { ok: false, error: projection?.error || 'ROLE_SYNC_FAILED' };
  return { ok: true, userId: projection.local_user_id ?? userId, localEmail, created,
    revoked: roles.length === 0, source_revision: projection.source_revision };
}

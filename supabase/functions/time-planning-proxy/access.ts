import {
  NO_ORGANIZATION_DENIAL,
  NO_PLANNING_ACCESS_DENIAL,
  type PlanningAccessResult,
} from '../_shared/planningAccess.ts';
import { resolveLagerExportBinding } from '../_shared/time-v2/lagerContextExport.ts';

/** The selected profile supplies context, never authority across organizations. */
export async function assertTimePlanningAccess(
  admin: { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  userId: string,
): Promise<PlanningAccessResult> {
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('organization_id').eq('user_id', userId).maybeSingle();
  if (profileError || typeof profile?.organization_id !== 'string' || !profile.organization_id) {
    return { ok: false, ...NO_ORGANIZATION_DENIAL };
  }
  const organizationId = profile.organization_id;
  const { data: role, error: roleError } = await admin.from('user_roles')
    .select('role').eq('user_id', userId).eq('organization_id', organizationId)
    .in('role', ['admin', 'projekt', 'lager']).limit(1).maybeSingle();
  if (roleError || !role || !['admin', 'projekt', 'lager'].includes(role.role)) {
    return { ok: false, ...NO_PLANNING_ACCESS_DENIAL };
  }
  try {
    const { data: moduleAllowed, error: moduleError } = await admin.rpc('hub_module_access_allowed', {
      _local_user_id: userId, _organization_id: organizationId, _module: 'planering',
    });
    if (moduleError || moduleAllowed !== true) return { ok: false, ...NO_PLANNING_ACCESS_DENIAL };
  } catch { return { ok: false, ...NO_PLANNING_ACCESS_DENIAL }; }
  return { ok: true, organizationId };
}

/** Reuse the established source-to-Time registry; an env override is no grant. */
export function resolveTimePlanningOrganization(sourceOrganizationId: string, configuredTarget?: string): string | null {
  try {
    const binding = resolveLagerExportBinding(sourceOrganizationId);
    if (configuredTarget !== undefined && configuredTarget.trim() !== binding.timeOrganizationId) return null;
    return binding.timeOrganizationId;
  } catch { return null; }
}

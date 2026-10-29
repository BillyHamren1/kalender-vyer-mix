// Profile organization is context only. Live scoped roles and the canonical
// versioned HUB gate must both authorize every service-role packing mutation.
export async function hasHubPackingGate(admin: any, userId: string, organizationId: string, modules: readonly ('planering' | 'lager')[]): Promise<boolean> {
  try {
    const results = await Promise.all(modules.map(module => admin.rpc('hub_module_access_allowed', {
      _local_user_id: userId, _organization_id: organizationId, _module: module,
    })));
    return results.some(result => !result.error && result.data === true);
  } catch { return false; }
}

export async function canMutatePacking(admin: any, userId: string, organizationId: string, module: 'planering' | 'lager'): Promise<boolean> {
  try {
    const { data: roles, error } = await admin.from('user_roles').select('role')
      .eq('user_id', userId).eq('organization_id', organizationId);
    const allowed = module === 'lager' ? ['admin', 'lager'] : ['admin', 'projekt', 'lager'];
    return !error && Array.isArray(roles) && roles.some(row => allowed.includes(row.role))
      && await hasHubPackingGate(admin, userId, organizationId, [module]);
  } catch { return false; }
}

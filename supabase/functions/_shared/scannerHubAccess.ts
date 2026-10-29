// Revalidate current server-owned authority for every login/read/command. A
// signed session authenticates staff identity; it does not freeze HUB grants.
export async function scannerStaffAccessAllowed(
  admin: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  staffId: string,
  organizationId: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('scanner_staff_access_allowed', {
      _staff_id: staffId, _organization_id: organizationId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

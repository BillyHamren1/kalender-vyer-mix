import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { enforceTenantCacheBoundary } from '@/lib/tenant/tenantCacheGuard';

/**
 * Bevakar aktiv organisation och rensar all klientcache vid tenant-byte.
 * Monteras en gång i app-shellen.
 */
export const useTenantCacheGuard = () => {
  const { organizationId } = useOrganizationId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    enforceTenantCacheBoundary(organizationId, () => {
      queryClient.cancelQueries();
      queryClient.clear();
    });
  }, [organizationId, queryClient]);
};

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { enforcePersistedCacheOwner, enforceTenantCacheBoundary } from '@/lib/tenant/tenantCacheGuard';
import { supabase } from '@/integrations/supabase/client';

/**
 * Bevakar aktiv organisation och rensar all klientcache vid tenant-byte.
 * Monteras en gång i app-shellen.
 */
export const useTenantCacheGuard = () => {
  const { organizationId } = useOrganizationId();
  const queryClient = useQueryClient();

  // Ägarskapskontroll så snart auth-läget ändras (login/logout/refresh).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const cleared = enforcePersistedCacheOwner(session?.user?.id ?? null);
      if (cleared) {
        queryClient.cancelQueries();
        queryClient.clear();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  useEffect(() => {
    if (!organizationId) return;
    enforceTenantCacheBoundary(organizationId, () => {
      queryClient.cancelQueries();
      queryClient.clear();
    });
  }, [organizationId, queryClient]);
};

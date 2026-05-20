import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cached lookup of the current user's organization_id.
 *
 * Historiskt har många komponenter och hooks själva kört
 * `auth.getUser()` + `from('profiles').select('organization_id')` direkt
 * vid mount. Vid login resulterade det i 7+ identiska parallella
 * REST-anrop mot `profiles` och 4+ mot `/auth/v1/user` enligt
 * nätverksloggen. Den här hooken konsoliderar dem till ETT delat
 * React Query-anrop (10 min stale, 30 min gc) som alla komponenter
 * kan dela på.
 *
 * Använd `useOrganizationId()` i komponenter och `getOrganizationId()`
 * i tjänster utanför React.
 */

const queryKeyFor = (userId: string | null) => ['organization-id', userId] as const;

export const useOrganizationId = () => {
  const { user, isLoading: authLoading } = useAuth();

  const query = useQuery<string | null>({
    queryKey: queryKeyFor(user?.id ?? null),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.organization_id ?? null;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  return {
    organizationId: query.data ?? null,
    isLoading: authLoading || (!!user?.id && query.isLoading),
    error: query.error as Error | null,
  };
};

/**
 * Service-side helper that mirrors the cache key. Uses a small in-memory
 * cache to avoid duplicate REST calls when several services kick off
 * within the same login burst. The cache TTL is intentionally short
 * (5 minutes) because services run outside React Query and must remain
 * correct after a user switch — `AuthContext.signOut` clears it.
 */
let cachedOrgId: { userId: string; orgId: string | null; expiresAt: number } | null = null;

export const getOrganizationId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (cachedOrgId && cachedOrgId.userId === user.id && cachedOrgId.expiresAt > Date.now()) {
    return cachedOrgId.orgId;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('[getOrganizationId] lookup failed', error);
    return cachedOrgId?.userId === user.id ? cachedOrgId.orgId : null;
  }

  cachedOrgId = {
    userId: user.id,
    orgId: data?.organization_id ?? null,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return cachedOrgId.orgId;
};

export const clearOrganizationIdCache = () => {
  cachedOrgId = null;
};

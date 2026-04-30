import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

const ROLES_QUERY_KEY = 'user-roles';

export const useUserRoles = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<AppRole[]>({
    queryKey: [ROLES_QUERY_KEY, user?.id ?? null],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user roles:', error);
        throw error;
      }
      return (data || []).map((r: { role: AppRole }) => r.role as AppRole);
    },
    enabled: !!user?.id,
    // Keep roles warm so navigation between pages doesn't refetch / re-blank
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000,    // 30 min
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  const roles: AppRole[] = query.data ?? [];

  // Treat as "loading" only if we have no cached roles yet AND a user exists.
  // Once roles are cached for this user, isLoading is false on every navigation.
  const hasCachedRoles = query.data !== undefined;
  const isLoading = !!user?.id && !hasCachedRoles && query.isLoading;

  const hasRole = useCallback(
    (role: AppRole): boolean => roles.includes(role),
    [roles]
  );

  const hasAnyRole = useCallback(
    (rolesToCheck: AppRole[]): boolean => rolesToCheck.some((r) => roles.includes(r)),
    [roles]
  );

  const isAdmin = roles.includes('admin');
  const hasPlanningAccess =
    roles.includes('admin') || roles.includes('projekt') || roles.includes('lager');
  const hasWarehouseAccess = roles.includes('admin') || roles.includes('lager');

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [ROLES_QUERY_KEY, user?.id ?? null] });
  }, [queryClient, user?.id]);

  return {
    roles,
    isLoading,
    error: query.error ? (query.error as Error).message : null,
    hasRole,
    hasAnyRole,
    isAdmin,
    hasPlanningAccess,
    hasWarehouseAccess,
    refetch,
  };
};

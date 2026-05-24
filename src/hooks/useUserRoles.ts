import { useCallback, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

const ROLES_QUERY_KEY = 'user-roles';
const APP_ROLES: AppRole[] = ['admin', 'forsaljning', 'projekt', 'lager'];
export const ROLE_FETCH_TIMEOUT_MS = 2_000;
const ROLE_BACKGROUND_RETRY_MS = 30_000;

export function getFallbackRolesFromUser(user: Pick<User, 'user_metadata'> | null | undefined): AppRole[] {
  const rawRoles = Array.isArray(user?.user_metadata?.roles)
    ? user.user_metadata.roles
    : typeof user?.user_metadata?.role === 'string'
      ? [user.user_metadata.role]
      : [];

  return [...new Set(rawRoles.filter((role): role is AppRole => APP_ROLES.includes(role as AppRole)))];
}

export const useUserRoles = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fallbackRoles = getFallbackRolesFromUser(user);
  const hasFallbackRoles = fallbackRoles.length > 0;
  // Tracks whether the last queryFn run hit the timeout / error path so we
  // can schedule a quiet background retry once the DB recovers, without
  // blocking the UI in the meantime.
  const lastFetchFailedRef = useRef(false);

  const query = useQuery<AppRole[]>({
    queryKey: [ROLES_QUERY_KEY, user?.id ?? null],
    queryFn: async () => {
      if (!user?.id) {
        lastFetchFailedRef.current = false;
        return [];
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        const result = await Promise.race([
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Timed out fetching user roles')), ROLE_FETCH_TIMEOUT_MS);
          }),
        ]);

        const { data, error } = result;

        if (error) {
          console.error('Error fetching user roles:', error);
          lastFetchFailedRef.current = true;
          return fallbackRoles;
        }

        lastFetchFailedRef.current = false;
        return (data || []).map((r: { role: AppRole }) => r.role as AppRole);
      } catch (error) {
        console.error('Error fetching user roles:', error);
        lastFetchFailedRef.current = true;
        return fallbackRoles;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
    enabled: !!user?.id,
    // Keep roles warm so navigation between pages doesn't refetch / re-blank
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000,    // 30 min
    placeholderData: hasFallbackRoles ? fallbackRoles : undefined,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 0,
  });

  const roles: AppRole[] = query.data ?? fallbackRoles;

  // Treat as "loading" only if we have no cached roles yet AND a user exists.
  // Once roles are cached for this user, isLoading is false on every navigation.
  const hasResolvedRoles = query.data !== undefined || hasFallbackRoles || query.isError;
  const isLoading = !!user?.id && !hasResolvedRoles && query.isLoading;

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

  // If the last fetch timed out / errored, quietly retry in the background
  // after ROLE_BACKGROUND_RETRY_MS so the user picks up real roles once the
  // DB recovers — without ever blocking the UI again.
  useEffect(() => {
    if (!user?.id) return;
    if (!query.isFetched) return;
    if (!lastFetchFailedRef.current) return;
    const t = setTimeout(() => { void refetch(); }, ROLE_BACKGROUND_RETRY_MS);
    return () => clearTimeout(t);
  }, [user?.id, query.isFetched, query.dataUpdatedAt, refetch]);

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

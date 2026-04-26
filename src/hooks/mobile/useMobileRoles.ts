import { useMemo } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import type { MobileAppRole } from '@/services/mobileApiService';

/**
 * useMobileRoles
 *
 * Reads `app_roles` and `is_planner` from the mobile auth payload (no extra
 * network calls — piggybacks on the existing `me` response).
 *
 * Rule: a user is a "planner" if they have at least one row in `user_roles`
 * (any of: admin / forsaljning / projekt / lager). This matches the set of
 * users that can log in to the web — see plan in .lovable/plan.md.
 */
export function useMobileRoles() {
  const { staff, isLoading } = useMobileAuth();

  return useMemo(() => {
    const roles: MobileAppRole[] = staff?.app_roles ?? [];
    const isPlanner = staff?.is_planner ?? roles.length > 0;
    return {
      roles,
      isPlanner,
      isLoading,
    };
  }, [staff?.app_roles, staff?.is_planner, isLoading]);
}

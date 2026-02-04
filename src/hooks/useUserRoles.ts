import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

interface UserRolesState {
  roles: AppRole[];
  isLoading: boolean;
  error: string | null;
}

export const useUserRoles = () => {
  const { user } = useAuth();
  const [state, setState] = useState<UserRolesState>({
    roles: [],
    isLoading: true,
    error: null,
  });

  const fetchRoles = useCallback(async () => {
    if (!user?.id) {
      setState({ roles: [], isLoading: false, error: null });
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user roles:', error);
        setState({ roles: [], isLoading: false, error: error.message });
        return;
      }

      const roles = (data || []).map(r => r.role as AppRole);
      setState({ roles, isLoading: false, error: null });
    } catch (err) {
      console.error('Error in fetchRoles:', err);
      setState({ 
        roles: [], 
        isLoading: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      });
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Check if user has a specific role
  const hasRole = useCallback((role: AppRole): boolean => {
    return state.roles.includes(role);
  }, [state.roles]);

  // Check if user has any of the specified roles
  const hasAnyRole = useCallback((roles: AppRole[]): boolean => {
    return roles.some(role => state.roles.includes(role));
  }, [state.roles]);

  // Convenience checks
  const isAdmin = state.roles.includes('admin');
  const hasPlanningAccess = state.roles.includes('admin') || 
                            state.roles.includes('projekt') || 
                            state.roles.includes('lager');
  const hasWarehouseAccess = state.roles.includes('admin') || 
                             state.roles.includes('lager');

  return {
    roles: state.roles,
    isLoading: state.isLoading,
    error: state.error,
    hasRole,
    hasAnyRole,
    isAdmin,
    hasPlanningAccess,
    hasWarehouseAccess,
    refetch: fetchRoles,
  };
};

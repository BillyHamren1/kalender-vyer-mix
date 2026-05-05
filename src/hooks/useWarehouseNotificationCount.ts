import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';
import { useCurrentOrg } from './useCurrentOrg';

export interface WarehouseNotificationCount {
  total: number;
  newProjects: number;
  changes: number;
}

/**
 * Counts warehouse notifications for the sidebar badge.
 * - newProjects: warehouse_project_inbox rows with status='new'
 * Filtered by current organization_id (multi-tenant).
 */
export function useWarehouseNotificationCount(): WarehouseNotificationCount {
  const { organizationId } = useCurrentOrg();

  useRealtimeInvalidation({
    channelName: 'warehouse-notification-count',
    tables: ['warehouse_project_inbox'],
    queryKeys: [['warehouse-notification-count', organizationId]],
  });

  const { data } = useQuery({
    queryKey: ['warehouse-notification-count', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<WarehouseNotificationCount> => {
      const inboxRes = await supabase
        .from('warehouse_project_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId!)
        .eq('status', 'new');

      const newProjects = inboxRes.count ?? 0;
      return { total: newProjects, newProjects, changes: 0 };
    },
    staleTime: 30000,
  });

  if (!organizationId) return { total: 0, newProjects: 0, changes: 0 };
  return data ?? { total: 0, newProjects: 0, changes: 0 };
}

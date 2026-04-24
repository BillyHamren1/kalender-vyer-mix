import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

export interface WarehouseNotificationCount {
  total: number;
  newProjects: number;
  changes: number;
}

/**
 * Counts warehouse notifications for the sidebar badge.
 * - newProjects: warehouse_project_inbox rows with status='new'
 */
export function useWarehouseNotificationCount(): WarehouseNotificationCount {
  useRealtimeInvalidation({
    channelName: 'warehouse-notification-count',
    tables: ['warehouse_project_inbox'],
    queryKeys: [['warehouse-notification-count']],
  });

  const { data } = useQuery({
    queryKey: ['warehouse-notification-count'],
    queryFn: async (): Promise<WarehouseNotificationCount> => {
      const inboxRes = await supabase
        .from('warehouse_project_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new');

      const newProjects = inboxRes.count ?? 0;
      return { total: newProjects, newProjects, changes: 0 };
    },
    staleTime: 30000,
  });

  return data ?? { total: 0, newProjects: 0, changes: 0 };
}

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export interface UnplannedTodoRow {
  id: string;
  type_label: string | null;
  type_key: string | null;
  title: string;
  client: string | null;
  address: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  booking_id: string | null;
  created_at: string;
}

/** To-dos som väntar på att placeras i kalendern (planning_status = needs_planning). */
export function useUnplannedTodos() {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ['unplanned-todos', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<UnplannedTodoRow[]> => {
      const { data, error } = await supabase
        .from('todos')
        .select('id, title, client, address, scheduled_date, start_time, end_time, booking_id, created_at, type:todo_types(key,label)')
        .eq('planning_status', 'needs_planning')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        type_label: r.type?.label ?? null,
        type_key: r.type?.key ?? null,
        title: r.title,
        client: r.client,
        address: r.address,
        scheduled_date: r.scheduled_date,
        start_time: r.start_time,
        end_time: r.end_time,
        booking_id: r.booking_id,
        created_at: r.created_at,
      }));
    },
    placeholderData: [],
  });

  useEffect(() => {
    if (!organizationId) return;
    const ch = supabase
      .channel('unplanned-todos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => {
        qc.invalidateQueries({ queryKey: ['unplanned-todos', organizationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, organizationId]);

  return query;
}

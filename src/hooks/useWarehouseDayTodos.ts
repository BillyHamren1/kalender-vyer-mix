import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

export interface WarehouseTodo {
  id: string;
  title: string;
  typeKey: string | null;
  typeLabel: string | null;
  scheduledDate: string | null;
  startTime: string | null;
  planningStatus: string;
  assignedStaffId: string | null;
  notes: string | null;
  externalSource: string | null;
}

/** Lagrets to-dos (befintliga todos med calendar_scope='warehouse') för en dag + odaterad kö. */
export function useWarehouseDayTodos(day: string) {
  const { organizationId } = useCurrentOrg();
  return useQuery<WarehouseTodo[]>({
    queryKey: ['warehouse-day-todos', organizationId, day],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('todos')
        .select('id,title,scheduled_date,start_time,planning_status,assigned_staff_id,internal_notes,external_source,type:todo_types(key,label)')
        .eq('organization_id', organizationId)
        .eq('calendar_scope', 'warehouse')
        .neq('planning_status', 'cancelled')
        .or(`scheduled_date.eq.${day},scheduled_date.is.null`)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id, title: r.title, typeKey: r.type?.key ?? null, typeLabel: r.type?.label ?? null,
        scheduledDate: r.scheduled_date, startTime: r.start_time, planningStatus: r.planning_status,
        assignedStaffId: r.assigned_staff_id, notes: r.internal_notes, externalSource: r.external_source,
      }));
    },
  });
}

export function useWarehouseTodoActions(day: string) {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();
  const refresh = () => qc.invalidateQueries({ queryKey: ['warehouse-day-todos'] });

  const typeId = async (key: 'warehouse_task' | 'repair_care') => {
    const { data, error } = await supabase.from('todo_types').select('id')
      .eq('organization_id', organizationId!).eq('key', key).maybeSingle();
    if (error || !data) throw new Error('Typen saknas för organisationen');
    return data.id as string;
  };

  return {
    async create(input: { title: string; kind: 'warehouse_task' | 'repair_care'; staffId: string | null; notes?: string; date?: string | null }) {
      if (!organizationId) throw new Error('Ingen organisation');
      const { error } = await (supabase as any).from('todos').insert({
        organization_id: organizationId, title: input.title.trim(), type_id: await typeId(input.kind),
        calendar_scope: 'warehouse', scheduled_date: input.date === undefined ? day : input.date,
        assigned_staff_id: input.staffId, planning_status: input.staffId ? 'planned' : 'needs_planning',
        internal_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      await refresh();
    },
    async assign(todoId: string, staffId: string | null) {
      const { error } = await (supabase as any).from('todos').update({
        assigned_staff_id: staffId, planning_status: staffId ? 'planned' : 'needs_planning',
        ...(staffId ? { scheduled_date: day } : {}),
      }).eq('id', todoId).eq('organization_id', organizationId!);
      if (error) throw error;
      await refresh();
    },
    async complete(todoId: string, done: boolean) {
      const { error } = await (supabase as any).from('todos').update({ planning_status: done ? 'completed' : 'planned' })
        .eq('id', todoId).eq('organization_id', organizationId!);
      if (error) throw error;
      await refresh();
    },
  };
}

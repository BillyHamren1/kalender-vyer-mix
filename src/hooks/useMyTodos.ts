import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { toast } from 'sonner';

export interface MyTodoRow {
  id: string;
  title: string;
  client: string | null;
  address: string | null;
  city: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  planning_status: string;
  calendar_scope: string;
  assigned_staff_id: string | null;
  internal_notes: string | null;
  type_label: string | null;
  type_key: string | null;
}

/**
 * Personliga todos för "Min sida" — calendar_scope = 'my_calendar'
 * och assigned_staff_id = currentStaffId.
 * Skapar/läser ALDRIG calendar_events.
 */
export function useMyTodos(staffId: string | null) {
  const qc = useQueryClient();
  const { organizationId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ['my-todos', organizationId, staffId],
    enabled: !!organizationId && !!staffId,
    queryFn: async (): Promise<MyTodoRow[]> => {
      const { data, error } = await supabase
        .from('todos')
        .select(
          'id, title, client, address, city, scheduled_date, start_time, end_time, booking_id, large_project_id, planning_status, calendar_scope, assigned_staff_id, internal_notes, type:todo_types(key,label)'
        )
        .eq('organization_id', organizationId!)
        .eq('calendar_scope', 'my_calendar')
        .eq('assigned_staff_id', staffId!)
        .order('scheduled_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        client: r.client,
        address: r.address,
        city: r.city,
        scheduled_date: r.scheduled_date,
        start_time: r.start_time,
        end_time: r.end_time,
        booking_id: r.booking_id,
        large_project_id: r.large_project_id,
        planning_status: r.planning_status,
        calendar_scope: r.calendar_scope,
        assigned_staff_id: r.assigned_staff_id,
        internal_notes: r.internal_notes,
        type_label: r.type?.label ?? null,
        type_key: r.type?.key ?? null,
      }));
    },
    placeholderData: [],
  });

  useEffect(() => {
    if (!organizationId || !staffId) return;
    const ch = supabase
      .channel(`my-todos-rt-${staffId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos', filter: `assigned_staff_id=eq.${staffId}` },
        () => qc.invalidateQueries({ queryKey: ['my-todos', organizationId, staffId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, organizationId, staffId]);

  const markDone = useMutation({
    mutationFn: async (todoId: string) => {
      const { error } = await (supabase as any)
        .from('todos')
        .update({ planning_status: 'done' })
        .eq('id', todoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Markerad som klar');
      qc.invalidateQueries({ queryKey: ['my-todos', organizationId, staffId] });
      qc.invalidateQueries({ queryKey: ['my-calendar-items'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte uppdatera'),
  });

  const reopen = useMutation({
    mutationFn: async (todoId: string) => {
      const { error } = await (supabase as any)
        .from('todos')
        .update({ planning_status: 'planned' })
        .eq('id', todoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-todos', organizationId, staffId] });
      qc.invalidateQueries({ queryKey: ['my-calendar-items'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (todoId: string) => {
      const { error } = await (supabase as any).from('todos').delete().eq('id', todoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Todo borttagen');
      qc.invalidateQueries({ queryKey: ['my-todos', organizationId, staffId] });
      qc.invalidateQueries({ queryKey: ['my-calendar-items'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte ta bort'),
  });

  return { ...query, markDone, reopen, remove };
}

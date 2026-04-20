import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ALL_TIME_REPORT_QUERY_KEYS = [
  'pending-time-reports',
  'time-report-approval-dashboard',
  'economy-time-reports',
  'economy-overview',
  'project-time-reports',
  'staff-economy-overview',
];

async function getApproverName(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Okänd';

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single();

  return profile?.full_name || user.email || 'Admin';
}

export function useApproveTimeReport() {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async (reportIds: string | string[]) => {
      const ids = Array.isArray(reportIds) ? reportIds : [reportIds];
      if (ids.length === 0) return;

      const approverName = await getApproverName();

      const { error } = await supabase
        .from('time_reports')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: approverName,
        })
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of ALL_TIME_REPORT_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success('Tidrapport godkänd');
    },
    onError: (error) => {
      console.error('Error approving time report:', error);
      toast.error('Kunde inte godkänna tidrapporten');
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
      previousValues,
    }: {
      id: string;
      updates: {
        hours_worked?: number;
        overtime_hours?: number;
        start_time?: string | null;
        end_time?: string | null;
        description?: string | null;
      };
      previousValues?: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from('time_reports')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      // Log the edit
      if (previousValues && Object.keys(previousValues).length > 0) {
        const approverName = await getApproverName();
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('time_report_edit_log').insert({
          time_report_id: id,
          edited_by_type: 'admin',
          edited_by_name: approverName,
          edited_by_id: user?.id || null,
          previous_values: previousValues,
          new_values: updates,
        } as any);
      }
    },
    onSuccess: () => {
      for (const key of ALL_TIME_REPORT_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success('Tidrapport uppdaterad');
    },
    onError: (error) => {
      console.error('Error editing time report:', error);
      toast.error('Kunde inte uppdatera tidrapporten');
    },
  });

  return { approveMutation, editMutation };
}

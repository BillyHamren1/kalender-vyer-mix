import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AiSuggestion {
  id: string;
  time_report_id: string;
  staff_id: string;
  report_date: string;
  suggestion_type: string;
  suggested_start_time: string | null;
  suggested_end_time: string | null;
  target_project_id: string | null;
  human_readable_text: string;
  ai_reasoning: string | null;
  ai_verdict: string | null;
  ai_model: string | null;
  apply_rule: string | null;
  applied_by_ai: boolean;
  status: 'pending' | 'applied' | 'dismissed' | 'undone';
  confidence: number;
  created_at?: string;
}

export function useAiSuggestionsForDay(staffId: string | null, date: string | null) {
  const qc = useQueryClient();
  const key = ['ai-suggestions', staffId, date];

  const q = useQuery({
    queryKey: key,
    enabled: !!staffId && !!date,
    queryFn: async (): Promise<AiSuggestion[]> => {
      const { data, error } = await supabase
        .from('time_report_correction_suggestions')
        .select('*')
        .eq('staff_id', staffId as string)
        .eq('report_date', date as string)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as AiSuggestion[];
    },
    refetchInterval: 30_000,
  });

  // Realtime: när nya suggestions kommer in → refetch
  useEffect(() => {
    if (!staffId || !date) return;
    const ch = supabase
      .channel(`ai-sug-${staffId}-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_report_correction_suggestions',
          filter: `staff_id=eq.${staffId}`,
        },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, date]);

  return q;
}

export function useReviewBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (timeReportId: string) => {
      const { data, error } = await supabase.functions.invoke('ai-time-block-reviewer', {
        body: { action: 'review_block', time_report_id: timeReportId, trigger: 'manual' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
      qc.invalidateQueries({ queryKey: ['staff-week-reports'] });
    },
    onError: (e: Error) => toast.error(`AI-granskning misslyckades: ${e.message}`),
  });
}

export function useReviewDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, date }: { staffId: string; date: string }) => {
      const { data, error } = await supabase.functions.invoke('ai-time-block-reviewer', {
        body: { action: 'review_day', staff_id: staffId, date },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: { count?: number } | undefined) => {
      toast.success(`AI granskade ${d?.count ?? 0} block`);
      qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
      qc.invalidateQueries({ queryKey: ['staff-week-reports'] });
    },
    onError: (e: Error) => toast.error(`AI-granskning misslyckades: ${e.message}`),
  });
}

export function useApplySuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { data, error } = await supabase.functions.invoke('ai-time-block-reviewer', {
        body: { action: 'apply_suggestion', suggestion_id: suggestionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Förslag tillämpat');
      qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
      qc.invalidateQueries({ queryKey: ['staff-week-reports'] });
    },
    onError: (e: Error) => toast.error(`Kunde inte tillämpa: ${e.message}`),
  });
}

export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { data, error } = await supabase.functions.invoke('ai-time-block-reviewer', {
        body: { action: 'dismiss_suggestion', suggestion_id: suggestionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
    },
  });
}

export function useUndoAiApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { data, error } = await supabase.functions.invoke('ai-time-block-reviewer', {
        body: { action: 'undo_apply', suggestion_id: suggestionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Ändring återställd');
      qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
      qc.invalidateQueries({ queryKey: ['staff-week-reports'] });
    },
  });
}

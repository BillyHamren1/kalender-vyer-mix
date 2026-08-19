import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { PackingChangeRequest } from '@/lib/packing/shortNoticeChange';

export const packingChangeRequestsKey = (packingId: string) => ['packing-change-requests', packingId];

export function usePackingChangeRequests(packingId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: packingChangeRequestsKey(packingId || ''),
    enabled: !!packingId,
    queryFn: async (): Promise<PackingChangeRequest[]> => {
      const { data, error } = await supabase
        .from('packing_change_requests')
        .select('*')
        .eq('packing_id', packingId!)
        .eq('status', 'pending')
        .order('urgency', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PackingChangeRequest[];
    },
  });

  useEffect(() => {
    if (!packingId) return;
    const channel = supabase
      .channel(`packing-change-requests-${packingId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'packing_change_requests', filter: `packing_id=eq.${packingId}` },
        () => queryClient.invalidateQueries({ queryKey: packingChangeRequestsKey(packingId) })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [packingId, queryClient]);

  const apply = useMutation({
    mutationFn: async (opts: { ids?: string[]; force?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('apply-packing-change-request', {
        body: {
          packing_id: packingId,
          change_request_ids: opts.ids ?? [],
          force: opts.force ?? false,
        },
      });
      if (error) throw error;
      return data as { applied: number; blocked: Array<{ message: string }> };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: packingChangeRequestsKey(packingId || '') });
      queryClient.invalidateQueries({ queryKey: ['packing-list'] });
      queryClient.invalidateQueries({ queryKey: ['packing-detail'] });
      queryClient.invalidateQueries({ queryKey: ['packing-needs-review'] });
      if (result?.blocked?.length) {
        result.blocked.forEach((b) => toast.error(b.message));
      }
      if (result?.applied > 0) {
        toast.success(`${result.applied} ändring(ar) mottagen och inskriven i packlistan`);
      }
    },
    onError: (err: any) => toast.error(`Kunde inte ta emot ändringen: ${err?.message || err}`),
  });

  return {
    changes: query.data || [],
    isLoading: query.isLoading,
    apply,
  };
}

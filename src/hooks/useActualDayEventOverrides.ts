import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { toast } from 'sonner';

export interface ActualDayEventOverride {
  id: string;
  staff_id: string;
  local_date: string;
  event_key: string;
  action: 'exclude';
  reason: string;
  created_at: string;
  created_by: string | null;
}

const KEY = 'actual-day-event-overrides';

export function useActualDayEventOverrides(staffId: string | null, localDate: string | null) {
  const { organizationId, userId } = useCurrentOrg();
  const qc = useQueryClient();

  const query = useQuery<ActualDayEventOverride[]>({
    queryKey: [KEY, organizationId, staffId, localDate],
    enabled: !!organizationId && !!staffId && !!localDate,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('actual_day_event_overrides')
        .select('*')
        .eq('organization_id', organizationId!)
        .eq('staff_id', staffId!)
        .eq('local_date', localDate!);
      if (error) throw error;
      return (data ?? []) as ActualDayEventOverride[];
    },
  });

  const excludedKeys = new Set((query.data ?? []).filter(o => o.action === 'exclude').map(o => o.event_key));

  const exclude = useCallback(async (eventKey: string, reason = 'manual_remove') => {
    if (!organizationId || !staffId || !localDate || !userId) {
      toast.error('Saknar org/användare');
      return false;
    }
    const { error } = await supabase.from('actual_day_event_overrides').insert({
      organization_id: organizationId,
      staff_id: staffId,
      local_date: localDate,
      event_key: eventKey,
      action: 'exclude',
      reason,
      created_by: userId,
    });
    if (error) {
      // Ignore unique-violation as success
      if ((error as any).code !== '23505') {
        console.error('exclude override failed', error);
        toast.error('Kunde inte ta bort raden');
        return false;
      }
    }
    await qc.invalidateQueries({ queryKey: [KEY, organizationId, staffId, localDate] });
    toast.success('Raden borttagen från dagens rapport');
    return true;
  }, [organizationId, staffId, localDate, userId, qc]);

  return {
    overrides: query.data ?? [],
    excludedKeys,
    isLoading: query.isLoading,
    exclude,
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches all workday_flags for one staff member on one date — used as the
 * "notifications + answers" source in the admin day event log.
 */
export function useDayWorkdayFlags(
  staffId: string | null | undefined,
  date: string | null | undefined,
) {
  return useQuery({
    queryKey: ['day-workday-flags', staffId, date],
    enabled: !!staffId && !!date,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workday_flags')
        .select('*')
        .eq('staff_id', staffId as string)
        .eq('flag_date', date as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

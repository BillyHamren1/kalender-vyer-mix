import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StaffGpsDaySummary } from './useStaffGpsWeekSummary';

interface Args {
  staffId: string | null;
  staffName: string | null;
  summary: StaffGpsDaySummary | undefined;
  enabled?: boolean;
}

/**
 * Genererar en kort AI-sammanfattning av en GPS-dag.
 * Cache:as per (staffId, date, pingsCount, durationMin) så att vi bara kallar
 * AI när dagens data faktiskt ändrats.
 */
export function useStaffGpsDayNarrative({ staffId, staffName, summary, enabled = true }: Args) {
  const key = summary
    ? ['gps-day-narrative', staffId, summary.date, summary.pingsCount, summary.durationMin, summary.places.length]
    : ['gps-day-narrative', 'noop'];

  const isEnabled =
    enabled &&
    !!staffId &&
    !!summary &&
    !summary.isLoading &&
    summary.pingsCount > 0 &&
    !!summary.firstIso &&
    !!summary.lastIso;

  return useQuery<{ narrative: string }>({
    queryKey: key,
    enabled: isEnabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    queryFn: async () => {
      if (!summary || !staffId) return { narrative: '' };
      const visits = summary.visits.slice(0, 30).map(v => ({
        name: v.knownSite?.name ?? 'Okänd plats',
        start: v.start,
        end: v.end,
        minutes: Math.max(0, Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60_000)),
        is_private: false,
      }));
      const { data, error } = await supabase.functions.invoke('gps-day-narrative', {
        body: {
          staff_name: staffName ?? 'Personen',
          date: summary.date,
          first_iso: summary.firstIso,
          last_iso: summary.lastIso,
          duration_min: summary.durationMin,
          places: summary.places,
          visits,
        },
      });
      if (error) throw error;
      return { narrative: (data as any)?.narrative ?? '' };
    },
  });
}

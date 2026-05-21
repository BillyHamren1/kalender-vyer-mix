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
 * Genererar en nyfiken AI-sammanfattning av en GPS-dag. Skickar hela
 * dygnstidslinjen (stays + moves, inkl. okända stopp) så edge-funktionen
 * kan reverse-geocoda och låta modellen resonera om syfte.
 */
export function useStaffGpsDayNarrative({ staffId, staffName, summary, enabled = true }: Args) {
  const key = summary
    ? [
        'gps-day-narrative',
        'v2',
        staffId,
        summary.date,
        summary.pingsCount,
        summary.durationMin,
        summary.timeline.length,
      ]
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
      const { data, error } = await supabase.functions.invoke('gps-day-narrative', {
        body: {
          staff_name: staffName ?? 'Personen',
          date: summary.date,
          first_iso: summary.firstIso,
          last_iso: summary.lastIso,
          duration_min: summary.durationMin,
          places: summary.places,
          timeline: summary.timeline,
        },
      });
      if (error) throw error;
      return { narrative: (data as any)?.narrative ?? '' };
    },
  });
}

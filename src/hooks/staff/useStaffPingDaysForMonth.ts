import { useQuery } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hämtar vilka dagar i en given månad som har minst en GPS-ping för en person.
 * Returnerar en Map där nyckel = 'yyyy-MM-dd' (Stockholm-datum approx via UTC)
 * och värde = antal pings den dagen. Används för att färgmarkera datum i
 * månadskalendern på GPS-satellitkartan.
 *
 * Notera: vi tolkar datumet i lokal tid (Europe/Stockholm via toLocaleDateString)
 * så att en ping kl 23:30 lokal tid hamnar på rätt dag även om den ligger
 * runt midnatt UTC.
 */
export function useStaffPingDaysForMonth(
  staffId: string | null,
  monthAnchor: Date,
) {
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const monthKey = format(monthStart, 'yyyy-MM');

  return useQuery({
    queryKey: ['staff-ping-days-month', staffId, monthKey],
    enabled: !!staffId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!staffId) return new Map<string, number>();
      // Hämta lite extra på varje sida för att täcka tidszonsförskjutningen.
      const startIso = new Date(monthStart.getTime() - 12 * 3600_000).toISOString();
      const endIso = new Date(monthEnd.getTime() + 36 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from('staff_location_history')
        .select('recorded_at')
        .eq('staff_id', staffId)
        .gte('recorded_at', startIso)
        .lte('recorded_at', endIso)
        .limit(100000);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of (data ?? []) as { recorded_at: string }[]) {
        const d = new Date(row.recorded_at);
        // 'sv-SE' ger 'yyyy-MM-dd' i Europe/Stockholm
        const key = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    },
  });
}

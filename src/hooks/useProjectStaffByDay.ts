/**
 * useProjectStaffByDay
 * --------------------------------------------------------------------------
 * Speglar personalkalendern 1:1 in i projektkalendern.
 *
 * Personal ses som "tillgänglig" på projektet på en given dag om hen har en
 * `staff_assignments`-rad för det datumet — oavsett vilket team. Det är
 * exakt samma deterministiska modell som calendar-team-model-v1: BSA =
 * staff_assignments × calendar_events.resource_id.
 *
 * Returnerar Map<YYYY-MM-DD, StaffOnDay[]> för enkel uppslagning per dag.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StaffOnDay {
  staffId: string;
  name: string;
  teamId: string | null;
}

export function useProjectStaffByDay(dates: string[]) {
  const queryClient = useQueryClient();

  // Stabil nyckel oberoende av input-ordning
  const sortedDates = useMemo(() => [...dates].sort(), [dates.join(',')]);
  const datesKey = sortedDates.join(',');

  const query = useQuery({
    queryKey: ['project-staff-by-day', datesKey],
    enabled: sortedDates.length > 0,
    queryFn: async (): Promise<Map<string, StaffOnDay[]>> => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select(`
          assignment_date,
          team_id,
          staff_id,
          staff_members ( id, name )
        `)
        .in('assignment_date', sortedDates);

      if (error) {
        console.error('[useProjectStaffByDay] fetch failed', error);
        throw error;
      }

      const byDay = new Map<string, StaffOnDay[]>();
      const seen = new Map<string, Set<string>>(); // dedupe per dag

      (data || []).forEach((row: any) => {
        const date: string = row.assignment_date;
        const sm = row.staff_members;
        if (!sm?.id) return;

        if (!byDay.has(date)) byDay.set(date, []);
        if (!seen.has(date)) seen.set(date, new Set());

        if (seen.get(date)!.has(sm.id)) return;
        seen.get(date)!.add(sm.id);

        byDay.get(date)!.push({
          staffId: sm.id,
          name: sm.name,
          teamId: row.team_id ?? null,
        });
      });

      // Sortera namn alfabetiskt per dag
      byDay.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, 'sv')));
      return byDay;
    },
  });

  // Realtime: lyssna på staff_assignments-ändringar för datumen
  useEffect(() => {
    if (sortedDates.length === 0) return;
    const channel = supabase
      .channel(`project-staff-by-day-${datesKey.slice(0, 50)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_assignments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['project-staff-by-day', datesKey] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [datesKey, queryClient, sortedDates.length]);

  return {
    staffByDay: query.data ?? new Map<string, StaffOnDay[]>(),
    isLoading: query.isLoading,
  };
}

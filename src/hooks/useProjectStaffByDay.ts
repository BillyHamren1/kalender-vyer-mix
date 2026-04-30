/**
 * useProjectStaffByDay
 * --------------------------------------------------------------------------
 * Speglar personalkalenderns team+dag-modell in i projektkalendern.
 *
 * Data kommer direkt från `staff_assignments`. För projektvyn behöver vi både:
 *   1. personal per dag (översikt)
 *   2. personal per team + dag (för samma grid som TimeGrid använder)
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface StaffOnDay {
  staffId: string;
  name: string;
  teamId: string | null;
}

interface StaffMaps {
  staffByDay: Map<string, StaffOnDay[]>;
  staffByTeamAndDay: Map<string, StaffOnDay[]>;
}

export function useProjectStaffByDay(dates: string[]) {
  const queryClient = useQueryClient();
  const sortedDates = useMemo(() => [...dates].sort(), [dates.join(',')]);
  const datesKey = sortedDates.join(',');

  const query = useQuery({
    queryKey: ['project-staff-by-day', datesKey],
    enabled: sortedDates.length > 0,
    queryFn: async (): Promise<StaffMaps> => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select(`
          assignment_date,
          team_id,
          staff_id,
          staff_members ( id, name )
        `)
        .in('assignment_date', sortedDates)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[useProjectStaffByDay] fetch failed', error);
        throw error;
      }

      const staffByDay = new Map<string, StaffOnDay[]>();
      const staffByTeamAndDay = new Map<string, StaffOnDay[]>();
      const seenByDay = new Map<string, Set<string>>();
      const seenByTeamDay = new Map<string, Set<string>>();

      (data || []).forEach((row: any) => {
        const date: string = row.assignment_date;
        const staff = row.staff_members;
        const teamId: string | null = row.team_id ?? null;
        if (!staff?.id || !date) return;

        if (!staffByDay.has(date)) staffByDay.set(date, []);
        if (!seenByDay.has(date)) seenByDay.set(date, new Set());
        if (!seenByDay.get(date)!.has(staff.id)) {
          seenByDay.get(date)!.add(staff.id);
          staffByDay.get(date)!.push({ staffId: staff.id, name: staff.name, teamId });
        }

        if (teamId) {
          const teamDayKey = `${date}|${teamId}`;
          if (!staffByTeamAndDay.has(teamDayKey)) staffByTeamAndDay.set(teamDayKey, []);
          if (!seenByTeamDay.has(teamDayKey)) seenByTeamDay.set(teamDayKey, new Set());
          if (!seenByTeamDay.get(teamDayKey)!.has(staff.id)) {
            seenByTeamDay.get(teamDayKey)!.add(staff.id);
            staffByTeamAndDay.get(teamDayKey)!.push({ staffId: staff.id, name: staff.name, teamId });
          }
        }
      });

      staffByDay.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, 'sv')));
      staffByTeamAndDay.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, 'sv')));

      return { staffByDay, staffByTeamAndDay };
    },
  });

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

  const staffByDay = query.data?.staffByDay ?? new Map<string, StaffOnDay[]>();
  const staffByTeamAndDay = query.data?.staffByTeamAndDay ?? new Map<string, StaffOnDay[]>();

  return {
    staffByDay,
    staffByTeamAndDay,
    isLoading: query.isLoading,
    getStaffForTeamAndDate: (teamId: string, date: Date) => {
      const key = `${format(date, 'yyyy-MM-dd')}|${teamId}`;
      return staffByTeamAndDay.get(key) ?? [];
    },
  };
}

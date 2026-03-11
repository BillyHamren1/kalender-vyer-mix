import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Resource } from '@/components/Calendar/ResourceData';
import { getAvailableStaffForDateRange } from '@/services/staffAvailabilityService';
import { supabase } from '@/integrations/supabase/client';

interface AvailableStaffMember {
  id: string;
  name: string;
  color?: string;
  assignedTeamId?: string;
  assignedTeamName?: string;
}

/**
 * Fetches available staff for an entire week in a single batch query,
 * then enriches each day's list with team assignment info.
 */
export const useAvailableStaffWeek = (
  days: Date[],
  weekStartTime: number,
  resources: Resource[],
  weeklyStaffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{ id: string; name: string; color?: string }>;
  }
) => {
  const { data: weekAvailableStaff } = useQuery({
    queryKey: ['available-staff-week', weekStartTime, days.map(d => format(d, 'yyyy-MM-dd')).join(',')],
    queryFn: async () => {
      const results: Record<string, Array<{ id: string; name: string; color?: string }>> = {};
      const availableByDate = await getAvailableStaffForDateRange(days);

      const allStaffIds = new Set<string>();
      for (const ids of Object.values(availableByDate)) {
        ids.forEach(id => allStaffIds.add(id));
      }

      let staffLookup: Record<string, { id: string; name: string; color?: string }> = {};
      if (allStaffIds.size > 0) {
        const { data: staffData } = await supabase
          .from('staff_members' as any)
          .select('id, name, color')
          .in('id', Array.from(allStaffIds))
          .eq('is_active', true);

        for (const s of (staffData as any[]) || []) {
          staffLookup[s.id] = { id: s.id, name: s.name, color: s.color || undefined };
        }
      }

      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const ids = availableByDate[dateStr] || [];
        results[dateStr] = ids.map(id => staffLookup[id]).filter(Boolean);
      }

      return results;
    },
    staleTime: 30000,
  });

  const getAvailableStaffForDay = useCallback((date: Date): AvailableStaffMember[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const availableStaff = weekAvailableStaff?.[dateStr] || [];

    if (!weeklyStaffOperations) {
      return availableStaff.map(s => ({ ...s, assignedTeamId: undefined, assignedTeamName: undefined }));
    }

    return availableStaff.map(staff => {
      for (const resource of resources) {
        const teamStaff = weeklyStaffOperations.getStaffForTeamAndDate(resource.id, date);
        if (teamStaff.some(ts => ts.id === staff.id)) {
          return { ...staff, assignedTeamId: resource.id, assignedTeamName: resource.title };
        }
      }
      return { ...staff, assignedTeamId: undefined, assignedTeamName: undefined };
    });
  }, [weekAvailableStaff, weeklyStaffOperations, resources]);

  return { getAvailableStaffForDay };
};

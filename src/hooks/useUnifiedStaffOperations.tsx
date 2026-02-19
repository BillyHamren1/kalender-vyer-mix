import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useEffect } from 'react';

export interface StaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
  color?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  color?: string;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchAllAssignments(): Promise<StaffAssignment[]> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select(`*, staff_members(id, name, color)`)
    .order('assignment_date', { ascending: true });

  if (error) throw error;

  const { data: blockedData } = await supabase
    .from('staff_availability')
    .select('staff_id, start_date, end_date')
    .in('availability_type', ['blocked', 'unavailable']);

  const isBlocked = (staffId: string, dateStr: string) =>
    (blockedData || []).some(
      b => b.staff_id === staffId && dateStr >= b.start_date && dateStr <= b.end_date
    );

  return (data || [])
    .filter(a => !isBlocked(a.staff_id, a.assignment_date))
    .map(a => ({
      staffId: a.staff_id,
      staffName: (a.staff_members as any)?.name || `Staff ${a.staff_id}`,
      teamId: a.team_id,
      date: a.assignment_date,
      color: (a.staff_members as any)?.color || '#E3F2FD',
    }));
}

async function fetchActiveStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('staff_members')
    .select('id, name, color')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data || []).map(m => ({ id: m.id, name: m.name, color: m.color || '#E3F2FD' }));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useUnifiedStaffOperations = (currentDate: Date, _mode: 'daily' | 'weekly' = 'weekly') => {
  const queryClient = useQueryClient();

  // Assignments — cached indefinitely, invalidated by realtime
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['staff-assignments-all'],
    queryFn: fetchAllAssignments,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Active staff list — rarely changes, cache for 10 minutes
  const { data: activeStaff = [] } = useQuery({
    queryKey: ['staff-members-active'],
    queryFn: fetchActiveStaff,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Realtime: invalidate only when something actually changes in DB
  useEffect(() => {
    const channel = supabase
      .channel('unified-staff-assignments-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_assignments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['staff-assignments-all'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_availability' }, () => {
        queryClient.invalidateQueries({ queryKey: ['staff-assignments-all'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_members' }, () => {
        queryClient.invalidateQueries({ queryKey: ['staff-members-active'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // availableStaff for current date (derived, no extra fetch)
  const availableStaff = useMemo(() => {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const assignedIds = new Set(assignments.filter(a => a.date === dateStr).map(a => a.staffId));
    return activeStaff.filter(s => !assignedIds.has(s.id));
  }, [activeStaff, assignments, currentDate]);

  // Memoized lookup: team + date -> staff members
  const getStaffForTeamAndDate = useMemo(() => {
    const cache = new Map<string, StaffMember[]>();
    return (teamId: string, date: Date): StaffMember[] => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const key = `${teamId}-${dateStr}`;
      if (cache.has(key)) return cache.get(key)!;
      const result = assignments
        .filter(a => a.teamId === teamId && a.date === dateStr)
        .map(a => ({ id: a.staffId, name: a.staffName, color: a.color || '#E3F2FD' }));
      cache.set(key, result);
      return result;
    };
  }, [assignments]);

  // Available staff for a specific date (no extra DB call — derived from cache)
  const getAvailableStaffForDate = useCallback(async (targetDate: Date): Promise<StaffMember[]> => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const assignedIds = new Set(assignments.filter(a => a.date === dateStr).map(a => a.staffId));

    // Fetch availability just for this date (lightweight, date-scoped)
    const { data: avail } = await supabase
      .from('staff_availability')
      .select('staff_id, availability_type')
      .lte('start_date', dateStr)
      .gte('end_date', dateStr);

    const availableIds = new Set<string>();
    const blockedIds = new Set<string>();
    (avail || []).forEach(p => {
      if (p.availability_type === 'available') availableIds.add(p.staff_id);
      else blockedIds.add(p.staff_id);
    });

    return activeStaff
      .filter(s => availableIds.has(s.id) && !blockedIds.has(s.id) && !assignedIds.has(s.id));
  }, [activeStaff, assignments]);

  // Planning date: all staff with assignment status (derived from cache)
  const getStaffForPlanningDate = useCallback(async (targetDate: Date, targetTeamId: string) => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    // Only the availability data needs a DB fetch (date-scoped, small)
    const { data: avail } = await supabase
      .from('staff_availability')
      .select('staff_id, availability_type')
      .in('staff_id', activeStaff.map(s => s.id))
      .lte('start_date', dateStr)
      .gte('end_date', dateStr);

    const availableIds = new Set<string>();
    const blockedIds = new Set<string>();
    (avail || []).forEach(p => {
      if (p.availability_type === 'available') availableIds.add(p.staff_id);
      else blockedIds.add(p.staff_id);
    });

    const assignmentsForDate = assignments.filter(a => a.date === dateStr);
    const assignmentMap = new Map<string, { teamId: string; teamName: string }>();
    assignmentsForDate.forEach(a => {
      let teamName = a.teamId === 'team-11' ? 'Live' : a.teamId.startsWith('team-') ? 'Team ' + a.teamId.replace('team-', '') : a.teamId;
      assignmentMap.set(a.staffId, { teamId: a.teamId, teamName });
    });

    const result = activeStaff
      .filter(s => availableIds.has(s.id) && !blockedIds.has(s.id))
      .map(s => {
        const assignment = assignmentMap.get(s.id);
        const status: 'free' | 'assigned_current_team' | 'assigned_other_team' = !assignment
          ? 'free'
          : assignment.teamId === targetTeamId ? 'assigned_current_team' : 'assigned_other_team';
        return { ...s, assignmentStatus: status, assignedTeamId: assignment?.teamId, assignedTeamName: assignment?.teamName };
      })
      .sort((a, b) => ({ free: 0, assigned_current_team: 1, assigned_other_team: 2 }[a.assignmentStatus] - { free: 0, assigned_current_team: 1, assigned_other_team: 2 }[b.assignmentStatus]));

    return result;
  }, [activeStaff, assignments]);

  // Staff drop with optimistic update
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    if (!staffId) return;

    const effectiveDate = targetDate || currentDate;
    const effectiveDateStr = format(effectiveDate, 'yyyy-MM-dd');
    const staffMember = activeStaff.find(s => s.id === staffId);

    // Optimistic update
    queryClient.setQueryData<StaffAssignment[]>(['staff-assignments-all'], prev => {
      const filtered = (prev || []).filter(a => !(a.staffId === staffId && a.date === effectiveDateStr));
      if (!resourceId) return filtered;
      return [...filtered, {
        staffId,
        staffName: staffMember?.name || `Staff ${staffId}`,
        teamId: resourceId,
        date: effectiveDateStr,
        color: staffMember?.color || '#E3F2FD',
      }];
    });

    try {
      if (resourceId) {
        const { error } = await supabase
          .from('staff_assignments')
          .upsert({ staff_id: staffId, team_id: resourceId, assignment_date: effectiveDateStr }, { onConflict: 'staff_id,assignment_date' });
        if (error) throw error;
        toast.success(`Personal tilldelad`);
      } else {
        const { error } = await supabase
          .from('staff_assignments')
          .delete()
          .eq('staff_id', staffId)
          .eq('assignment_date', effectiveDateStr);
        if (error) throw error;
        toast.success(`Tilldelning borttagen`);
      }
    } catch (error) {
      toast.error((error as any)?.message || 'Kunde inte uppdatera tilldelning');
      // Revert: invalidate to re-fetch fresh data
      queryClient.invalidateQueries({ queryKey: ['staff-assignments-all'] });
    }
  }, [currentDate, activeStaff, queryClient]);

  const forceRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['staff-assignments-all'] });
    queryClient.invalidateQueries({ queryKey: ['staff-members-active'] });
  }, [queryClient]);

  return {
    assignments,
    availableStaff,
    isLoading,
    handleStaffDrop,
    getStaffForTeamAndDate,
    getAvailableStaffForDate,
    getStaffForPlanningDate,
    forceRefresh,
    refreshTrigger: 0,
  };
};

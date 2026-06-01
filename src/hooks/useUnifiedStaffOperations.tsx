import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useEffect } from 'react';
import { assignStaffToTeamCore, removeStaffAssignmentCore } from '@/services/staffAssignmentCore';

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
  tags?: string[];
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchAllAssignments(): Promise<StaffAssignment[]> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select(`*, staff_members(id, name, color)`)
    .order('assignment_date', { ascending: true });

  if (error) throw error;

  // NOTE: vi filtrerar INTE bort assignments baserat på staff_availability-status.
  // Admin har medvetet planerat in personalen och raderna ska visas i kalendern.
  // En frånvarostatus kan markeras visuellt i UI, men en sparad assignment
  // får aldrig döljas i läsvägen — det orsakar att personal försvinner vid refresh.
  return (data || []).map(a => ({
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
    .select('id, name, color, tags')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data || []).map(m => ({ id: m.id, name: m.name, color: m.color || '#E3F2FD', tags: (m as any).tags || [] }));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useUnifiedStaffOperations = (currentDate: Date, _mode: 'daily' | 'weekly' = 'weekly', filterByTag?: string, filterByStaffIds?: string[]) => {
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

  // Filter active staff by tag if specified
  const filteredActiveStaff = useMemo(() => {
    let result = activeStaff;
    if (filterByTag) {
      result = result.filter(s => s.tags?.includes(filterByTag));
    }
    if (filterByStaffIds && filterByStaffIds.length > 0) {
      const idSet = new Set(filterByStaffIds);
      result = result.filter(s => idSet.has(s.id));
    }
    return result;
  }, [activeStaff, filterByTag, filterByStaffIds]);

  // availableStaff for current date — multi-team policy: ALWAYS return every
  // active staff. Even if they're already in one team today, they should be
  // selectable to also join another team. Visual indicator handled by UI.
  const availableStaff = useMemo(() => filteredActiveStaff, [filteredActiveStaff]);

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

    // Multi-team: do NOT exclude staff that already have an assignment.
    // Only block staff that have an explicit availability "blocked"/"unavailable" period.
    const hasAnyRecord = new Set([...availableIds, ...blockedIds]);
    return filteredActiveStaff
      .filter(s => !blockedIds.has(s.id) && (availableIds.has(s.id) || !hasAnyRecord.has(s.id)));
  }, [filteredActiveStaff, assignments]);

  // Planning date: all staff with assignment status (derived from cache)
  const getStaffForPlanningDate = useCallback(async (targetDate: Date, targetTeamId: string) => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    // Only the availability data needs a DB fetch (date-scoped, small)
    const { data: avail } = await supabase
      .from('staff_availability')
      .select('staff_id, availability_type')
      .in('staff_id', filteredActiveStaff.map(s => s.id))
      .lte('start_date', dateStr)
      .gte('end_date', dateStr);

    const availableIds = new Set<string>();
    const blockedIds = new Set<string>();
    (avail || []).forEach(p => {
      if (p.availability_type === 'available') availableIds.add(p.staff_id);
      else blockedIds.add(p.staff_id);
    });

    const assignmentsForDate = assignments.filter(a => a.date === dateStr);
    // Multi-team aware: collect ALL teams a staff member is in for this date.
    const teamsByStaff = new Map<string, Array<{ teamId: string; teamName: string }>>();
    const formatTeamName = (id: string) =>
      id === 'team-11' ? 'Live'
        : id === 'transport' ? 'Lager'
        : id === 'warehouse' ? 'Lager'
        : id.startsWith('team-') ? 'Team ' + id.replace('team-', '')
        : id.startsWith('lager-') ? 'Lager ' + id.replace('lager-', '')
        : id;
    assignmentsForDate.forEach(a => {
      const list = teamsByStaff.get(a.staffId) || [];
      list.push({ teamId: a.teamId, teamName: formatTeamName(a.teamId) });
      teamsByStaff.set(a.staffId, list);
    });

    // Staff with no availability records = available by default
    const hasAnyRecord = new Set([...availableIds, ...blockedIds]);
    const result = filteredActiveStaff
      .filter(s => !blockedIds.has(s.id) && (availableIds.has(s.id) || !hasAnyRecord.has(s.id)))
      .map(s => {
        const teams = teamsByStaff.get(s.id) || [];
        const inCurrentTeam = teams.some(t => t.teamId === targetTeamId);
        const inOtherTeam = teams.some(t => t.teamId !== targetTeamId);
        const status: 'free' | 'assigned_current_team' | 'assigned_other_team' =
          teams.length === 0 ? 'free'
          : inCurrentTeam ? 'assigned_current_team'
          : 'assigned_other_team';
        // Surface the OTHER teams (not the current one) for "Also on …" hint.
        const otherTeams = teams.filter(t => t.teamId !== targetTeamId);
        return {
          ...s,
          assignmentStatus: status,
          assignedTeamId: otherTeams[0]?.teamId,
          assignedTeamName: otherTeams.map(t => t.teamName).join(', ') || undefined,
        };
      })
      .sort((a, b) => ({ free: 0, assigned_current_team: 2, assigned_other_team: 1 }[a.assignmentStatus] - { free: 0, assigned_current_team: 2, assigned_other_team: 1 }[b.assignmentStatus]));

    return result;
  }, [filteredActiveStaff, assignments]);

  // Staff drop with optimistic update.
  // Multi-team: assignment ADDS a team-row (does not replace others).
  // `fromTeamId` (optional): when removing, only that one team-row is cleared
  // so other team memberships on the same day remain intact.
  const handleStaffDrop = useCallback(async (
    staffId: string,
    resourceId: string | null,
    targetDate?: Date,
    fromTeamId?: string,
  ) => {
    if (!staffId) return;

    const effectiveDate = targetDate || currentDate;
    const effectiveDateStr = format(effectiveDate, 'yyyy-MM-dd');
    const staffMember = activeStaff.find(s => s.id === staffId);

    // Optimistic update — add OR remove a single team-row.
    queryClient.setQueryData<StaffAssignment[]>(['staff-assignments-all'], prev => {
      const list = prev || [];
      if (resourceId) {
        // Don't add a duplicate for (staff,team,date)
        if (list.some(a => a.staffId === staffId && a.teamId === resourceId && a.date === effectiveDateStr)) {
          return list;
        }
        return [...list, {
          staffId,
          staffName: staffMember?.name || `Staff ${staffId}`,
          teamId: resourceId,
          date: effectiveDateStr,
          color: staffMember?.color || '#E3F2FD',
        }];
      }
      // Removing
      if (fromTeamId) {
        return list.filter(a => !(a.staffId === staffId && a.date === effectiveDateStr && a.teamId === fromTeamId));
      }
      return list.filter(a => !(a.staffId === staffId && a.date === effectiveDateStr));
    });

    try {
      if (resourceId) {
        await assignStaffToTeamCore(staffId, resourceId, effectiveDate);
        toast.success(`Personal tilldelad`);
        // Bridge into concrete warehouse_assignments when assigned to a lager column.
        try {
          const { syncWarehouseAssignmentsForStaffTeamDay } = await import('@/services/warehouseAssignmentsSync');
          await syncWarehouseAssignmentsForStaffTeamDay({ staffId, teamId: resourceId, date: effectiveDate });
        } catch (e) {
          console.warn('[useUnifiedStaffOperations] warehouse assignment sync failed', e);
        }
      } else {
        await removeStaffAssignmentCore(staffId, effectiveDate, fromTeamId);
        toast.success(`Tilldelning borttagen`);
        try {
          const { removeWarehouseAssignmentsForStaffTeamDay } = await import('@/services/warehouseAssignmentsSync');
          await removeWarehouseAssignmentsForStaffTeamDay({ staffId, teamId: fromTeamId ?? null, date: effectiveDate });
        } catch (e) {
          console.warn('[useUnifiedStaffOperations] warehouse assignment cleanup failed', e);
        }
      }
      // Säkerställ att UI-cachen alltid synkar med DB efter en lyckad write.
      // Realtime-kanalen är backup; vi kan inte förlita oss på den ensam pga
      // race mellan commit och re-fetch (badge kan annars hänga kvar som
      // optimistic och försvinna vid nästa refresh).
      queryClient.invalidateQueries({ queryKey: ['staff-assignments-all'] });
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

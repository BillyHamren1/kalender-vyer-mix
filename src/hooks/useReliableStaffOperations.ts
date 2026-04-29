
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchStaffMembers } from '@/services/staffService';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getUniqueColorForStaff } from '@/utils/uniqueStaffColors';

export interface StaffAssignmentData {
  staffId: string;
  teamId: string;
  date: string;
  staffName: string; // Made required
  color: string; // Made required
}

export interface StaffMemberWithAssignment {
  id: string;
  name: string;
  color: string; // Made required
  assignedTeam?: string | null;
}

// Add interface for compatibility with existing components
export interface StaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
}

export const useReliableStaffOperations = (currentDate: Date) => {
  const [assignments, setAssignments] = useState<StaffAssignmentData[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMemberWithAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const dateStr = format(currentDate, 'yyyy-MM-dd');

  // Fetch all staff members with unique color assignments
  const fetchAllStaff = useCallback(async () => {
    try {
      const staffMembers = await fetchStaffMembers();
      const staffWithAssignments = staffMembers.map(staff => ({
        id: staff.id,
        name: staff.name,
        color: getUniqueColorForStaff(staff.id, staff.color),
        assignedTeam: null
      }));
      setAllStaff(staffWithAssignments);
      return staffWithAssignments;
    } catch (error) {
      console.error('Error fetching staff members:', error);
      return [];
    }
  }, []);

  // Fetch staff assignments for the current date
  const fetchAssignments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select(`
          staff_id,
          team_id,
          assignment_date,
          staff_members (
            name,
            color
          )
        `)
        .eq('assignment_date', dateStr);

      if (error) throw error;

      const assignmentsData = (data || []).map(assignment => {
        const staffName = assignment.staff_members?.name || `Staff ${assignment.staff_id}`;
        const originalColor = assignment.staff_members?.color;
        const uniqueColor = getUniqueColorForStaff(assignment.staff_id, originalColor);
        
        return {
          staffId: assignment.staff_id,
          teamId: assignment.team_id,
          date: assignment.assignment_date,
          staffName,
          color: uniqueColor
        };
      });

      setAssignments(assignmentsData);
      return assignmentsData;
    } catch (error) {
      console.error('Error fetching staff assignments:', error);
      return [];
    }
  }, [dateStr]);

  // Load data on mount and when date/refresh changes
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchAllStaff(),
        fetchAssignments()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, [fetchAllStaff, fetchAssignments, refreshCounter]);

  // Get staff assigned to a specific team with color information
  const getStaffForTeam = useCallback((teamId: string): Array<{id: string, name: string, color: string}> => {
    const teamAssignments = assignments.filter(assignment => assignment.teamId === teamId);
    
    return teamAssignments.map(assignment => ({
      id: assignment.staffId,
      name: assignment.staffName,
      color: assignment.color
    }));
  }, [assignments]);

  // Multi-team: return ALL staff for the date, decorated with which teams
  // they already belong to. Never exclude assigned staff — the same person
  // can join several teams on the same day.
  const getAvailableStaff = useCallback((): Array<StaffMemberWithAssignment & { assignedTeamIds: string[] }> => {
    const teamsByStaff = new Map<string, string[]>();
    for (const a of assignments) {
      const list = teamsByStaff.get(a.staffId) || [];
      list.push(a.teamId);
      teamsByStaff.set(a.staffId, list);
    }
    return allStaff.map(staff => ({
      ...staff,
      assignedTeamIds: teamsByStaff.get(staff.id) || [],
    }));
  }, [allStaff, assignments]);

  // Handle staff drop operations.
  // - targetTeamId set  → assign (multi-team upsert)
  // - targetTeamId null → unassign. If `fromTeamId` is provided, only that
  //   one team-row is removed; otherwise all team rows for the day are
  //   cleared (legacy "fully unassign" behaviour).
  const handleStaffDrop = useCallback(async (
    staffId: string,
    targetTeamId: string | null,
    targetDate?: Date,
    fromTeamId?: string,
  ) => {
    const effectiveDate = targetDate || currentDate;
    const effectiveDateStr = format(effectiveDate, 'yyyy-MM-dd');

    console.log('ReliableStaffOperations: handleStaffDrop', {
      staffId,
      targetTeamId,
      effectiveDateStr,
      fromTeamId,
    });

    try {
      setIsLoading(true);

      if (targetTeamId) {
        // Assign staff to team — multi-team allowed.
        const { error } = await supabase
          .from('staff_assignments')
          .upsert({
            staff_id: staffId,
            team_id: targetTeamId,
            assignment_date: effectiveDateStr
          }, {
            onConflict: 'staff_id,team_id,assignment_date'
          });

        if (error) throw error;

        const staffMember = allStaff.find(s => s.id === staffId);
        toast.success(`${staffMember?.name || 'Staff'} assigned to team`);
      } else {
        // Unassign — scope to one team if `fromTeamId` is provided so other
        // multi-team memberships on the same day are preserved.
        let q = supabase
          .from('staff_assignments')
          .delete()
          .eq('staff_id', staffId)
          .eq('assignment_date', effectiveDateStr);
        if (fromTeamId) q = q.eq('team_id', fromTeamId);

        const { error } = await q;
        if (error) throw error;

        const staffMember = allStaff.find(s => s.id === staffId);
        toast.success(
          fromTeamId
            ? `${staffMember?.name || 'Staff'} removed from team`
            : `${staffMember?.name || 'Staff'} unassigned from team`,
        );
      }

      // Refresh assignments
      await fetchAssignments();
    } catch (error) {
      console.error('Error in handleStaffDrop:', error);
      const errorMessage = (error as any)?.message || 'Failed to update staff assignment';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, allStaff, fetchAssignments]);

  // Force refresh function
  const forceRefresh = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
  }, []);

  // Convert assignments to the format expected by existing components
  const compatibleAssignments = useMemo((): StaffAssignment[] => {
    return assignments.map(assignment => ({
      staffId: assignment.staffId,
      staffName: assignment.staffName || `Staff ${assignment.staffId}`,
      teamId: assignment.teamId,
      date: assignment.date
    }));
  }, [assignments]);

  return {
    assignments,
    allStaff,
    isLoading,
    getStaffForTeam,
    getAvailableStaff,
    handleStaffDrop,
    forceRefresh,
    // Add refreshTrigger for compatibility with MonthlyResourceView
    refreshTrigger: refreshCounter,
    // Add assignments in the format expected by WeeklyResourceView's StaffSelectionDialog
    compatibleAssignments
  };
};

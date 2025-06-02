
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
  staffName: string;
  color: string;
}

export interface StaffMemberWithAssignment {
  id: string;
  name: string;
  color: string;
  assignedTeam?: string | null;
}

export interface StaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
}

// Optimistic assignment interface
interface OptimisticAssignment {
  staffId: string;
  teamId: string | null;
  staffName: string;
  color: string;
  isOptimistic: boolean;
  timestamp: number;
}

export const useReliableStaffOperations = (currentDate: Date) => {
  const [assignments, setAssignments] = useState<StaffAssignmentData[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMemberWithAssignment[]>([]);
  const [optimisticAssignments, setOptimisticAssignments] = useState<OptimisticAssignment[]>([]);
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
      
      // Clear optimistic assignments that now exist in the database
      setOptimisticAssignments(prev => 
        prev.filter(opt => !assignmentsData.some(db => 
          db.staffId === opt.staffId && db.teamId === opt.teamId
        ))
      );
      
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

  // Combine database assignments with optimistic assignments
  const combinedAssignments = useMemo(() => {
    const dbAssignments = assignments.map(a => ({ ...a, isOptimistic: false }));
    const validOptimistic = optimisticAssignments.filter(opt => 
      opt.teamId && !dbAssignments.some(db => 
        db.staffId === opt.staffId && db.teamId === opt.teamId
      )
    );
    
    return [
      ...dbAssignments,
      ...validOptimistic.map(opt => ({
        staffId: opt.staffId,
        teamId: opt.teamId!,
        date: dateStr,
        staffName: opt.staffName,
        color: opt.color,
        isOptimistic: true
      }))
    ];
  }, [assignments, optimisticAssignments, dateStr]);

  // Get staff assigned to a specific team with optimistic updates
  const getStaffForTeam = useCallback((teamId: string): Array<{id: string, name: string, color: string}> => {
    const teamAssignments = combinedAssignments.filter(assignment => assignment.teamId === teamId);
    
    return teamAssignments.map(assignment => ({
      id: assignment.staffId,
      name: assignment.staffName,
      color: assignment.color
    }));
  }, [combinedAssignments]);

  // Get available staff (not assigned to any team) with optimistic updates
  const getAvailableStaff = useCallback((): StaffMemberWithAssignment[] => {
    const assignedStaffIds = new Set(combinedAssignments.map(a => a.staffId));
    
    return allStaff.filter(staff => !assignedStaffIds.has(staff.id));
  }, [allStaff, combinedAssignments]);

  // Add optimistic assignment immediately with force update trigger
  const addOptimisticAssignment = useCallback((staffId: string, teamId: string | null) => {
    const staffMember = allStaff.find(s => s.id === staffId);
    if (!staffMember) return;

    // Remove any existing optimistic assignments for this staff
    setOptimisticAssignments(prev => prev.filter(opt => opt.staffId !== staffId));

    if (teamId) {
      // Add new optimistic assignment
      const newOptimistic: OptimisticAssignment = {
        staffId,
        teamId,
        staffName: staffMember.name,
        color: staffMember.color,
        isOptimistic: true,
        timestamp: Date.now()
      };
      setOptimisticAssignments(prev => [...prev, newOptimistic]);
      console.log('Added optimistic assignment:', newOptimistic);
    }
    
    // Force a small refresh counter increment to trigger re-renders
    setRefreshCounter(prev => prev + 0.1);
  }, [allStaff]);

  // Remove optimistic assignment (for error rollback)
  const removeOptimisticAssignment = useCallback((staffId: string) => {
    setOptimisticAssignments(prev => prev.filter(opt => opt.staffId !== staffId));
    setRefreshCounter(prev => prev + 0.1);
  }, []);

  // Handle staff drop operations with immediate optimistic updates
  const handleStaffDrop = useCallback(async (staffId: string, targetTeamId: string | null, targetDate?: Date) => {
    const effectiveDate = targetDate || currentDate;
    const effectiveDateStr = format(effectiveDate, 'yyyy-MM-dd');
    
    console.log('ReliableStaffOperations: handleStaffDrop', {
      staffId,
      targetTeamId,
      effectiveDateStr
    });

    // Add optimistic assignment immediately for instant visual feedback
    addOptimisticAssignment(staffId, targetTeamId);

    try {
      setIsLoading(true);

      if (targetTeamId) {
        // Assign staff to team
        const { error } = await supabase
          .from('staff_assignments')
          .upsert({
            staff_id: staffId,
            team_id: targetTeamId,
            assignment_date: effectiveDateStr
          }, {
            onConflict: 'staff_id,assignment_date'
          });

        if (error) throw error;

        const staffMember = allStaff.find(s => s.id === staffId);
        toast.success(`${staffMember?.name || 'Staff'} assigned to team`);
      } else {
        // Remove staff assignment
        const { error } = await supabase
          .from('staff_assignments')
          .delete()
          .eq('staff_id', staffId)
          .eq('assignment_date', effectiveDateStr);

        if (error) throw error;

        const staffMember = allStaff.find(s => s.id === staffId);
        toast.success(`${staffMember?.name || 'Staff'} unassigned from team`);
      }

      // Immediate refresh to sync with database - no delay
      await fetchAssignments();
      
    } catch (error) {
      console.error('Error in handleStaffDrop:', error);
      
      // Rollback optimistic assignment on error
      removeOptimisticAssignment(staffId);
      
      toast.error('Failed to update staff assignment');
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, allStaff, fetchAssignments, addOptimisticAssignment, removeOptimisticAssignment]);

  // Force refresh function
  const forceRefresh = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
    // Clear optimistic assignments on manual refresh
    setOptimisticAssignments([]);
  }, []);

  // Convert assignments to the format expected by existing components
  const compatibleAssignments = useMemo((): StaffAssignment[] => {
    return combinedAssignments.map(assignment => ({
      staffId: assignment.staffId,
      staffName: assignment.staffName || `Staff ${assignment.staffId}`,
      teamId: assignment.teamId,
      date: assignment.date
    }));
  }, [combinedAssignments]);

  return {
    assignments: combinedAssignments,
    allStaff,
    isLoading,
    getStaffForTeam,
    getAvailableStaff,
    handleStaffDrop,
    forceRefresh,
    refreshTrigger: refreshCounter,
    compatibleAssignments
  };
};


import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { assignStaffToTeam, removeStaffAssignment, fetchStaffAssignments } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface StaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
}

export const useReliableStaffOperations = (currentDate: Date) => {
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const dateStr = format(currentDate, 'yyyy-MM-dd');

  // Fetch assignments from database
  const fetchAssignments = useCallback(async () => {
    try {
      console.log('Fetching staff assignments for date:', dateStr);
      const data = await fetchStaffAssignments(currentDate);
      
      const formattedAssignments = data.map(assignment => ({
        staffId: assignment.staff_id,
        staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
        teamId: assignment.team_id,
        date: dateStr
      }));
      
      console.log('Fetched assignments:', formattedAssignments);
      setAssignments(formattedAssignments);
    } catch (error) {
      console.error('Error fetching staff assignments:', error);
      toast.error('Failed to load staff assignments');
    }
  }, [currentDate, dateStr]);

  // Initial load
  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments, refreshTrigger]);

  // Real-time subscription to staff_assignments table
  useEffect(() => {
    console.log('Setting up real-time subscription for staff assignments');
    
    const channel = supabase
      .channel('staff-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments',
          filter: `assignment_date=eq.${dateStr}`
        },
        (payload) => {
          console.log('Real-time staff assignment change:', payload);
          // Refresh assignments when any change occurs
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [dateStr, fetchAssignments]);

  // Handle staff assignment with proper error handling and rollback
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    if (!staffId) {
      // Just trigger refresh
      setRefreshTrigger(prev => prev + 1);
      return;
    }

    console.log(`Assigning staff ${staffId} to ${resourceId || 'unassigned'} for ${dateStr}`);
    
    // Store current state for rollback
    const previousAssignments = [...assignments];
    
    // Optimistic update
    if (resourceId) {
      // Find staff name from existing assignments or use ID
      const existingAssignment = assignments.find(a => a.staffId === staffId);
      const staffName = existingAssignment?.staffName || `Staff ${staffId}`;
      
      setAssignments(prev => {
        // Remove any existing assignment for this staff
        const filtered = prev.filter(a => a.staffId !== staffId);
        // Add new assignment
        return [...filtered, {
          staffId,
          staffName,
          teamId: resourceId,
          date: dateStr
        }];
      });
    } else {
      // Remove assignment
      setAssignments(prev => prev.filter(a => a.staffId !== staffId));
    }

    setIsLoading(true);
    
    try {
      if (resourceId) {
        await assignStaffToTeam(staffId, resourceId, currentDate);
        toast.success('Staff assigned successfully');
      } else {
        await removeStaffAssignment(staffId, currentDate);
        toast.success('Staff removed successfully');
      }
      
      // Fetch fresh data to ensure consistency
      await fetchAssignments();
    } catch (error) {
      console.error('Error in staff operation:', error);
      
      // Rollback optimistic update
      setAssignments(previousAssignments);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to update staff assignment: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [assignments, currentDate, dateStr, fetchAssignments]);

  // Get staff for a specific team
  const getStaffForTeam = useCallback((teamId: string) => {
    const teamStaff = assignments
      .filter(a => a.teamId === teamId)
      .map(a => ({
        id: a.staffId,
        name: a.staffName
      }));
    
    console.log(`Getting staff for team ${teamId}:`, teamStaff);
    return teamStaff;
  }, [assignments]);

  // Force refresh
  const forceRefresh = useCallback(() => {
    console.log('Force refreshing staff assignments');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    assignments,
    isLoading,
    handleStaffDrop,
    getStaffForTeam,
    forceRefresh,
    refreshTrigger
  };
};

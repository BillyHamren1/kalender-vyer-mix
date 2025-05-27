
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { unifiedStaffService } from '@/services/unifiedStaffService';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface StaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
}

export const useUnifiedStaffOperations = (currentDate: Date) => {
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const dateStr = format(currentDate, 'yyyy-MM-dd');

  // Fetch assignments using unified service
  const fetchAssignments = useCallback(async () => {
    try {
      console.log('Unified Staff Operations: Fetching assignments for date:', dateStr);
      const data = await unifiedStaffService.getStaffAssignments(currentDate);
      
      const formattedAssignments = data.map(assignment => ({
        staffId: assignment.staff_id,
        staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
        teamId: assignment.team_id,
        date: dateStr
      }));
      
      console.log('Unified Staff Operations: Fetched assignments:', formattedAssignments);
      setAssignments(formattedAssignments);
    } catch (error) {
      console.error('Error fetching staff assignments:', error);
      toast.error('Failed to load staff assignments');
    }
  }, [currentDate, dateStr]);

  // Initial load and refresh trigger
  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments, refreshTrigger]);

  // Real-time subscription
  useEffect(() => {
    console.log('Unified Staff Operations: Setting up real-time subscription');
    
    const channel = supabase
      .channel('unified-staff-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments',
          filter: `assignment_date=eq.${dateStr}`
        },
        (payload) => {
          console.log('Unified Staff Operations: Real-time change:', payload);
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      console.log('Unified Staff Operations: Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [dateStr, fetchAssignments]);

  // Handle staff assignment with optimistic updates
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    if (!staffId) {
      setRefreshTrigger(prev => prev + 1);
      return;
    }

    console.log(`Unified Staff Operations: Handling staff drop: ${staffId} to ${resourceId || 'unassigned'} for ${dateStr}`);
    
    // Store current state for rollback
    const previousAssignments = [...assignments];
    
    // Optimistic update
    if (resourceId) {
      const existingAssignment = assignments.find(a => a.staffId === staffId);
      const staffName = existingAssignment?.staffName || `Staff ${staffId}`;
      
      setAssignments(prev => {
        const filtered = prev.filter(a => a.staffId !== staffId);
        return [...filtered, {
          staffId,
          staffName,
          teamId: resourceId,
          date: dateStr
        }];
      });
    } else {
      setAssignments(prev => prev.filter(a => a.staffId !== staffId));
    }

    setIsLoading(true);
    
    try {
      if (resourceId) {
        await unifiedStaffService.assignStaffToTeam(staffId, resourceId, currentDate);
        console.log('Unified Staff Operations: Staff assigned successfully');
        toast.success('Staff assigned to team');
      } else {
        await unifiedStaffService.removeStaffAssignment(staffId, currentDate);
        console.log('Unified Staff Operations: Staff assignment removed successfully');
        toast.success('Staff assignment removed');
      }
      
    } catch (error) {
      console.error('Unified Staff Operations: Error in staff operation:', error);
      
      // Rollback optimistic update
      setAssignments(previousAssignments);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to update staff assignment: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [assignments, currentDate, dateStr]);

  // Get staff for a specific team
  const getStaffForTeam = useCallback((teamId: string) => {
    const teamStaff = assignments
      .filter(a => a.teamId === teamId)
      .map(a => ({
        id: a.staffId,
        name: a.staffName
      }));
    
    console.log(`Unified Staff Operations: Getting staff for team ${teamId}:`, teamStaff);
    return teamStaff;
  }, [assignments]);

  // Force refresh
  const forceRefresh = useCallback(() => {
    console.log('Unified Staff Operations: Force refreshing assignments');
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

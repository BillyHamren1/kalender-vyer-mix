import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStaffAssignmentDebugger } from './useStaffAssignmentDebugger';
import { format, addDays, startOfWeek } from 'date-fns';

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

export const useWeeklyStaffOperations = (currentWeekStart: Date) => {
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const {
    verifyAssignmentInDatabase,
    createAssignmentDirectly,
    removeAssignmentDirectly,
    getAllAssignmentsForDate,
    addDebugLog
  } = useStaffAssignmentDebugger();

  // Generate all days in the current week
  const getWeekDates = useCallback(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      return date;
    });
  }, [currentWeekStart]);

  // Fetch assignments for the entire week
  const fetchWeekAssignments = useCallback(async () => {
    try {
      setIsLoading(true);
      const weekDates = getWeekDates();
      const allAssignments: StaffAssignment[] = [];
      
      console.log(`🔄 Fetching weekly assignments for ${weekDates.length} days`);
      
      for (const date of weekDates) {
        const result = await getAllAssignmentsForDate(date);
        
        if (result.success) {
          const formattedAssignments = result.assignments.map(assignment => ({
            staffId: assignment.staff_id,
            staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
            teamId: assignment.team_id,
            date: format(date, 'yyyy-MM-dd'),
            color: assignment.staff_members?.color
          }));
          
          allAssignments.push(...formattedAssignments);
        }
      }
      
      console.log(`✅ Fetched ${allAssignments.length} assignments for the week:`, allAssignments);
      setAssignments(allAssignments);
      
    } catch (error) {
      console.error('Error in fetchWeekAssignments:', error);
      toast.error('Failed to load staff assignments');
    } finally {
      setIsLoading(false);
    }
  }, [currentWeekStart, getAllAssignmentsForDate, getWeekDates]);

  // Fetch available staff
  const fetchAvailableStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, color')
        .order('name');

      if (error) {
        console.error('Error fetching available staff:', error);
        return;
      }

      const staff = (data || []).map(member => ({
        id: member.id,
        name: member.name,
        color: member.color || '#E3F2FD'
      }));

      console.log(`📋 Fetched ${staff.length} available staff members`);
      setAvailableStaff(staff);
    } catch (error) {
      console.error('Error fetching available staff:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchWeekAssignments();
    fetchAvailableStaff();
  }, [fetchWeekAssignments, fetchAvailableStaff, refreshTrigger]);

  // Real-time subscription for the entire week
  useEffect(() => {
    const weekDates = getWeekDates();
    const startDate = format(weekDates[0], 'yyyy-MM-dd');
    const endDate = format(weekDates[6], 'yyyy-MM-dd');
    
    console.log(`🔔 Setting up weekly real-time subscription from ${startDate} to ${endDate}`);
    
    const channel = supabase
      .channel('weekly-staff-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments',
          filter: `assignment_date.gte.${startDate},assignment_date.lte.${endDate}`
        },
        (payload) => {
          console.log(`🔔 Weekly real-time change: ${payload.eventType}`);
          
          // Fix TypeScript error by properly typing the payload
          const staffId = (payload.new as any)?.staff_id || (payload.old as any)?.staff_id || 'unknown';
          
          addDebugLog({
            operation: 'weekly_realtime_change',
            staffId,
            date: startDate,
            success: true,
            dbResult: payload
          });
          // Refresh assignments when any change occurs in the week
          fetchWeekAssignments();
        }
      )
      .subscribe();

    return () => {
      console.log('🔔 Cleaning up weekly real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [currentWeekStart, fetchWeekAssignments, addDebugLog, getWeekDates]);

  // Enhanced staff drop handler with optimistic updates
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    if (!staffId) {
      console.warn('No staffId provided to handleStaffDrop');
      return;
    }

    const effectiveDate = targetDate || currentWeekStart;
    const effectiveDateStr = format(effectiveDate, 'yyyy-MM-dd');

    console.log(`🎯 Weekly staff drop: ${staffId} to ${resourceId || 'unassigned'} on ${effectiveDateStr}`);
    
    // Get staff color for optimistic update
    const staffMember = availableStaff.find(s => s.id === staffId);
    const staffColor = staffMember?.color;
    
    // Optimistic update - immediately update UI
    setAssignments(prevAssignments => {
      // Remove any existing assignment for this staff on this date
      const filteredAssignments = prevAssignments.filter(
        a => !(a.staffId === staffId && a.date === effectiveDateStr)
      );
      
      // If assigning to a team, add the new assignment
      if (resourceId) {
        const newAssignment: StaffAssignment = {
          staffId,
          staffName: staffMember?.name || `Staff ${staffId}`,
          teamId: resourceId,
          date: effectiveDateStr,
          color: staffColor
        };
        return [...filteredAssignments, newAssignment];
      }
      
      return filteredAssignments;
    });
    
    setIsLoading(true);
    
    try {
      let result;
      
      if (resourceId) {
        // Assign staff to team
        result = await createAssignmentDirectly(staffId, resourceId, effectiveDate);
      } else {
        // Remove assignment
        result = await removeAssignmentDirectly(staffId, effectiveDate);
      }
      
      if (!result.success) {
        console.error('Staff operation failed:', result.error);
        // Revert optimistic update on failure
        fetchWeekAssignments();
        return;
      }
      
      // Verify the operation was successful
      setTimeout(async () => {
        if (resourceId) {
          const verification = await verifyAssignmentInDatabase(staffId, effectiveDate, resourceId);
          if (!verification.exists) {
            console.error('⚠️ Assignment verification failed - not found in database');
            toast.error('Assignment may not have been saved properly');
            // Refresh to show actual database state
            fetchWeekAssignments();
          } else {
            console.log('✅ Assignment verified in database');
          }
        } else {
          toast.success(`Staff assignment removed successfully`);
        }
      }, 500);
      
    } catch (error) {
      console.error('Error in weekly staff drop:', error);
      toast.error('Failed to update staff assignment');
      // Revert optimistic update on error
      fetchWeekAssignments();
    } finally {
      setIsLoading(false);
    }
  }, [currentWeekStart, createAssignmentDirectly, removeAssignmentDirectly, verifyAssignmentInDatabase, fetchWeekAssignments, availableStaff]);

  // Get staff for a specific team and date with color information
  const getStaffForTeamAndDate = useCallback((teamId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const teamStaff = assignments
      .filter(a => a.teamId === teamId && a.date === dateStr)
      .map(a => {
        // Get color from assignment or fall back to available staff color
        const availableStaffMember = availableStaff.find(s => s.id === a.staffId);
        return {
          id: a.staffId,
          name: a.staffName,
          color: a.color || availableStaffMember?.color || '#E3F2FD'
        };
      });
    
    return teamStaff;
  }, [assignments, availableStaff]);

  // Get available staff (not assigned to any team on any day of the week)
  const getAvailableStaffForWeek = useCallback(() => {
    const assignedStaffIds = new Set(assignments.map(a => a.staffId));
    return availableStaff.filter(staff => !assignedStaffIds.has(staff.id));
  }, [assignments, availableStaff]);

  // NEW: Get available staff for a specific date
  const getAvailableStaffForDate = useCallback((targetDate: Date) => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const assignedStaffIdsForDate = new Set(
      assignments
        .filter(a => a.date === dateStr)
        .map(a => a.staffId)
    );
    
    return availableStaff.filter(staff => !assignedStaffIdsForDate.has(staff.id));
  }, [assignments, availableStaff]);

  // Force refresh
  const forceRefresh = useCallback(() => {
    console.log('🔄 Force refreshing weekly assignments');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    assignments,
    availableStaff,
    isLoading,
    handleStaffDrop,
    getStaffForTeamAndDate,
    getAvailableStaffForWeek,
    getAvailableStaffForDate, // NEW: Export the new function
    forceRefresh,
    refreshTrigger
  };
};

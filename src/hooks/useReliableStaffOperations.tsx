import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStaffAssignmentDebugger } from './useStaffAssignmentDebugger';
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
  
  const {
    verifyAssignmentInDatabase,
    createAssignmentDirectly,
    removeAssignmentDirectly,
    getAllAssignmentsForDate,
    addDebugLog
  } = useStaffAssignmentDebugger();

  const dateStr = format(currentDate, 'yyyy-MM-dd');

  // Fetch assignments directly from database
  const fetchAssignments = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log(`🔄 Fetching assignments for ${dateStr} (reliable)`);
      
      const result = await getAllAssignmentsForDate(currentDate);
      
      if (!result.success) {
        console.error('Failed to fetch assignments:', result.error);
        toast.error('Failed to load staff assignments');
        return;
      }
      
      const formattedAssignments = result.assignments.map(assignment => ({
        staffId: assignment.staff_id,
        staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
        teamId: assignment.team_id,
        date: dateStr
      }));
      
      console.log(`✅ Fetched ${formattedAssignments.length} assignments from database:`, formattedAssignments);
      setAssignments(formattedAssignments);
      
    } catch (error) {
      console.error('Error in fetchAssignments:', error);
      toast.error('Failed to load staff assignments');
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, dateStr, getAllAssignmentsForDate]);

  // Initial load and refresh trigger
  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments, refreshTrigger]);

  // Real-time subscription
  useEffect(() => {
    console.log('🔔 Setting up real-time subscription (reliable)');
    
    const channel = supabase
      .channel('reliable-staff-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments',
          filter: `assignment_date=eq.${dateStr}`
        },
        (payload) => {
          // Type-safe payload handling
          const getStaffIdFromPayload = (payload: any): string => {
            if (payload.new && typeof payload.new === 'object' && payload.new.staff_id) {
              return payload.new.staff_id;
            }
            if (payload.old && typeof payload.old === 'object' && payload.old.staff_id) {
              return payload.old.staff_id;
            }
            return 'unknown';
          };
          
          const staffIdFromPayload = getStaffIdFromPayload(payload);
          console.log(`🔔 Real-time change: ${payload.eventType} for staff ${staffIdFromPayload}`);
          addDebugLog({
            operation: 'realtime_change',
            staffId: staffIdFromPayload,
            date: dateStr,
            success: true,
            dbResult: payload
          });
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      console.log('🔔 Cleaning up real-time subscription (reliable)');
      supabase.removeChannel(channel);
    };
  }, [dateStr, fetchAssignments, addDebugLog]);

  // Reliable staff drop handler with proper conflict handling
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    if (!staffId) {
      console.warn('No staffId provided to handleStaffDrop');
      return;
    }

    console.log(`🎯 Reliable staff drop: ${staffId} to ${resourceId || 'unassigned'} on ${dateStr}`);
    
    setIsLoading(true);
    
    try {
      let result;
      
      if (resourceId) {
        // Assign staff to team - this will now properly check for conflicts
        result = await createAssignmentDirectly(staffId, resourceId, currentDate);
      } else {
        // Remove assignment
        result = await removeAssignmentDirectly(staffId, currentDate);
      }
      
      if (!result.success) {
        console.error('Staff operation failed:', result.error);
        // Error message is already shown by the createAssignmentDirectly function
        return;
      }
      
      // Verify the operation was successful
      setTimeout(async () => {
        if (resourceId) {
          const verification = await verifyAssignmentInDatabase(staffId, currentDate, resourceId);
          if (!verification.exists) {
            console.error('⚠️ Assignment verification failed - not found in database');
            toast.error('Assignment may not have been saved properly');
          } else {
            console.log('✅ Assignment verified in database');
            toast.success(`Staff assigned successfully`);
          }
        } else {
          toast.success(`Staff assignment removed successfully`);
        }
        
        // Refresh to show actual database state
        fetchAssignments();
      }, 500);
      
    } catch (error) {
      console.error('Error in reliable staff drop:', error);
      toast.error('Failed to update staff assignment');
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, dateStr, createAssignmentDirectly, removeAssignmentDirectly, verifyAssignmentInDatabase, fetchAssignments]);

  // Get staff for a specific team
  const getStaffForTeam = useCallback((teamId: string) => {
    const teamStaff = assignments
      .filter(a => a.teamId === teamId)
      .map(a => ({
        id: a.staffId,
        name: a.staffName
      }));
    
    console.log(`📋 Getting staff for team ${teamId}: ${teamStaff.length} members`, teamStaff);
    return teamStaff;
  }, [assignments]);

  // Force refresh
  const forceRefresh = useCallback(() => {
    console.log('🔄 Force refreshing assignments (reliable)');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    assignments,
    isLoading,
    handleStaffDrop,
    getStaffForTeam,
    forceRefresh,
    refreshTrigger,
    verifyAssignmentInDatabase,
    createAssignmentDirectly,
    removeAssignmentDirectly
  };
};

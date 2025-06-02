
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { unifiedStaffService } from '@/services/unifiedStaffService';
import { useStaffBookingConnection } from './useStaffBookingConnection';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface StaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
}

interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: {
    staff_id?: string;
    [key: string]: any;
  };
  old?: {
    staff_id?: string;
    [key: string]: any;
  };
}

export const useEnhancedStaffOperations = (currentDate: Date) => {
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [operationLogs, setOperationLogs] = useState<string[]>([]);

  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const { 
    validateConnections, 
    assignStaffWithValidation, 
    removeStaffWithValidation 
  } = useStaffBookingConnection();

  // Add operation log
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setOperationLogs(prev => [...prev.slice(-9), logMessage]); // Keep last 10 logs
  }, []);

  // Enhanced fetch with validation
  const fetchAssignments = useCallback(async () => {
    try {
      addLog(`Fetching staff assignments for ${dateStr}`);
      const data = await unifiedStaffService.getStaffAssignments(currentDate);
      
      const formattedAssignments = data.map(assignment => ({
        staffId: assignment.staff_id,
        staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
        teamId: assignment.team_id,
        date: dateStr
      }));
      
      addLog(`Fetched ${formattedAssignments.length} assignments`);
      setAssignments(formattedAssignments);
      
      // Validate connections after fetch
      setTimeout(() => {
        validateConnections(currentDate);
      }, 500);
      
    } catch (error) {
      addLog(`Error fetching assignments: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast.error('Failed to load staff assignments');
    }
  }, [currentDate, dateStr, addLog, validateConnections]);

  // Initial load and refresh trigger
  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments, refreshTrigger]);

  // Enhanced real-time subscription with logging
  useEffect(() => {
    addLog('Setting up real-time subscription');
    
    const channel = supabase
      .channel('enhanced-staff-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments',
          filter: `assignment_date=eq.${dateStr}`
        },
        (payload: RealtimePayload) => {
          const staffId = payload.new?.staff_id || payload.old?.staff_id || 'unknown';
          addLog(`Real-time change detected: ${payload.eventType} for staff ${staffId}`);
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      addLog('Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [dateStr, fetchAssignments, addLog]);

  // Enhanced staff drop with validation and conflict resolution
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    if (!staffId) {
      setRefreshTrigger(prev => prev + 1);
      return;
    }

    addLog(`Handling staff drop: ${staffId} to ${resourceId || 'unassigned'}`);
    
    // Store current state for rollback
    const previousAssignments = [...assignments];
    
    // Optimistic update with logging
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
      
      addLog(`Optimistic update: Assigned ${staffName} to ${resourceId}`);
    } else {
      setAssignments(prev => prev.filter(a => a.staffId !== staffId));
      addLog(`Optimistic update: Removed ${staffId} assignment`);
    }

    setIsLoading(true);
    
    try {
      let success = false;
      
      if (resourceId) {
        success = await assignStaffWithValidation(staffId, resourceId, currentDate);
      } else {
        success = await removeStaffWithValidation(staffId, currentDate);
      }
      
      if (success) {
        addLog(`Operation completed successfully`);
      } else {
        addLog(`Operation failed, rolling back`);
        setAssignments(previousAssignments);
      }
      
    } catch (error) {
      addLog(`Operation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Rollback optimistic update
      setAssignments(previousAssignments);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to update staff assignment: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [assignments, currentDate, dateStr, addLog, assignStaffWithValidation, removeStaffWithValidation]);

  // Get staff for a specific team - FIXED: Removed addLog to prevent infinite re-renders
  const getStaffForTeam = useCallback((teamId: string) => {
    const teamStaff = assignments
      .filter(a => a.teamId === teamId)
      .map(a => ({
        id: a.staffId,
        name: a.staffName
      }));
    
    // Removed addLog call that was causing infinite re-renders
    return teamStaff;
  }, [assignments]);

  // Force refresh with validation
  const forceRefresh = useCallback(() => {
    addLog('Force refreshing assignments');
    setRefreshTrigger(prev => prev + 1);
  }, [addLog]);

  // Get operation logs
  const getOperationLogs = useCallback(() => {
    return operationLogs;
  }, [operationLogs]);

  return {
    assignments,
    isLoading,
    handleStaffDrop,
    getStaffForTeam,
    forceRefresh,
    refreshTrigger,
    getOperationLogs,
    validateConnections: () => validateConnections(currentDate)
  };
};

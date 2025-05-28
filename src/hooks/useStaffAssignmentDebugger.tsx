
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface AssignmentDebugLog {
  timestamp: string;
  operation: string;
  staffId: string;
  teamId?: string;
  date: string;
  success: boolean;
  error?: string;
  dbResult?: any;
}

export const useStaffAssignmentDebugger = () => {
  const [debugLogs, setDebugLogs] = useState<AssignmentDebugLog[]>([]);

  const addDebugLog = useCallback((log: Omit<AssignmentDebugLog, 'timestamp'>) => {
    const newLog = {
      ...log,
      timestamp: new Date().toISOString()
    };
    setDebugLogs(prev => [...prev.slice(-19), newLog]); // Keep last 20 logs
    console.log('🔍 Staff Assignment Debug:', newLog);
  }, []);

  const verifyAssignmentInDatabase = useCallback(async (staffId: string, date: Date, teamId?: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      console.log(`🔍 Verifying assignment in DB: Staff ${staffId}, Date ${dateStr}, Team ${teamId || 'any'}`);
      
      let query = supabase
        .from('staff_assignments')
        .select('*')
        .eq('staff_id', staffId)
        .eq('assignment_date', dateStr);
      
      if (teamId) {
        query = query.eq('team_id', teamId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        addDebugLog({
          operation: 'verify_assignment',
          staffId,
          teamId,
          date: dateStr,
          success: false,
          error: error.message
        });
        return { exists: false, error: error.message };
      }
      
      const exists = data && data.length > 0;
      addDebugLog({
        operation: 'verify_assignment',
        staffId,
        teamId,
        date: dateStr,
        success: true,
        dbResult: { exists, count: data?.length || 0, assignments: data }
      });
      
      return { exists, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog({
        operation: 'verify_assignment',
        staffId,
        teamId,
        date: dateStr,
        success: false,
        error: errorMessage
      });
      return { exists: false, error: errorMessage };
    }
  }, [addDebugLog]);

  const createAssignmentDirectly = useCallback(async (staffId: string, teamId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      console.log(`🔧 Creating assignment directly: Staff ${staffId} → Team ${teamId} on ${dateStr}`);
      
      const { data, error } = await supabase
        .from('staff_assignments')
        .upsert({
          staff_id: staffId,
          team_id: teamId,
          assignment_date: dateStr
        }, {
          onConflict: 'staff_id,assignment_date'
        })
        .select();
      
      if (error) {
        addDebugLog({
          operation: 'create_assignment_direct',
          staffId,
          teamId,
          date: dateStr,
          success: false,
          error: error.message
        });
        toast.error(`Failed to create assignment: ${error.message}`);
        return { success: false, error: error.message };
      }
      
      addDebugLog({
        operation: 'create_assignment_direct',
        staffId,
        teamId,
        date: dateStr,
        success: true,
        dbResult: data
      });
      
      toast.success(`Assignment created: ${staffId} → ${teamId}`);
      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog({
        operation: 'create_assignment_direct',
        staffId,
        teamId,
        date: dateStr,
        success: false,
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }, [addDebugLog]);

  const removeAssignmentDirectly = useCallback(async (staffId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      console.log(`🗑️ Removing assignment directly: Staff ${staffId} on ${dateStr}`);
      
      const { error } = await supabase
        .from('staff_assignments')
        .delete()
        .eq('staff_id', staffId)
        .eq('assignment_date', dateStr);
      
      if (error) {
        addDebugLog({
          operation: 'remove_assignment_direct',
          staffId,
          date: dateStr,
          success: false,
          error: error.message
        });
        toast.error(`Failed to remove assignment: ${error.message}`);
        return { success: false, error: error.message };
      }
      
      addDebugLog({
        operation: 'remove_assignment_direct',
        staffId,
        date: dateStr,
        success: true
      });
      
      toast.success(`Assignment removed: ${staffId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog({
        operation: 'remove_assignment_direct',
        staffId,
        date: dateStr,
        success: false,
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  }, [addDebugLog]);

  const getAllAssignmentsForDate = useCallback(async (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      console.log(`📋 Getting all assignments for ${dateStr}`);
      
      const { data, error } = await supabase
        .from('staff_assignments')
        .select(`
          *,
          staff_members (
            id,
            name,
            email,
            phone
          )
        `)
        .eq('assignment_date', dateStr);
      
      if (error) {
        addDebugLog({
          operation: 'get_all_assignments',
          staffId: 'all',
          date: dateStr,
          success: false,
          error: error.message
        });
        return { success: false, error: error.message, assignments: [] };
      }
      
      addDebugLog({
        operation: 'get_all_assignments',
        staffId: 'all',
        date: dateStr,
        success: true,
        dbResult: { count: data?.length || 0, assignments: data }
      });
      
      return { success: true, assignments: data || [] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog({
        operation: 'get_all_assignments',
        staffId: 'all',
        date: dateStr,
        success: false,
        error: errorMessage
      });
      return { success: false, error: errorMessage, assignments: [] };
    }
  }, [addDebugLog]);

  return {
    debugLogs,
    addDebugLog,
    verifyAssignmentInDatabase,
    createAssignmentDirectly,
    removeAssignmentDirectly,
    getAllAssignmentsForDate
  };
};

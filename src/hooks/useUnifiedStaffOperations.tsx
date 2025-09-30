
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, addDays } from 'date-fns';
import { normalizeToDbId, toFrontendTeamId } from '@/utils/teamIdMapping';

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

export const useUnifiedStaffOperations = (currentDate: Date, mode: 'daily' | 'weekly' = 'weekly') => {
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Get the date range based on mode
  const getDateRange = useCallback(() => {
    if (mode === 'daily') {
      return [currentDate];
    } else {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
  }, [currentDate, mode]);

  // Fetch assignments for the date range
  const fetchAssignments = useCallback(async () => {
    try {
      setIsLoading(true);
      const dates = getDateRange();
      const allAssignments: StaffAssignment[] = [];
      
      console.log(`🔄 Fetching ${mode} assignments for ${dates.length} days`);
      
      for (const date of dates) {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        const { data, error } = await supabase
          .from('staff_assignments')
          .select(`
            *,
            staff_members (
              id,
              name,
              color
            )
          `)
          .eq('assignment_date', dateStr)
          .order('created_at', { ascending: true });

        if (error) {
          console.error(`Error fetching assignments for ${dateStr}:`, error);
          continue;
        }

        if (data) {
          const formattedAssignments = data.map(assignment => ({
            staffId: assignment.staff_id,
            staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
            teamId: toFrontendTeamId(assignment.team_id), // Convert DB format to frontend format
            date: dateStr,
            color: assignment.staff_members?.color || '#E3F2FD'
          }));
          
          allAssignments.push(...formattedAssignments);
        }
      }
      
      console.log(`✅ Fetched ${allAssignments.length} assignments`);
      setAssignments(allAssignments);
      
    } catch (error) {
      console.error('Error in fetchAssignments:', error);
      toast.error('Failed to load staff assignments');
    } finally {
      setIsLoading(false);
    }
  }, [getDateRange, mode]);

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
    fetchAssignments();
    fetchAvailableStaff();
  }, [fetchAssignments, fetchAvailableStaff, refreshTrigger]);

  // Real-time subscription
  useEffect(() => {
    const dates = getDateRange();
    const startDate = format(dates[0], 'yyyy-MM-dd');
    const endDate = format(dates[dates.length - 1], 'yyyy-MM-dd');
    
    console.log(`🔔 Setting up real-time subscription from ${startDate} to ${endDate}`);
    
    const channel = supabase
      .channel('unified-staff-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments',
          filter: `assignment_date.gte.${startDate},assignment_date.lte.${endDate}`
        },
        (payload) => {
          console.log(`🔔 Real-time change: ${payload.eventType}`);
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      console.log('🔔 Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [getDateRange, fetchAssignments]);

  // Handle staff drop operations
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    if (!staffId) {
      console.warn('No staffId provided to handleStaffDrop');
      return;
    }

    const effectiveDate = targetDate || currentDate;
    const effectiveDateStr = format(effectiveDate, 'yyyy-MM-dd');

    // Convert frontend team ID to database team ID
    const dbTeamId = resourceId ? normalizeToDbId(resourceId) : null;
    
    console.log(`🎯 Staff drop: ${staffId} to ${resourceId || 'unassigned'} (DB: ${dbTeamId || 'null'}) on ${effectiveDateStr}`);
    
    // Get staff info for optimistic update
    const staffMember = availableStaff.find(s => s.id === staffId);
    
    // Optimistic update (use frontend ID for local state)
    setAssignments(prevAssignments => {
      const filteredAssignments = prevAssignments.filter(
        a => !(a.staffId === staffId && a.date === effectiveDateStr)
      );
      
      if (resourceId) {
        const newAssignment: StaffAssignment = {
          staffId,
          staffName: staffMember?.name || `Staff ${staffId}`,
          teamId: resourceId, // Keep frontend format for display
          date: effectiveDateStr,
          color: staffMember?.color || '#E3F2FD'
        };
        return [...filteredAssignments, newAssignment];
      }
      
      return filteredAssignments;
    });
    
    setIsLoading(true);
    
    try {
      if (dbTeamId) {
        // Assign staff to team (use database format)
        console.log(`💾 Saving to DB: staff_id=${staffId}, team_id=${dbTeamId}, date=${effectiveDateStr}`);
        
        const { data, error } = await supabase
          .from('staff_assignments')
          .upsert({
            staff_id: staffId,
            team_id: dbTeamId, // Use database format
            assignment_date: effectiveDateStr
          }, {
            onConflict: 'staff_id,assignment_date'
          })
          .select();

        if (error) {
          console.error('❌ Database error:', error);
          throw error;
        }
        
        console.log('✅ Saved to database:', data);
        toast.success(`Staff assigned to ${resourceId} successfully`);
      } else {
        // Remove assignment
        console.log(`🗑️ Removing from DB: staff_id=${staffId}, date=${effectiveDateStr}`);
        
        const { error } = await supabase
          .from('staff_assignments')
          .delete()
          .eq('staff_id', staffId)
          .eq('assignment_date', effectiveDateStr);

        if (error) {
          console.error('❌ Database error:', error);
          throw error;
        }
        
        toast.success(`Staff assignment removed successfully`);
      }
      
    } catch (error) {
      console.error('Error in staff drop:', error);
      toast.error('Failed to update staff assignment');
      // Revert optimistic update on error
      fetchAssignments();
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, availableStaff, fetchAssignments]);

  // Get staff for a specific team and date
  const getStaffForTeamAndDate = useCallback((teamId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments
      .filter(a => a.teamId === teamId && a.date === dateStr)
      .map(a => ({
        id: a.staffId,
        name: a.staffName,
        color: a.color || '#E3F2FD'
      }));
  }, [assignments]);

  // Get available staff for a specific date
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
    console.log('🔄 Force refreshing assignments');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    assignments,
    availableStaff,
    isLoading,
    handleStaffDrop,
    getStaffForTeamAndDate,
    getAvailableStaffForDate,
    forceRefresh,
    refreshTrigger
  };
};

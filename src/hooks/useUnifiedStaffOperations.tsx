
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

  // Fetch ALL assignments (no date filtering) and filter out blocked staff
  const fetchAssignments = useCallback(async () => {
    try {
      setIsLoading(true);
      
      console.log('🔄 [fetchAssignments] Fetching ALL staff assignments from database');
      
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
        .order('assignment_date', { ascending: true });

      if (error) {
        console.error('❌ [fetchAssignments] Error fetching assignments:', error);
        throw error;
      }

      console.log(`📥 [fetchAssignments] Raw DB data:`, data?.length || 0, 'rows');

      // Fetch all blocked/unavailable periods
      const { data: blockedData, error: blockedError } = await supabase
        .from('staff_availability')
        .select('staff_id, start_date, end_date')
        .in('availability_type', ['blocked', 'unavailable']);

      if (blockedError) {
        console.error('Error fetching blocked periods:', blockedError);
      }

      // Create a map to check if a staff member is blocked on a given date
      const isStaffBlocked = (staffId: string, dateStr: string): boolean => {
        if (!blockedData) return false;
        return blockedData.some(blocked => 
          blocked.staff_id === staffId &&
          dateStr >= blocked.start_date &&
          dateStr <= blocked.end_date
        );
      };

      const allAssignments: StaffAssignment[] = (data || [])
        .filter(assignment => {
          const isBlocked = isStaffBlocked(assignment.staff_id, assignment.assignment_date);
          if (isBlocked) {
            console.log(`🚫 Filtering out blocked staff: ${assignment.staff_members?.name} on ${assignment.assignment_date}`);
          }
          return !isBlocked;
        })
        .map(assignment => {
          const formatted = {
            staffId: assignment.staff_id,
            staffName: assignment.staff_members?.name || `Staff ${assignment.staff_id}`,
            teamId: toFrontendTeamId(assignment.team_id),
            date: assignment.assignment_date,
            color: assignment.staff_members?.color || '#E3F2FD'
          };
          return formatted;
        });
      
      console.log(`✅ [fetchAssignments] Total available assignments: ${allAssignments.length}`);
      setAssignments(allAssignments);
      
    } catch (error) {
      console.error('❌ [fetchAssignments] Error in fetchAssignments:', error);
      toast.error('Failed to load staff assignments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch available staff
  const fetchAvailableStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, color')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error fetching available staff:', error);
        return;
      }

      // Filter out staff who are blocked/unavailable OR don't have an available period on the current date
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      
      // Get all availability periods that cover this date
      const { data: availabilityData, error: availError } = await supabase
        .from('staff_availability')
        .select('staff_id, availability_type')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);

      if (availError) {
        console.error('Error checking availability:', availError);
      }

      // Filter staff: must have an 'available' period AND no 'blocked'/'unavailable' periods
      const availableStaffIds = new Set<string>();
      const blockedStaffIds = new Set<string>();
      
      (availabilityData || []).forEach(period => {
        if (period.availability_type === 'available') {
          availableStaffIds.add(period.staff_id);
        } else if (period.availability_type === 'blocked' || period.availability_type === 'unavailable') {
          blockedStaffIds.add(period.staff_id);
        }
      });

      const staff = (data || [])
        .filter(member => {
          // Must have an available period AND not be blocked
          return availableStaffIds.has(member.id) && !blockedStaffIds.has(member.id);
        })
        .map(member => ({
          id: member.id,
          name: member.name,
          color: member.color || '#E3F2FD'
        }));

      console.log(`📋 Fetched ${staff.length} available staff members (${availableStaffIds.size} have available periods, ${blockedStaffIds.size} blocked)`);
      setAvailableStaff(staff);
    } catch (error) {
      console.error('Error fetching available staff:', error);
    }
  }, [currentDate]);

  // Initial load
  useEffect(() => {
    console.log('🚀 [useUnifiedStaffOps] Initial load triggered, refreshTrigger:', refreshTrigger);
    fetchAssignments();
    fetchAvailableStaff();
  }, [fetchAssignments, fetchAvailableStaff, refreshTrigger]);

  // Real-time subscription for ALL assignments
  useEffect(() => {
    console.log('🔔 [Real-time] Setting up subscription for ALL staff assignments');
    
    const channel = supabase
      .channel('unified-staff-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments'
        },
        (payload) => {
          console.log('🔔 [Real-time] Change detected:', payload.eventType, payload);
          fetchAssignments();
        }
      )
      .subscribe();

    return () => {
      console.log('🔔 [Real-time] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [fetchAssignments]);

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
      const errorMessage = (error as any)?.message || 'Failed to update staff assignment';
      toast.error(errorMessage);
      // Revert optimistic update on error
      fetchAssignments();
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, availableStaff, fetchAssignments]);

  // Get staff for a specific team and date (now sync - filtering happens at fetch time)
  const getStaffForTeamAndDate = useCallback((teamId: string, date: Date): StaffMember[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    console.log(`🔎 [getStaffForTeamAndDate] Called with teamId: ${teamId}, date: ${dateStr}`);
    
    const filtered = assignments.filter(a => {
      const teamMatch = a.teamId === teamId;
      const dateMatch = a.date === dateStr;
      return teamMatch && dateMatch;
    });
    
    console.log(`✅ [getStaffForTeamAndDate] Returning ${filtered.length} staff (already filtered for availability)`);

    return filtered.map(a => ({
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

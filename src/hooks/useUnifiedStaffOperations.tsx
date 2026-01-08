
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, addDays } from 'date-fns';

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
            teamId: assignment.team_id,
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
      
      console.log('🔍 [fetchAvailableStaff] Checking availability for date:', dateStr);
      console.log('📋 [fetchAvailableStaff] Total active staff before filtering:', data?.length || 0);
      
      // Get all availability periods that cover this date
      const { data: availabilityData, error: availError } = await supabase
        .from('staff_availability')
        .select('staff_id, availability_type, start_date, end_date')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);

      if (availError) {
        console.error('❌ [fetchAvailableStaff] Error checking availability:', availError);
      }

      console.log('📅 [fetchAvailableStaff] Availability periods found:', availabilityData?.length || 0, availabilityData);

      // Filter staff: must have an 'available' period AND no 'blocked'/'unavailable' periods
      const availableStaffIds = new Set<string>();
      const blockedStaffIds = new Set<string>();
      
      (availabilityData || []).forEach(period => {
        if (period.availability_type === 'available') {
          availableStaffIds.add(period.staff_id);
          console.log(`  ✅ Staff ${period.staff_id} has AVAILABLE period`);
        } else if (period.availability_type === 'blocked' || period.availability_type === 'unavailable') {
          blockedStaffIds.add(period.staff_id);
          console.log(`  ❌ Staff ${period.staff_id} has BLOCKED/UNAVAILABLE period`);
        }
      });

      console.log(`📊 [fetchAvailableStaff] Summary: ${availableStaffIds.size} with available periods, ${blockedStaffIds.size} blocked`);

      const staff = (data || [])
        .filter(member => {
          const isAvailable = availableStaffIds.has(member.id);
          const isBlocked = blockedStaffIds.has(member.id);
          const passes = isAvailable && !isBlocked;
          console.log(`  👤 ${member.name}: available=${isAvailable}, blocked=${isBlocked}, passes=${passes}`);
          return passes;
        })
        .map(member => ({
          id: member.id,
          name: member.name,
          color: member.color || '#E3F2FD'
        }));

      console.log(`✅ [fetchAvailableStaff] Final result: ${staff.length} staff available`);
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
    
    console.log(`🎯 Staff drop: ${staffId} to ${resourceId || 'unassigned'} on ${effectiveDateStr}`);
    
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
          teamId: resourceId,
          date: effectiveDateStr,
          color: staffMember?.color || '#E3F2FD'
        };
        return [...filteredAssignments, newAssignment];
      }
      
      return filteredAssignments;
    });
    
    setIsLoading(true);
    
    try {
      if (resourceId) {
        // Assign staff to team
        console.log(`💾 Saving to DB: staff_id=${staffId}, team_id=${resourceId}, date=${effectiveDateStr}`);
        
        const { data, error } = await supabase
          .from('staff_assignments')
          .upsert({
            staff_id: staffId,
            team_id: resourceId,
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

  // Get available staff for a specific date - queries DB for correct date-specific availability
  const getAvailableStaffForDate = useCallback(async (targetDate: Date): Promise<StaffMember[]> => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    
    try {
      // Get all active staff
      const { data: allStaff, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name, color')
        .eq('is_active', true);
      
      if (staffError || !allStaff) {
        console.error('Error fetching staff:', staffError);
        return [];
      }
      
      // Get availability periods covering this specific date
      const { data: availabilityData, error: availError } = await supabase
        .from('staff_availability')
        .select('staff_id, availability_type')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);
      
      if (availError) {
        console.error('Error fetching availability:', availError);
      }
      
      // Create sets for filtering
      const availableStaffIds = new Set<string>();
      const blockedStaffIds = new Set<string>();
      
      (availabilityData || []).forEach(period => {
        if (period.availability_type === 'available') {
          availableStaffIds.add(period.staff_id);
        } else if (period.availability_type === 'blocked' || period.availability_type === 'unavailable') {
          blockedStaffIds.add(period.staff_id);
        }
      });
      
      // Get already assigned staff IDs for this date
      const assignedStaffIds = new Set(
        assignments
          .filter(a => a.date === dateStr)
          .map(a => a.staffId)
      );
      
      // Filter: must have available period, no blocked period, and not already assigned
      const available = allStaff
        .filter(staff => {
          const hasAvailable = availableStaffIds.has(staff.id);
          const isBlocked = blockedStaffIds.has(staff.id);
          const isAssigned = assignedStaffIds.has(staff.id);
          return hasAvailable && !isBlocked && !isAssigned;
        })
        .map(staff => ({
          id: staff.id,
          name: staff.name,
          color: staff.color || '#E3F2FD'
        }));
      
      console.log(`✅ [getAvailableStaffForDate] ${dateStr}: ${available.length} staff available`);
      return available;
    } catch (error) {
      console.error('Error in getAvailableStaffForDate:', error);
      return [];
    }
  }, [assignments]);

  // Get ALL staff for planning - shows everyone with their assignment status
  const getStaffForPlanningDate = useCallback(async (targetDate: Date, targetTeamId: string): Promise<Array<{
    id: string;
    name: string;
    color?: string;
    assignmentStatus: 'free' | 'assigned_current_team' | 'assigned_other_team';
    assignedTeamId?: string;
    assignedTeamName?: string;
  }>> => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    
    try {
      // Get all active staff
      const { data: allStaff, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name, color')
        .eq('is_active', true)
        .order('name');
      
      if (staffError || !allStaff) {
        console.error('Error fetching staff:', staffError);
        return [];
      }
      
      const staffIds = allStaff.map(s => s.id);
      
      // Get availability periods for this date (CRITICAL FILTER)
      const { data: availabilityData, error: availError } = await supabase
        .from('staff_availability')
        .select('staff_id, availability_type')
        .in('staff_id', staffIds)
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);
      
      if (availError) {
        console.error('Error fetching availability:', availError);
        return [];
      }
      
      // Determine which staff are available for this date
      const availableStaffIds = new Set<string>();
      const blockedStaffIds = new Set<string>();
      
      (availabilityData || []).forEach(period => {
        if (period.availability_type === 'available') {
          availableStaffIds.add(period.staff_id);
        } else if (period.availability_type === 'blocked' || period.availability_type === 'unavailable') {
          blockedStaffIds.add(period.staff_id);
        }
      });
      
      // Only include staff with 'available' period AND no 'blocked'/'unavailable'
      const staffWithAvailability = allStaff.filter(staff => 
        availableStaffIds.has(staff.id) && !blockedStaffIds.has(staff.id)
      );
      
      // Get assignments for this date from our local state (already loaded)
      const assignmentsForDate = assignments.filter(a => a.date === dateStr);
      
      // Create a map of staff -> their assignment for this date
      const assignmentMap = new Map<string, { teamId: string; teamName: string }>();
      assignmentsForDate.forEach(a => {
        // Convert team-11 to "Live", team-X to "Team X"
        let teamName = a.teamId;
        if (a.teamId === 'team-11') {
          teamName = 'Live';
        } else if (a.teamId.startsWith('team-')) {
          teamName = 'Team ' + a.teamId.replace('team-', '');
        }
        assignmentMap.set(a.staffId, { teamId: a.teamId, teamName });
      });
      
      // Build the result with status - only for staff WITH availability
      const result = staffWithAvailability.map(staff => {
        const assignment = assignmentMap.get(staff.id);
        
        let assignmentStatus: 'free' | 'assigned_current_team' | 'assigned_other_team' = 'free';
        if (assignment) {
          if (assignment.teamId === targetTeamId) {
            assignmentStatus = 'assigned_current_team';
          } else {
            assignmentStatus = 'assigned_other_team';
          }
        }
        
        return {
          id: staff.id,
          name: staff.name,
          color: staff.color || '#E3F2FD',
          assignmentStatus,
          assignedTeamId: assignment?.teamId,
          assignedTeamName: assignment?.teamName
        };
      });
      
      // Sort: free first, then assigned to current team, then assigned to other team
      result.sort((a, b) => {
        const order = { 'free': 0, 'assigned_current_team': 1, 'assigned_other_team': 2 };
        return order[a.assignmentStatus] - order[b.assignmentStatus];
      });
      
      console.log(`✅ [getStaffForPlanningDate] ${dateStr}: ${staffWithAvailability.length} with availability, ${result.filter(s => s.assignmentStatus === 'free').length} free`);
      return result;
    } catch (error) {
      console.error('Error in getStaffForPlanningDate:', error);
      return [];
    }
  }, [assignments]);

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
    getStaffForPlanningDate,
    forceRefresh,
    refreshTrigger
  };
};

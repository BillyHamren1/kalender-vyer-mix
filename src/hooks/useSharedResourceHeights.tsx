
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';

export interface StaffAssignmentData {
  staffId: string;
  teamId: string;
  assignmentDate: string;
  staffName: string;
}

export interface TeamHeightData {
  [teamId: string]: {
    maxStaffCount: number;
    minHeight: number;
    staffByDay: {
      [date: string]: Array<{
        id: string;
        name: string;
      }>;
    };
  };
}

export const useSharedResourceHeights = (currentWeekStart: Date, resources: Array<{id: string, title: string}>) => {
  const [teamHeights, setTeamHeights] = useState<TeamHeightData>({});
  const [staffData, setStaffData] = useState<StaffAssignmentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Generate the 7 days for the current week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(currentWeekStart.getDate() + i);
    return date;
  });

  // Calculate heights based on staff assignments
  const calculateTeamHeights = useCallback((assignments: StaffAssignmentData[]) => {
    const newTeamHeights: TeamHeightData = {};

    // Initialize all teams
    resources.forEach(resource => {
      newTeamHeights[resource.id] = {
        maxStaffCount: 0,
        minHeight: 80, // Base height for team header + button
        staffByDay: {}
      };

      // Initialize each day
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        newTeamHeights[resource.id].staffByDay[dateStr] = [];
      });
    });

    // Group assignments by team and day
    assignments.forEach(assignment => {
      const teamData = newTeamHeights[assignment.teamId];
      if (teamData) {
        const staffList = teamData.staffByDay[assignment.assignmentDate] || [];
        staffList.push({
          id: assignment.staffId,
          name: assignment.staffName
        });
        teamData.staffByDay[assignment.assignmentDate] = staffList;
      }
    });

    // Calculate max staff count and minimum height for each team
    Object.keys(newTeamHeights).forEach(teamId => {
      const teamData = newTeamHeights[teamId];
      let maxCount = 0;

      Object.values(teamData.staffByDay).forEach(staffList => {
        maxCount = Math.max(maxCount, staffList.length);
      });

      teamData.maxStaffCount = maxCount;
      // Base height (80px) + staff items (24px each) + spacing
      teamData.minHeight = 80 + (maxCount * 28) + 8;
    });

    return newTeamHeights;
  }, [resources, weekDays]);

  // Fetch staff assignments for the entire week
  const fetchWeekStaffAssignments = useCallback(async () => {
    try {
      setIsLoading(true);
      const startDate = format(weekDays[0], 'yyyy-MM-dd');
      const endDate = format(weekDays[6], 'yyyy-MM-dd');

      console.log(`Fetching staff assignments for week: ${startDate} to ${endDate}`);

      // Get all staff assignments for the week
      const { data: assignments, error: assignmentsError } = await supabase
        .from('staff_assignments')
        .select('staff_id, team_id, assignment_date')
        .gte('assignment_date', startDate)
        .lte('assignment_date', endDate);

      if (assignmentsError) {
        console.error('Error fetching staff assignments:', assignmentsError);
        throw assignmentsError;
      }

      // Get all staff members to get their names
      const { data: staffMembers, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name');

      if (staffError) {
        console.error('Error fetching staff members:', staffError);
        throw staffError;
      }

      // Combine assignments with staff names
      const enrichedAssignments: StaffAssignmentData[] = (assignments || [])
        .map(assignment => {
          const staff = staffMembers?.find(s => s.id === assignment.staff_id);
          return staff ? {
            staffId: assignment.staff_id,
            teamId: assignment.team_id,
            assignmentDate: assignment.assignment_date,
            staffName: staff.name
          } : null;
        })
        .filter(Boolean) as StaffAssignmentData[];

      console.log(`Loaded ${enrichedAssignments.length} staff assignments for the week`);
      
      setStaffData(enrichedAssignments);
      const heights = calculateTeamHeights(enrichedAssignments);
      setTeamHeights(heights);
    } catch (error) {
      console.error('Error fetching week staff assignments:', error);
      setStaffData([]);
      setTeamHeights({});
    } finally {
      setIsLoading(false);
    }
  }, [weekDays, calculateTeamHeights]);

  // Optimistic update when staff is dropped
  const optimisticStaffUpdate = useCallback((staffId: string, staffName: string, teamId: string | null, targetDate: Date) => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    
    setStaffData(prevData => {
      // Remove existing assignment for this staff on this date
      let newData = prevData.filter(item => 
        !(item.staffId === staffId && item.assignmentDate === dateStr)
      );
      
      // Add new assignment if teamId is provided
      if (teamId) {
        newData.push({
          staffId,
          teamId,
          assignmentDate: dateStr,
          staffName
        });
      }
      
      return newData;
    });

    // Recalculate heights with optimistic data
    setStaffData(currentData => {
      const heights = calculateTeamHeights(currentData);
      setTeamHeights(heights);
      return currentData;
    });
  }, [calculateTeamHeights]);

  // Get staff assignments for a specific team and date
  const getStaffForTeamAndDate = useCallback((teamId: string, date: Date): Array<{id: string, name: string}> => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return teamHeights[teamId]?.staffByDay[dateStr] || [];
  }, [teamHeights]);

  // Get minimum height for a team
  const getTeamMinHeight = useCallback((teamId: string): number => {
    return teamHeights[teamId]?.minHeight || 80;
  }, [teamHeights]);

  // Set up real-time subscription
  useEffect(() => {
    fetchWeekStaffAssignments();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('staff-assignments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_assignments'
        },
        (payload) => {
          console.log('Real-time staff assignment change:', payload);
          // Refresh data when assignments change
          fetchWeekStaffAssignments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchWeekStaffAssignments]);

  return {
    teamHeights,
    staffData,
    isLoading,
    optimisticStaffUpdate,
    getStaffForTeamAndDate,
    getTeamMinHeight,
    refreshStaffData: fetchWeekStaffAssignments
  };
};


import { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';

export interface LocalStaffAssignment {
  staffId: string;
  staffName: string;
  teamId: string;
  date: string;
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

export const useLocalStaffState = (weekDays: Date[], teamIds: string[]) => {
  const [localStaffAssignments, setLocalStaffAssignments] = useState<LocalStaffAssignment[]>([]);

  // Calculate team heights from local state
  const teamHeights = useMemo((): TeamHeightData => {
    const heights: TeamHeightData = {};

    // Initialize all teams
    teamIds.forEach(teamId => {
      heights[teamId] = {
        maxStaffCount: 0,
        minHeight: 80, // Base height
        staffByDay: {}
      };

      // Initialize each day
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        heights[teamId].staffByDay[dateStr] = [];
      });
    });

    // Group assignments by team and day
    localStaffAssignments.forEach(assignment => {
      const teamData = heights[assignment.teamId];
      if (teamData) {
        const staffList = teamData.staffByDay[assignment.date] || [];
        staffList.push({
          id: assignment.staffId,
          name: assignment.staffName
        });
        teamData.staffByDay[assignment.date] = staffList;
      }
    });

    // Calculate max staff count and minimum height for each team
    Object.keys(heights).forEach(teamId => {
      const teamData = heights[teamId];
      let maxCount = 0;

      Object.values(teamData.staffByDay).forEach(staffList => {
        maxCount = Math.max(maxCount, staffList.length);
      });

      teamData.maxStaffCount = maxCount;
      // Base height (80px) + staff items (28px each) + spacing
      teamData.minHeight = 80 + (maxCount * 28) + 8;
    });

    return heights;
  }, [localStaffAssignments, weekDays, teamIds]);

  // Add staff assignment optimistically
  const addStaffAssignment = useCallback((staffId: string, staffName: string, teamId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    setLocalStaffAssignments(prev => {
      // Remove any existing assignment for this staff on this date
      const filtered = prev.filter(assignment => 
        !(assignment.staffId === staffId && assignment.date === dateStr)
      );
      
      // Add new assignment
      return [...filtered, {
        staffId,
        staffName,
        teamId,
        date: dateStr
      }];
    });
  }, []);

  // Remove staff assignment optimistically
  const removeStaffAssignment = useCallback((staffId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    setLocalStaffAssignments(prev => 
      prev.filter(assignment => 
        !(assignment.staffId === staffId && assignment.date === dateStr)
      )
    );
  }, []);

  // Initialize staff assignments from external data
  const initializeStaffAssignments = useCallback((assignments: LocalStaffAssignment[]) => {
    setLocalStaffAssignments(assignments);
  }, []);

  // Get staff for a specific team and date
  const getStaffForTeamAndDate = useCallback((teamId: string, date: Date): Array<{id: string, name: string}> => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return teamHeights[teamId]?.staffByDay[dateStr] || [];
  }, [teamHeights]);

  // Get minimum height for a team
  const getTeamMinHeight = useCallback((teamId: string): number => {
    return teamHeights[teamId]?.minHeight || 80;
  }, [teamHeights]);

  return {
    teamHeights,
    localStaffAssignments,
    addStaffAssignment,
    removeStaffAssignment,
    initializeStaffAssignments,
    getStaffForTeamAndDate,
    getTeamMinHeight
  };
};

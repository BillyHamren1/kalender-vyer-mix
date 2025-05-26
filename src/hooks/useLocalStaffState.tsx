
import { useState, useCallback, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { fetchStaffAssignments, fetchStaffMembers } from '@/services/staffService';

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
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize staff assignments from database on mount
  useEffect(() => {
    const initializeAssignments = async () => {
      if (weekDays.length === 0 || isInitialized) return;
      
      try {
        console.log('Initializing staff assignments for week:', weekDays.map(d => format(d, 'yyyy-MM-dd')));
        
        // Fetch staff members to get names - this is the authoritative source for staff names
        const staffMembers = await fetchStaffMembers();
        const staffMap = new Map(staffMembers.map(s => [s.id, s.name]));
        
        console.log('Staff members from database:', staffMembers);
        
        // Fetch assignments for each day of the week
        const allAssignments: LocalStaffAssignment[] = [];
        
        for (const day of weekDays) {
          const assignments = await fetchStaffAssignments(day);
          
          console.log(`Staff assignments for ${format(day, 'yyyy-MM-dd')}:`, assignments);
          
          assignments.forEach(assignment => {
            // CRITICAL: Use staff_members table as the authoritative source for staff names
            const staffName = staffMap.get(assignment.staff_id) || 
                            assignment.staff_members?.name || 
                            `Unknown Staff ${assignment.staff_id}`;
            
            console.log(`Processing assignment: staff_id=${assignment.staff_id}, staff_name=${staffName}, team_id=${assignment.team_id}`);
            
            allAssignments.push({
              staffId: assignment.staff_id,
              staffName, // This should be the staff member's name, not a client name
              teamId: assignment.team_id,
              date: format(day, 'yyyy-MM-dd')
            });
          });
        }
        
        console.log('Final staff assignments with names:', allAssignments);
        setLocalStaffAssignments(allAssignments);
        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing staff assignments:', error);
        setIsInitialized(true); // Set to true even on error to prevent retries
      }
    };

    initializeAssignments();
  }, [weekDays, isInitialized]);

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
        
        // Make sure we're adding staff member data, not client data
        console.log(`Adding staff to team ${assignment.teamId} on ${assignment.date}: ${assignment.staffName} (ID: ${assignment.staffId})`);
        
        staffList.push({
          id: assignment.staffId,
          name: assignment.staffName // This should be staff member name
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

  // Add staff assignment with proper staff name
  const addStaffAssignment = useCallback(async (staffId: string, staffName: string, teamId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    console.log(`Adding staff assignment: ${staffName} (${staffId}) to team ${teamId} on ${dateStr}`);
    
    // If we don't have the staff name, fetch it from the database
    let actualStaffName = staffName;
    if (!staffName || staffName.startsWith('Staff ')) {
      try {
        const staffMembers = await fetchStaffMembers();
        const staff = staffMembers.find(s => s.id === staffId);
        actualStaffName = staff?.name || `Unknown Staff ${staffId}`;
        console.log(`Fetched actual staff name: ${actualStaffName} for ID: ${staffId}`);
      } catch (error) {
        console.error('Error fetching staff name:', error);
      }
    }
    
    setLocalStaffAssignments(prev => {
      // Remove any existing assignment for this staff on this date
      const filtered = prev.filter(assignment => 
        !(assignment.staffId === staffId && assignment.date === dateStr)
      );
      
      // Add new assignment
      return [...filtered, {
        staffId,
        staffName: actualStaffName,
        teamId,
        date: dateStr
      }];
    });
  }, []);

  // Remove staff assignment
  const removeStaffAssignment = useCallback((staffId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    console.log(`Removing staff assignment: ${staffId} on ${dateStr}`);
    
    setLocalStaffAssignments(prev => 
      prev.filter(assignment => 
        !(assignment.staffId === staffId && assignment.date === dateStr)
      )
    );
  }, []);

  // Sync with successful assignment from dialog
  const syncAfterAssignment = useCallback(async (staffId: string, teamId: string, date: Date) => {
    try {
      console.log(`Syncing after assignment: ${staffId} to team ${teamId} on ${format(date, 'yyyy-MM-dd')}`);
      
      // Fetch staff member name from staff_members table
      const staffMembers = await fetchStaffMembers();
      const staff = staffMembers.find(s => s.id === staffId);
      const staffName = staff?.name || `Unknown Staff ${staffId}`;
      
      console.log(`Found staff member: ${staffName} for ID: ${staffId}`);
      
      // Add to local state with correct staff name
      await addStaffAssignment(staffId, staffName, teamId, date);
    } catch (error) {
      console.error('Error syncing after assignment:', error);
      // Fallback to adding with basic name
      await addStaffAssignment(staffId, `Unknown Staff ${staffId}`, teamId, date);
    }
  }, [addStaffAssignment]);

  // Get staff for a specific team and date
  const getStaffForTeamAndDate = useCallback((teamId: string, date: Date): Array<{id: string, name: string}> => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const staff = teamHeights[teamId]?.staffByDay[dateStr] || [];
    console.log(`Getting staff for team ${teamId} on ${dateStr}:`, staff);
    return staff;
  }, [teamHeights]);

  // Get minimum height for a team
  const getTeamMinHeight = useCallback((teamId: string): number => {
    return teamHeights[teamId]?.minHeight || 80;
  }, [teamHeights]);

  return {
    teamHeights,
    localStaffAssignments,
    isInitialized,
    addStaffAssignment,
    removeStaffAssignment,
    syncAfterAssignment,
    getStaffForTeamAndDate,
    getTeamMinHeight
  };
};

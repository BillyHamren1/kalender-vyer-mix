
import { supabase } from "@/integrations/supabase/client";
import { Resource } from "@/components/Calendar/ResourceData";
import { mapDatabaseToAppResourceId, mapAppToDatabaseResourceId } from "./eventService";

// Fetch all team resources
export const fetchTeamResources = async (): Promise<Resource[]> => {
  try {
    // For now, we are using the client-side array since there's no teams table in the database
    // In a real application, you would fetch this from the database
    const storedResources = localStorage.getItem('calendarResources');
    if (storedResources) {
      const resources = JSON.parse(storedResources);
      // Filter to only include team resources
      return resources.filter((resource: Resource) => 
        resource.id.startsWith('team-')
      );
    }
    
    // Default sample resources if nothing is stored
    return [
      { id: 'team-1', title: 'Team 1', eventColor: '#3788d8' },
      { id: 'team-2', title: 'Team 2', eventColor: '#1e90ff' },
      { id: 'team-3', title: 'Team 3', eventColor: '#4169e1' },
    ];
  } catch (error) {
    console.error('Error fetching team resources:', error);
    return [];
  }
};

// Get team details by ID
export const getTeamById = async (teamId: string): Promise<Resource | null> => {
  try {
    // For now, we are using the client-side array since there's no teams table in the database
    const storedResources = localStorage.getItem('calendarResources');
    if (storedResources) {
      const resources = JSON.parse(storedResources);
      const team = resources.find((resource: Resource) => resource.id === teamId);
      return team || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting team by ID:', error);
    return null;
  }
};

// Save resources to localStorage
export const saveResources = (resources: Resource[]): void => {
  localStorage.setItem('calendarResources', JSON.stringify(resources));
};

// Find the first available team for a given date and time range
export const findAvailableTeam = async (startTime: Date, endTime: Date): Promise<string> => {
  try {
    // First, get all teams
    const teamResources = await fetchTeamResources();
    if (teamResources.length === 0) return 'team-1'; // Default if no teams
    
    // Get all events on the given day
    const start = new Date(startTime);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endTime);
    end.setHours(23, 59, 59, 999);
    
    const { data: eventsOnDay } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('start_time', start.toISOString())
      .lte('end_time', end.toISOString());
    
    if (!eventsOnDay) return teamResources[0].id;
    
    // Find busy teams during the specific time slot
    const busyTeams = new Set<string>();
    eventsOnDay.forEach(event => {
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time);
      
      if (
        (startTime <= eventEnd && endTime >= eventStart)
      ) {
        // Map database resource ID to application format
        const appResourceId = mapDatabaseToAppResourceId(event.resource_id);
        if (appResourceId.startsWith('team-')) {
          busyTeams.add(appResourceId);
        }
      }
    });
    
    // Find first available team
    for (const team of teamResources) {
      if (!busyTeams.has(team.id)) {
        return team.id;
      }
    }
    
    // If all teams are busy, return the first team
    return teamResources[0].id;
  } catch (error) {
    console.error('Error finding available team:', error);
    return 'team-1'; // Fallback
  }
};

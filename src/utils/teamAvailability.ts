
import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';

/**
 * Finds the first available team for a new event based on existing events
 * @param eventStartTime The start time of the event
 * @param eventEndTime The end time of the event
 * @param events All current events in the calendar
 * @param resources All available resources
 * @returns The ID of the first available team
 */
export const findAvailableTeam = (
  eventStartTime: Date, 
  eventEndTime: Date,
  events: CalendarEvent[],
  resources: Resource[]
): string => {
  const teamResources = resources.filter(resource => resource.id.startsWith('team-'));
  if (teamResources.length === 0) return 'team-1'; // Default if no teams exist
  
  // Find all teams without events at the given time slot
  const busyTeams = new Set<string>();
  
  events.forEach(event => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    
    // Check if the event overlaps with the new time slot
    if (
      (eventStartTime <= eventEnd && eventEndTime >= eventStart) &&
      event.resourceId.startsWith('team-')
    ) {
      busyTeams.add(event.resourceId);
    }
  });
  
  // Find first available team in order
  const sortedTeams = teamResources.sort((a, b) => {
    // Extract team numbers for proper numeric sorting
    const numA = parseInt(a.id.split('-')[1]);
    const numB = parseInt(b.id.split('-')[1]);
    return numA - numB;
  });
  
  // Find first available team
  for (const team of sortedTeams) {
    if (!busyTeams.has(team.id)) {
      return team.id;
    }
  }
  
  // If all teams are busy, return the first team
  return sortedTeams[0].id;
};

/**
 * Counts the number of events assigned to each team and returns the team with the fewest events
 * @param events All current events in the calendar
 * @param resources All available resources
 * @returns The ID of the team with the fewest events
 */
export const findTeamWithLeastEvents = (
  events: CalendarEvent[],
  resources: Resource[]
): string => {
  // Filter to only include team resources (not room resources)
  const teamResources = resources.filter(resource => resource.id.startsWith('team-') && resource.id !== 'team-6');
  
  if (teamResources.length === 0) return 'team-1'; // Default if no teams exist
  
  // Count events per team
  const teamCounts: Record<string, number> = {};
  
  // Initialize all teams with 0 events
  teamResources.forEach(team => {
    teamCounts[team.id] = 0;
  });
  
  // Count events for each team
  events.forEach(event => {
    if (event.resourceId.startsWith('team-') && event.resourceId !== 'team-6') {
      teamCounts[event.resourceId] = (teamCounts[event.resourceId] || 0) + 1;
    }
  });
  
  // Find team with least events
  let minEvents = Number.MAX_SAFE_INTEGER;
  let selectedTeam = 'team-1';
  
  // First identify the minimum number of events
  for (const [teamId, count] of Object.entries(teamCounts)) {
    if (count < minEvents) {
      minEvents = count;
    }
  }
  
  // Then find the team with the lowest number that has this minimum number of events
  const teamNumbers = teamResources
    .map(team => ({ id: team.id, num: parseInt(team.id.split('-')[1]) }))
    .sort((a, b) => a.num - b.num);
    
  for (const team of teamNumbers) {
    if (teamCounts[team.id] === minEvents) {
      selectedTeam = team.id;
      break; // Take the first (lowest numbered) team with minimum events
    }
  }
  
  return selectedTeam;
};


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

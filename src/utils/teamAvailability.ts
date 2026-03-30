
import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';

/**
 * Finds the best team for a new event using round-robin + sequential scheduling.
 * 
 * Rules:
 * 1. If isExplicitStart: find first team (ordered 1→5) with no time overlap. If all busy → team-1.
 * 2. If not explicit: round-robin by event count (fewest events, lowest team number breaks ties).
 * 
 * @param eventStartTime The start time of the event
 * @param eventEndTime The end time of the event
 * @param events All current events in the calendar
 * @param resources All available resources
 * @param isExplicitStart Whether the start time is explicitly set by the booking
 * @returns The ID of the assigned team
 */
export const findAvailableTeam = (
  eventStartTime: Date, 
  eventEndTime: Date,
  events: CalendarEvent[],
  resources: Resource[],
  isExplicitStart: boolean = false
): string => {
  const teamResources = resources
    .filter(resource => resource.id.startsWith('team-') && resource.id !== 'team-11')
    .filter(resource => {
      const num = parseInt(resource.id.split('-')[1]);
      return num >= 1 && num <= 5;
    })
    .sort((a, b) => parseInt(a.id.split('-')[1]) - parseInt(b.id.split('-')[1]));

  if (teamResources.length === 0) return 'team-1';

  // Get events for the same date on team-1 through team-5
  const eventDate = `${eventStartTime.getUTCFullYear()}-${String(eventStartTime.getUTCMonth() + 1).padStart(2, '0')}-${String(eventStartTime.getUTCDate()).padStart(2, '0')}`;
  
  const teamIds = new Set(teamResources.map(r => r.id));
  const sameDayEvents = events.filter(event => {
    if (!teamIds.has(event.resourceId)) return false;
    const evStart = new Date(event.start);
    const evDate = `${evStart.getUTCFullYear()}-${String(evStart.getUTCMonth() + 1).padStart(2, '0')}-${String(evStart.getUTCDate()).padStart(2, '0')}`;
    return evDate === eventDate;
  });

  if (isExplicitStart) {
    // === EXPLICIT START: find first team without overlap at this specific time ===
    for (const team of teamResources) {
      let hasOverlap = false;
      for (const event of sameDayEvents) {
        if (event.resourceId !== team.id) continue;
        const evStart = new Date(event.start);
        const evEnd = new Date(event.end);
        if (eventStartTime < evEnd && eventEndTime > evStart) {
          hasOverlap = true;
          break;
        }
      }
      if (!hasOverlap) return team.id;
    }
    // All teams busy at this time — use first team (overlap allowed)
    return teamResources[0].id;
  } else {
    // === NO EXPLICIT START: round-robin by event count ===
    const teamCounts = new Map<string, number>();
    for (const team of teamResources) {
      teamCounts.set(team.id, 0);
    }
    for (const event of sameDayEvents) {
      teamCounts.set(event.resourceId, (teamCounts.get(event.resourceId) || 0) + 1);
    }

    let minCount = Number.MAX_SAFE_INTEGER;
    for (const [, count] of teamCounts) {
      if (count < minCount) minCount = count;
    }

    for (const team of teamResources) {
      if ((teamCounts.get(team.id) || 0) === minCount) {
        return team.id;
      }
    }

    return teamResources[0].id;
  }
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

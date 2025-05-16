
import { useEffect } from 'react';
import { CalendarEvent, generateEventId, getEventColor } from '@/components/Calendar/ResourceData';
import { Resource } from '@/components/Calendar/ResourceData';

export const useEventActions = (
  events: CalendarEvent[],
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>, 
  resources: Resource[]
) => {
  // Function to find the first available team for a new event
  const findAvailableTeam = (eventStartTime: Date, eventEndTime: Date): string => {
    const teamResources = resources.filter(resource => resource.id.startsWith('team-'));
    if (teamResources.length === 0) return 'team-1'; // Default if no teams exist
    
    // For simplicity, prioritize teams in order (team-1, team-2, etc.)
    // This ensures events are placed in order, starting from team-1
    
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
  
  // Function to add new events to the calendar
  const addEventToCalendar = (event: Omit<CalendarEvent, 'id'>) => {
    // If no resourceId is provided, find an available team
    let resourceId = event.resourceId;
    
    if (!resourceId || resourceId === 'auto') {
      const eventStartTime = new Date(event.start);
      const eventEndTime = new Date(event.end);
      resourceId = findAvailableTeam(eventStartTime, eventEndTime);
    }
    
    const newEvent: CalendarEvent = {
      ...event,
      id: generateEventId(),
      color: getEventColor(event.eventType),
      resourceId: resourceId
    };
    
    setEvents(prevEvents => [...prevEvents, newEvent]);
    console.log("New event added:", newEvent);
    return newEvent.id;
  };
  
  // Expose the add event function to window for BookingDetail.tsx to use
  useEffect(() => {
    // @ts-ignore
    window.addEventToCalendar = addEventToCalendar;
    
    return () => {
      // @ts-ignore
      delete window.addEventToCalendar;
    };
  }, [events, resources]);
  
  return {
    addEventToCalendar,
    findAvailableTeam
  };
};

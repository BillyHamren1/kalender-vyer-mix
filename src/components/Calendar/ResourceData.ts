export interface Resource {
  id: string;
  title: string;
  eventColor?: string;
}

// Teams to be used in the calendar instead of rooms
export const sampleResources: Resource[] = [
  { id: 'team-1', title: 'Team 1', eventColor: '#3788d8' },
  { id: 'team-2', title: 'Team 2', eventColor: '#1e90ff' },
  { id: 'team-3', title: 'Team 3', eventColor: '#4169e1' },
  { id: 'team-4', title: 'Team 4', eventColor: '#0073cf' },
  { id: 'team-5', title: 'Team 5', eventColor: '#4682b4' },
];

export interface CalendarEvent {
  id: string;
  resourceId: string;
  title: string;
  start: string;
  end: string;
  color?: string;
  bookingId?: string; // Link to the booking
  eventType?: 'rig' | 'event' | 'rigDown'; // Type of event for color coding
}

// Color mappings for different event types
export const eventColors = {
  rig: '#F2FCE2', // Soft Green for rig events
  event: '#FEF7CD', // Soft Yellow for events
  rigDown: '#FFDEE2', // Soft Pink for rig down events
  default: '#3788d8', // Default blue
};

// Sample events for the calendar
export const sampleEvents: CalendarEvent[] = [
  {
    id: '1',
    resourceId: 'team-1',
    title: 'Möte med kund',
    start: new Date(new Date().setHours(10, 0)).toISOString(),
    end: new Date(new Date().setHours(12, 0)).toISOString(),
  },
  {
    id: '2',
    resourceId: 'team-2',
    title: 'Teamutbildning',
    start: new Date(new Date().setHours(11, 0)).toISOString(),
    end: new Date(new Date().setHours(13, 30)).toISOString(),
  },
  {
    id: '3',
    resourceId: 'team-4',
    title: 'Presentation',
    start: new Date(new Date().setHours(14, 0)).toISOString(),
    end: new Date(new Date().setHours(15, 30)).toISOString(),
  },
  {
    id: '4',
    resourceId: 'team-3',
    title: 'Kundmöte',
    start: new Date(new Date().setHours(9, 0)).toISOString(),
    end: new Date(new Date().setHours(10, 30)).toISOString(),
  },
  {
    id: '5',
    resourceId: 'team-5',
    title: 'Workshop',
    start: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(),
    end: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(15, 0)).toISOString(),
  },
];

// Utility function to generate a unique ID for events
export const generateEventId = (): string => {
  return `event-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// Function to get color based on event type
export const getEventColor = (eventType?: 'rig' | 'event' | 'rigDown'): string => {
  if (!eventType) return eventColors.default;
  return eventColors[eventType] || eventColors.default;
};

// Save resources to localStorage
export const saveResourcesToStorage = (resources: Resource[]): void => {
  localStorage.setItem('calendarResources', JSON.stringify(resources));
};

// Load resources from localStorage
export const loadResourcesFromStorage = (): Resource[] => {
  const stored = localStorage.getItem('calendarResources');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing stored resources:', e);
      return sampleResources;
    }
  }
  return sampleResources;
};

// Find a resource by its ID
export const findResourceById = (resources: Resource[], id: string): Resource | undefined => {
  return resources.find(resource => resource.id === id);
};

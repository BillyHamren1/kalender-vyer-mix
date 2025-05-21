
// Define the types for resources and calendar events

export type Resource = {
  id: string;
  title: string;
  groupId?: string;
  children?: Resource[];
  staffAssignments?: StaffAssignment[];
  eventColor?: string; // Add eventColor property to Resource type
};

export type StaffAssignment = {
  id: string;
  name: string;
  teamId: string;
};

export type CalendarEvent = {
  id: string;
  resourceId: string;
  title: string;
  start: string;
  end: string;
  eventType: 'rig' | 'event' | 'rigDown' | 'task'; // Add 'task' as a valid event type
  color?: string;
  bookingId?: string;
  deliveryAddress?: string;
  customer?: string; // Add customer property to fix build error
};

// Helper function to get the correct color for the event type
export const getEventColor = (eventType: 'rig' | 'event' | 'rigDown' | 'task'): string => {
  switch (eventType) {
    case 'rig':
      return '#2563eb'; // Blue
    case 'event':
      return '#eab308'; // Yellow
    case 'rigDown':
      return '#22c55e'; // Green
    case 'task':
      return '#9333ea'; // Purple for tasks
    default:
      return '#6b7280'; // Gray
  }
};

// Generate a unique ID for new events
export const generateEventId = (): string => {
  return crypto.randomUUID();
};

// Save resources to localStorage
export const saveResourcesToStorage = (resources: Resource[]): void => {
  localStorage.setItem('calendarResources', JSON.stringify(resources));
};

// Load resources from localStorage
export const loadResourcesFromStorage = (): Resource[] => {
  const storedResources = localStorage.getItem('calendarResources');
  if (storedResources) {
    return JSON.parse(storedResources);
  }
  
  // Default resources if none are stored
  return [
    { id: 'team-1', title: 'Team 1', eventColor: '#3788d8' },
    { id: 'team-2', title: 'Team 2', eventColor: '#1e90ff' },
    { id: 'team-3', title: 'Team 3', eventColor: '#4169e1' },
    { id: 'team-4', title: 'Team 4', eventColor: '#0073cf' },
    { id: 'team-5', title: 'Team 5', eventColor: '#4682b4' },
    { id: 'team-6', title: 'Todays events', eventColor: '#FEF7CD' },
  ];
};

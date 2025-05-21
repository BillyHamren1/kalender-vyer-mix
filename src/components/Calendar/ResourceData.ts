
// Define the types for resources and calendar events

export type Resource = {
  id: string;
  title: string;
  groupId?: string;
  children?: Resource[];
  staffAssignments?: StaffAssignment[];
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
  eventType: 'rig' | 'event' | 'rigDown';
  color?: string;
  bookingId?: string;
  deliveryAddress?: string;
};

// Helper function to get the correct color for the event type
export const getEventColor = (eventType: 'rig' | 'event' | 'rigDown'): string => {
  switch (eventType) {
    case 'rig':
      return '#2563eb'; // Blue
    case 'event':
      return '#eab308'; // Yellow
    case 'rigDown':
      return '#22c55e'; // Green
    default:
      return '#6b7280'; // Gray
  }
};

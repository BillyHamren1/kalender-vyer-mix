import { EventInput } from '@fullcalendar/react';

// Define the structure for resources (teams)
export interface Resource {
  id: string;
  title: string;
  eventColor?: string;
}

// Function to generate a unique event ID
export const generateEventId = (): string => {
  return Math.random().toString(36).substring(2, 15);
};

// Function to determine event color based on event type
export const getEventColor = (eventType?: string): string => {
  switch (eventType) {
    case 'rig':
      return '#e6ee9c'; // Light Yellow-Green
    case 'event':
      return '#fff9c4'; // Light Yellow
    case 'rigDown':
      return '#ffcc80'; // Light Orange
    default:
      return '#cfd8dc'; // Grey
  }
};

// Update CalendarEvent interface to include all fields we need
export interface CalendarEvent {
  id: string;
  resourceId: string;
  start: string;
  end: string;
  title: string;
  eventType?: 'rig' | 'event' | 'rigDown';
  color?: string;
  bookingId?: string;
  deliveryAddress?: string;
  // Additional fields for event processing
  originalStart?: string;
  originalEnd?: string;
  isModifiedDisplay?: boolean;
  originalResourceId?: string;
}

// Type guard to check if an object is a CalendarEvent
export const isCalendarEvent = (event: EventInput): event is CalendarEvent => {
  return (
    typeof event === 'object' &&
    event !== null &&
    'id' in event &&
    'resourceId' in event &&
    'start' in event &&
    'end' in event &&
    'title' in event
  );
};

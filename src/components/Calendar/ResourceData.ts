
// Change import to fix the EventInput import error
import type { EventApi } from '@fullcalendar/core';

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
      return '#ffcdd2'; // Light Red (changed from orange to red)
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
  customer?: string; // Add the missing customer property
  // Additional fields for event processing
  originalStart?: string;
  originalEnd?: string;
  isModifiedDisplay?: boolean;
  originalResourceId?: string;
  // Add extendedProps for FullCalendar compatibility
  extendedProps?: Record<string, any>;
}

// Type guard to check if an object is a CalendarEvent
export const isCalendarEvent = (event: any): event is CalendarEvent => {
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

// Add the missing storage functions
export const saveResourcesToStorage = (resources: Resource[]): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('calendarResources', JSON.stringify(resources));
  }
};

export const loadResourcesFromStorage = (): Resource[] => {
  if (typeof window !== 'undefined') {
    const storedResources = localStorage.getItem('calendarResources');
    if (storedResources) {
      try {
        return JSON.parse(storedResources);
      } catch (error) {
        console.error('Error parsing stored resources:', error);
      }
    }
  }
  return [];
};

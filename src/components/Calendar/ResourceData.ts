import { EventInput } from '@fullcalendar/core';

export interface Resource {
  id: string;
  title: string;
  eventColor: string;
}

export interface CalendarEvent extends EventInput {
  id: string;
  title: string;
  start: Date; // Changed from string to Date
  end: Date; // Changed from string to Date
  resourceId: string;
  bookingId?: string;
  bookingNumber?: string; // Add bookingNumber field
  eventType?: 'rig' | 'event' | 'rigDown';
  deliveryAddress?: string;
  viewed?: boolean;
}

export const getEventColor = (eventType: string | undefined): string => {
  switch (eventType) {
    case 'rig':
      return '#3b82f6'; // blue-500
    case 'event':
      return '#f59e0b'; // yellow-500
    case 'rigDown':
      return '#10b981'; // green-500
    default:
      return '#6b7280'; // gray-500
  }
};

// Generate unique event ID
export const generateEventId = (): string => {
  return `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Save resources to localStorage
export const saveResourcesToStorage = (resources: Resource[]): void => {
  localStorage.setItem('calendarResources', JSON.stringify(resources));
};

// Load resources from localStorage
export const loadResourcesFromStorage = (): Resource[] => {
  try {
    const storedResources = localStorage.getItem('calendarResources');
    if (storedResources) {
      return JSON.parse(storedResources);
    }
    return [];
  } catch (error) {
    console.error('Error loading resources from storage:', error);
    return [];
  }
};

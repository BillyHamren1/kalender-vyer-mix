
import { EventInput } from '@fullcalendar/core';

export interface Resource {
  id: string;
  title: string;
  eventColor: string;
}

export interface CalendarEvent extends EventInput {
  id: string;
  title: string;
  start: string;
  end: string;
  resourceId: string;
  bookingId?: string;
  bookingNumber?: string; // Add bookingNumber field
  booking_number?: string; // Alternative naming
  eventType?: 'rig' | 'event' | 'rigDown';
  deliveryAddress?: string;
  viewed?: boolean;
}

export const getEventColor = (eventType: string | undefined): string => {
  switch (eventType) {
    case 'rig':
      return '#F2FCE2'; // Light green
    case 'event':
      return '#FEF7CD'; // Yellow
    case 'rigDown':
      return '#FEE2E2'; // Light red
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

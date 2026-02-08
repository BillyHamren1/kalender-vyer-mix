
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
  bookingNumber?: string;
  booking_number?: string;
  eventType?: 'rig' | 'event' | 'rigDown' | 'packing' | 'delivery' | 'return' | 'inventory' | 'unpacking';
  deliveryAddress?: string;
  viewed?: boolean;
  extendedProps?: {
    bookingNumber?: string;
    booking_id?: string;
    deliveryCity?: string;
    delivery_city?: string;
    has_source_changes?: boolean;
    manually_adjusted?: boolean;
    change_details?: string;
    [key: string]: any;
  };
}

export const getEventColor = (eventType: string | undefined): string => {
  switch (eventType) {
    // --- Planning colors (green / yellow / red) ---
    case 'rig':
      return '#F2FCE2'; // Light green
    case 'event':
      return '#FEF7CD'; // Yellow
    case 'rigDown':
      return '#FEE2E2'; // Light red
    // --- Warehouse colors (NO green/yellow/red overlap) ---
    case 'packing':
      return '#E9D5FF'; // Lavender/purple
    case 'delivery':
      return '#BFDBFE'; // Blue
    case 'return':
      return '#C4B5FD'; // Violet
    case 'inventory':
      return '#A5F3FC'; // Cyan
    case 'unpacking':
      return '#F1F5F9'; // Slate gray
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

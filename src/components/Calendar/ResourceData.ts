import { EventInput } from '@fullcalendar/react';

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

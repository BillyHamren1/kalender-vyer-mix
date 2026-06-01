
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
  bookingStatus?: string;
  eventType?: 'rig' | 'event' | 'rigDown' | 'packing' | 'delivery' | 'return' | 'inventory' | 'unpacking' | 'task_crew' | 'task_pm' | 'task_logistics' | 'task_admin' | 'internal_task' | 'todo';
  deliveryAddress?: string;
  viewed?: boolean;
  extendedProps?: {
    bookingNumber?: string;
    booking_id?: string;
    bookingStatus?: string;
    deliveryCity?: string;
    delivery_city?: string;
    has_source_changes?: boolean;
    manually_adjusted?: boolean;
    change_details?: string;
    [key: string]: any;
  };
}

export const getEventColor = (eventType: string | undefined, customerPickup?: boolean): string => {
  // Customer self-pickup ("Kund hämtar") → tydligt lila för rig & rivning (skiljer från röd rigDown)
  if (customerPickup && (eventType === 'rig' || eventType === 'rigDown' || eventType === 'rigdown')) {
    return eventType === 'rig' ? '#D8B4FE' /* purple-300 */ : '#C084FC' /* purple-400 */;
  }
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
      return '#F2FCE2'; // Light green (same as rig)
    case 'delivery':
      return '#BFDBFE'; // Blue
    case 'return':
      return '#FEE2E2'; // Light red (same as rigDown)
    case 'inventory':
      return '#A5F3FC'; // Cyan
    case 'unpacking':
      return '#F1F5F9'; // Slate gray
    // --- Task overlay colors ---
    case 'task_crew':
      return '#DBEAFE'; // Blue-100
    case 'task_pm':
      return '#E9D5FF'; // Purple-100
    case 'task_logistics':
      return '#BFDBFE'; // Light blue
    case 'task_admin':
      return '#F1F5F9'; // Slate-100
    // --- Activity / transport sync (calendar_events.event_type='activity') ---
    case 'activity':
    case 'transport':
      return '#BFDBFE'; // Light blue (matches delivery)
    case 'todo':
      return '#FED7AA'; // Orange-200 (to-do tasks)
    default:
      return '#DBEAFE'; // Light blue (blue-100)
  }
};

// Tailwind bg-class for event dots/badges (solid)
export const getEventDotClass = (eventType?: string): string => {
  switch (eventType) {
    case 'rig': return 'bg-green-500';
    case 'event': return 'bg-yellow-500';
    case 'rigDown': return 'bg-red-500';
    case 'packing': return 'bg-purple-500';
    case 'delivery': return 'bg-blue-500';
    case 'return': return 'bg-violet-500';
    case 'inventory': return 'bg-cyan-500';
    case 'unpacking': return 'bg-slate-400';
    case 'task_crew': return 'bg-blue-500';
    case 'task_pm': return 'bg-purple-500';
    case 'task_logistics': return 'bg-blue-400';
    case 'task_admin': return 'bg-slate-400';
    case 'todo': return 'bg-orange-500';
    default: return 'bg-gray-500';
  }
};

// Tailwind bg-class for event backgrounds (light)
export const getEventBgClass = (eventType?: string): string => {
  switch (eventType) {
    case 'rig': return 'bg-green-100';
    case 'event': return 'bg-yellow-100';
    case 'rigDown': return 'bg-red-100';
    case 'packing': return 'bg-purple-100';
    case 'delivery': return 'bg-blue-100';
    case 'return': return 'bg-violet-100';
    case 'inventory': return 'bg-cyan-100';
    case 'unpacking': return 'bg-slate-100';
    case 'task_crew': return 'bg-blue-50';
    case 'task_pm': return 'bg-purple-50';
    case 'task_logistics': return 'bg-blue-50';
    case 'task_admin': return 'bg-slate-50';
    case 'todo': return 'bg-orange-100';
    default: return 'bg-gray-100';
  }
};

// Tailwind border + bg combo for warehouse-style cards
export const getEventCardClass = (eventType?: string): string => {
  switch (eventType) {
    case 'rig': return 'bg-green-500/20 border-green-500';
    case 'event': return 'bg-yellow-500/20 border-yellow-500';
    case 'rigDown':
    case 'rigdown': return 'bg-red-500/20 border-red-500';
    case 'packing': return 'bg-purple-500/20 border-purple-500';
    case 'delivery': return 'bg-blue-500/20 border-blue-500';
    case 'return': return 'bg-violet-500/20 border-violet-500';
    case 'inventory': return 'bg-cyan-500/20 border-cyan-500';
    case 'unpacking': return 'bg-slate-400/20 border-slate-400';
    case 'task_crew': return 'bg-blue-500/20 border-blue-500';
    case 'task_pm': return 'bg-purple-500/20 border-purple-500';
    case 'task_logistics': return 'bg-blue-400/20 border-blue-400';
    case 'task_admin': return 'bg-slate-400/20 border-slate-400';
    case 'todo': return 'bg-orange-500/20 border-orange-500';
    default: return 'bg-primary/20 border-primary';
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

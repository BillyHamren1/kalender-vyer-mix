export interface Resource {
  id: string;
  title: string;
  eventColor?: string;
}

// Teams to be used in the calendar instead of rooms
export const sampleResources: Resource[] = [
  { id: 'a', title: 'Team 1', eventColor: '#3788d8' },
  { id: 'b', title: 'Team 2', eventColor: '#1e90ff' },
  { id: 'c', title: 'Team 3', eventColor: '#4169e1' },
  { id: 'd', title: 'Team 4', eventColor: '#0073cf' },
  { id: 'e', title: 'Team 5', eventColor: '#4682b4' },
];

export interface CalendarEvent {
  id: string;
  resourceId: string;
  title: string;
  start: string;
  end: string;
  color?: string;
}

// Exempel på bokningar som kan visas i kalendern
export const sampleEvents: CalendarEvent[] = [
  {
    id: '1',
    resourceId: 'a',
    title: 'Möte med kund',
    start: new Date(new Date().setHours(10, 0)).toISOString(),
    end: new Date(new Date().setHours(12, 0)).toISOString(),
  },
  {
    id: '2',
    resourceId: 'b',
    title: 'Teamutbildning',
    start: new Date(new Date().setHours(11, 0)).toISOString(),
    end: new Date(new Date().setHours(13, 30)).toISOString(),
  },
  {
    id: '3',
    resourceId: 'd',
    title: 'Presentation',
    start: new Date(new Date().setHours(14, 0)).toISOString(),
    end: new Date(new Date().setHours(15, 30)).toISOString(),
  },
  {
    id: '4',
    resourceId: 'c',
    title: 'Kundmöte',
    start: new Date(new Date().setHours(9, 0)).toISOString(),
    end: new Date(new Date().setHours(10, 30)).toISOString(),
  },
  {
    id: '5',
    resourceId: 'e',
    title: 'Workshop',
    start: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(),
    // Fix the date formatting issue here
    end: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(15, 0)).toISOString(),
  },
];

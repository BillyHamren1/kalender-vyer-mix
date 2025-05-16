
import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { toast } from 'sonner';

export const useCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // Initialize currentDate from sessionStorage or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  useEffect(() => {
    let active = true;

    const loadEvents = async () => {
      try {
        console.log('Fetching calendar events...');
        setIsLoading(true);
        const data = await fetchCalendarEvents();
        if (active) {
          console.log('Calendar events loaded successfully:', data);
          
          if (data.length === 0) {
            console.log('No events returned from database');
            toast.info('No events found', {
              description: 'No events are available in the database'
            });
          } else {
            console.log(`Loaded ${data.length} events from database`);
            
            // Log resource IDs for debugging
            const resourceIds = [...new Set(data.map(event => event.resourceId))];
            console.log('Resource IDs in events:', resourceIds);
            
            // Log event types for debugging
            const eventTypes = [...new Set(data.map(event => event.eventType))];
            console.log('Event types:', eventTypes);
            
            // Check date ranges
            const startDates = data.map(event => new Date(event.start));
            const minDate = new Date(Math.min(...startDates.map(d => d.getTime())));
            const maxDate = new Date(Math.max(...startDates.map(d => d.getTime())));
            console.log(`Events span from ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`);
          }
          
          setEvents(data);
        }
      } catch (error) {
        console.error('Error loading calendar events:', error);
        toast.error('Could not load calendar events');
      } finally {
        if (active) {
          setIsLoading(false);
          setIsMounted(true);
        }
      }
    };

    loadEvents();

    return () => {
      active = false;
    };
  }, []);

  const handleDatesSet = (dateInfo: any) => {
    const newDate = dateInfo.start;
    setCurrentDate(newDate);
    sessionStorage.setItem('calendarDate', newDate.toISOString());
    console.log('Calendar date set to:', newDate);
    
    // Check if any events are visible in the current view
    const viewStart = new Date(dateInfo.start);
    const viewEnd = new Date(dateInfo.end);
    
    const visibleEvents = events.filter(event => {
      const eventStart = new Date(event.start);
      return eventStart >= viewStart && eventStart <= viewEnd;
    });
    
    console.log(`${visibleEvents.length} events visible in current date range`);
  };
  
  // Function to force refresh the calendar events
  const refreshEvents = async (): Promise<CalendarEvent[]> => {
    setIsLoading(true);
    try {
      console.log('Manually refreshing calendar events...');
      const data = await fetchCalendarEvents();
      console.log('Refreshed calendar events:', data);
      setEvents(data);
      return data; // Return the data for chaining
    } catch (error) {
      console.error('Error refreshing calendar events:', error);
      toast.error('Could not refresh calendar events');
      return []; // Return empty array on error
    } finally {
      setIsLoading(false);
    }
  };

  return {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    refreshEvents
  };
};

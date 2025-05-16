
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
          console.log('Resource IDs in events:', data.map(event => event.resourceId));
          
          // Log event types to help with debugging
          console.log('Event types:', data.map(event => event.eventType));
          
          // Check if events are within visible date range
          const today = new Date();
          const visibleEvents = data.filter(event => {
            const eventDate = new Date(event.start);
            const diffDays = Math.abs(Math.floor((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
            return diffDays < 30; // Show events within 30 days
          });
          
          if (data.length > 0 && visibleEvents.length === 0) {
            console.warn('Events exist but none are within 30 days of today');
            toast.info('Events loaded but none visible in current view', {
              description: 'Navigate to the specific dates to see events'
            });
          }
          
          setEvents(data);
          
          if (data.length > 0) {
            // Display toast showing how many events were loaded
            toast.success(`${data.length} events loaded`, {
              description: `Calendar data loaded with ${data.length} events`
            });
          }
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
    
    if (events.length > 0 && visibleEvents.length === 0) {
      toast.info('No events in this date range', {
        description: 'Try another date range or add new events'
      });
    }
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
      throw error; // Re-throw to allow handling in calling code
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

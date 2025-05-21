
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';

export const useCalendarEvents = () => {
  const { lastViewedDate, setLastViewedDate } = useContext(CalendarContext);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);
  const activeRef = useRef(true);
  const lastUpdateRef = useRef<Date | null>(null);
  const eventIdsSet = useRef(new Set<string>());

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Memoize the loadEvents function to prevent recreations
  const loadEvents = useCallback(async (force = false) => {
    // Skip if we've updated in the last 30 seconds and this isn't a forced refresh
    if (!force && lastUpdateRef.current) {
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current.getTime();
      if (timeSinceLastUpdate < 30000) { // Increased from 5000ms to 30000ms (30 seconds)
        console.log('Skipping events update, last update was', timeSinceLastUpdate, 'ms ago');
        return;
      }
    }
    
    try {
      console.log('Fetching calendar events...');
      setIsLoading(true);
      const data = await fetchCalendarEvents();
      if (activeRef.current) {
        console.log('Calendar events loaded successfully:', data);
        
        // Deduplicate events based on ID
        const uniqueEvents = removeDuplicateEvents(data);
        
        // Update the events state
        setEvents(uniqueEvents);
        
        // Update the last update timestamp
        lastUpdateRef.current = new Date();
      }
    } catch (error) {
      console.error('Error loading calendar events:', error);
      if (activeRef.current) {
        toast.error('Could not load calendar events');
      }
    } finally {
      if (activeRef.current) {
        setIsLoading(false);
        setIsMounted(true);
      }
    }
  }, []);

  // Function to remove duplicate events
  const removeDuplicateEvents = (events: CalendarEvent[]): CalendarEvent[] => {
    const uniqueEventsMap = new Map<string, CalendarEvent>();
    const seenEventIds = new Set<string>();
    
    // First, process non-team-6 events (they have priority)
    events
      .filter(event => event.resourceId !== 'team-6')
      .forEach(event => {
        uniqueEventsMap.set(event.id, event);
        seenEventIds.add(event.id);
      });
    
    // Then, only add team-6 events if they don't already exist in another team
    events
      .filter(event => event.resourceId === 'team-6')
      .forEach(event => {
        if (!seenEventIds.has(event.id)) {
          uniqueEventsMap.set(event.id, event);
          seenEventIds.add(event.id);
        }
      });
    
    return Array.from(uniqueEventsMap.values());
  };

  // Fetch events initially and set up polling for updates
  useEffect(() => {
    activeRef.current = true;
    
    // Set the eventsSetupDone flag immediately to prevent duplication
    localStorage.setItem('eventsSetupDone', 'true');

    // Initial load
    loadEvents(true);

    // Set up polling every 2 minutes (increased from 30 seconds) to fetch updates
    // Only poll when the document is visible to reduce unnecessary requests
    pollIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadEvents();
      }
    }, 120000); // Changed from 30000 to 120000 (2 minutes)

    // Add visibility change listener to refresh when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && lastUpdateRef.current) {
        const timeSinceLastUpdate = Date.now() - lastUpdateRef.current.getTime();
        // Only refresh if it's been more than 30 seconds since the last update
        if (timeSinceLastUpdate > 30000) {
          loadEvents();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activeRef.current = false;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadEvents]);

  // Memoize handleDatesSet to prevent recreation on every render
  const handleDatesSet = useCallback((dateInfo: any) => {
    const newDate = dateInfo.start;
    
    // Skip update if the date is the same (comparing dates, not times)
    if (
      currentDate.getFullYear() === newDate.getFullYear() &&
      currentDate.getMonth() === newDate.getMonth() &&
      currentDate.getDate() === newDate.getDate()
    ) {
      return;
    }
    
    setCurrentDate(newDate);
    // Update both session storage and context
    sessionStorage.setItem('calendarDate', newDate.toISOString());
    setLastViewedDate(newDate);
    console.log('Calendar date set to:', newDate);
  }, [setLastViewedDate, currentDate]);
  
  // Function to force refresh the calendar events - memoized
  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('Manually refreshing calendar events...');
      await loadEvents(true);
      toast.success("Calendar events refreshed");
      return events;
    } catch (error) {
      console.error('Error refreshing calendar events:', error);
      toast.error('Could not refresh calendar events');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [loadEvents, events]);

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

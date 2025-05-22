
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

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Memoize the loadEvents function to prevent recreations
  const loadEvents = useCallback(async (force = false) => {
    // Skip if we've updated in the last 5 seconds and this isn't a forced refresh
    if (!force && lastUpdateRef.current) {
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current.getTime();
      if (timeSinceLastUpdate < 5000) {
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
        console.log('Resource IDs in events:', data.map(event => event.resourceId));
        
        // Log event types to help with debugging
        console.log('Event types:', data.map(event => event.eventType));
        
        // Update the events state
        setEvents(data);
        
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

  // Fetch events initially and set up polling for updates
  useEffect(() => {
    activeRef.current = true;

    // Initial load
    loadEvents(true);

    // Set up polling every 30 seconds to fetch updates
    pollIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadEvents();
      }
    }, 30000);

    return () => {
      activeRef.current = false;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
      }
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


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

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Memoize the loadEvents function to prevent recreations
  const loadEvents = useCallback(async () => {
    try {
      console.log('Fetching calendar events...');
      setIsLoading(true);
      const data = await fetchCalendarEvents();
      if (activeRef.current) {
        console.log('Calendar events loaded successfully:', data);
        console.log('Resource IDs in events:', data.map(event => event.resourceId));
        
        // Log event types to help with debugging
        console.log('Event types:', data.map(event => event.eventType));
        
        setEvents(data);
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
    loadEvents();

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
    setCurrentDate(newDate);
    // Update both session storage and context
    sessionStorage.setItem('calendarDate', newDate.toISOString());
    setLastViewedDate(newDate);
    console.log('Calendar date set to:', newDate);
  }, [setLastViewedDate]);
  
  // Function to force refresh the calendar events - memoized
  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('Manually refreshing calendar events...');
      const data = await fetchCalendarEvents();
      console.log('Refreshed calendar events:', data);
      setEvents(data);
      
      // Update mounted state to force a re-render
      setIsMounted(prev => !prev);
      
      return data;
    } catch (error) {
      console.error('Error refreshing calendar events:', error);
      toast.error('Could not refresh calendar events');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

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

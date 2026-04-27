
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
    // Skip if we've updated in the last 3 seconds and this isn't a forced refresh
    if (!force && lastUpdateRef.current) {
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current.getTime();
      if (timeSinceLastUpdate < 3000) {
        console.log('Skipping events update, last update was', timeSinceLastUpdate, 'ms ago');
        return;
      }
    }
    
    try {
      console.log(`📅 [useCalendarEvents] loadEvents(force=${force}) starting...`);
      setIsLoading(true);
      const data = await fetchCalendarEvents();
      if (activeRef.current) {
        // Anti-flicker guard: if a non-forced poll returns dramatically fewer
        // events than we previously had (e.g. sync mid-flight), keep the
        // previous snapshot rather than blanking the UI. A forced refresh
        // (manual reload, mount, or empty initial state) always wins.
        setEvents(prev => {
          if (
            !force &&
            prev.length > 0 &&
            data.length > 0 &&
            data.length < prev.length * 0.5
          ) {
            console.warn(
              `⚠️ [useCalendarEvents] Suspicious shrink ${prev.length} → ${data.length}, keeping previous snapshot`
            );
            return prev;
          }
          if (!force && prev.length > 0 && data.length === 0) {
            console.warn(
              `⚠️ [useCalendarEvents] Empty payload while we had ${prev.length} events, keeping previous snapshot`
            );
            return prev;
          }
          console.log(`📅 [useCalendarEvents] Loaded ${data.length} events successfully`);
          return data;
        });
        lastUpdateRef.current = new Date();
      }
    } catch (error: any) {
      console.error('❌ [useCalendarEvents] Failed to load events:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
      });
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

  // Fetch events initially and set up polling for updates (read-only — no repair sync)
  useEffect(() => {
    activeRef.current = true;

    // Load existing events (read-only)
    loadEvents(true);

    // Set up polling every 45 seconds
    pollIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadEvents();
      }
    }, 45000);

    return () => {
      activeRef.current = false;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [loadEvents]);

  // Optimized handleDatesSet to only trigger when date changes significantly (more than 1 day)
  const handleDatesSet = useCallback((dateInfo: any) => {
    const newDate = dateInfo.start;
    
    // Only update if the date difference is more than 1 day
    const daysDifference = Math.abs(
      (newDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDifference < 1) {
      return;
    }
    
    console.log('Calendar date change detected, difference:', daysDifference, 'days');
    setCurrentDate(newDate);
    sessionStorage.setItem('calendarDate', newDate.toISOString());
    setLastViewedDate(newDate);
  }, [setLastViewedDate, currentDate]);
  
  // Function to force refresh the calendar events - memoized
  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('Manually refreshing calendar events...');
      await loadEvents(true);
      toast.success("Calendar events refreshed");
    } catch (error) {
      console.error('Error refreshing calendar events:', error);
      toast.error('Could not refresh calendar events');
    } finally {
      setIsLoading(false);
    }
  }, [loadEvents]);

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

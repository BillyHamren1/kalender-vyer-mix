
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEventsIncremental, getLastSyncTimestamp, deduplicateEvents } from '@/services/incrementalSyncService';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { supabase } from '@/integrations/supabase/client';

export const useIncrementalCalendarEvents = () => {
  const { lastViewedDate, setLastViewedDate } = useContext(CalendarContext);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const activeRef = useRef(true);
  const lastSyncRef = useRef<Date | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Perform initial full sync
  const performFullSync = useCallback(async () => {
    try {
      console.log('Performing full calendar sync...');
      setIsLoading(true);
      
      const fullEvents = await fetchCalendarEventsIncremental(); // No timestamp = full sync
      
      if (activeRef.current) {
        setEvents(fullEvents);
        lastSyncRef.current = new Date();
        console.log(`Full sync completed: ${fullEvents.length} events loaded`);
      }
    } catch (error) {
      console.error('Error during full sync:', error);
      if (activeRef.current) {
        toast.error('Failed to load calendar events');
      }
    } finally {
      if (activeRef.current) {
        setIsLoading(false);
        setIsMounted(true);
      }
    }
  }, []);

  // Perform incremental sync
  const performIncrementalSync = useCallback(async () => {
    try {
      const lastSync = await getLastSyncTimestamp();
      if (!lastSync) {
        console.log('No last sync timestamp found, performing full sync');
        await performFullSync();
        return;
      }

      console.log(`Performing incremental sync since ${lastSync.toISOString()}`);
      
      const newEvents = await fetchCalendarEventsIncremental(lastSync);
      
      if (activeRef.current && newEvents.length > 0) {
        setEvents(currentEvents => {
          const updatedEvents = deduplicateEvents(currentEvents, newEvents);
          console.log(`Incremental sync: ${newEvents.length} new/updated events merged`);
          return updatedEvents;
        });
        
        lastSyncRef.current = new Date();
        
        // Show toast for significant updates
        if (newEvents.length > 0) {
          toast.success(`Calendar updated`, {
            description: `${newEvents.length} event(s) updated`
          });
        }
      }
    } catch (error) {
      console.error('Error during incremental sync:', error);
      // Fallback to full sync on error
      console.log('Falling back to full sync due to error');
      await performFullSync();
    }
  }, [performFullSync]);

  // Schedule next incremental sync
  const scheduleNextSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Sync every 30 seconds when document is visible
    syncTimeoutRef.current = window.setTimeout(() => {
      if (document.visibilityState === 'visible' && activeRef.current) {
        performIncrementalSync();
        scheduleNextSync(); // Schedule the next one
      }
    }, 30000);
  }, [performIncrementalSync]);

  // Initialize calendar events
  useEffect(() => {
    activeRef.current = true;

    const initializeCalendar = async () => {
      await performFullSync();
      scheduleNextSync();
    };

    initializeCalendar();

    // Set up real-time subscription for immediate updates
    const channel = supabase
      .channel('calendar_events_realtime')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'calendar_events' 
        }, 
        (payload) => {
          console.log('Real-time calendar event change:', payload.eventType);
          // Trigger immediate incremental sync
          performIncrementalSync();
        })
      .subscribe();

    // Handle visibility change - sync when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeRef.current) {
        console.log('Tab became visible, performing incremental sync');
        performIncrementalSync();
        scheduleNextSync();
      } else if (document.visibilityState === 'hidden') {
        // Clear timeout when tab is hidden
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activeRef.current = false;
      
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [performFullSync, scheduleNextSync, performIncrementalSync]);

  // Handle date changes
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
  
  // Manual refresh function
  const refreshEvents = useCallback(async () => {
    console.log('Manual refresh requested');
    await performFullSync();
    scheduleNextSync();
    return events;
  }, [performFullSync, scheduleNextSync, events]);

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


import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { toast } from 'sonner';
import { CalendarContext } from '@/contexts/CalendarContext';
import { syncSingleBookingToCalendar } from '@/services/bookingCalendarService';
import { supabase } from '@/integrations/supabase/client';

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

  // One-time sync function to restore calendar from confirmed bookings
  const performOneTimeSync = useCallback(async () => {
    try {
      // Check if sync has already been performed
      const syncKey = 'calendar-sync-completed';
      const syncCompleted = localStorage.getItem(syncKey);
      
      if (syncCompleted === 'true') {
        console.log('One-time sync already completed, skipping...');
        return;
      }

      console.log('Starting one-time calendar sync from confirmed bookings...');
      
      // Get all confirmed bookings
      const { data: confirmedBookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'CONFIRMED');

      if (error) {
        console.error('Error fetching confirmed bookings:', error);
        return;
      }

      if (!confirmedBookings || confirmedBookings.length === 0) {
        console.log('No confirmed bookings found to sync');
        localStorage.setItem(syncKey, 'true');
        return;
      }

      console.log(`Found ${confirmedBookings.length} confirmed bookings to sync`);
      
      let syncedCount = 0;
      
      // Sync each confirmed booking to calendar
      for (const booking of confirmedBookings) {
        try {
          await syncSingleBookingToCalendar(booking.id);
          syncedCount++;
        } catch (error) {
          console.error(`Error syncing booking ${booking.id}:`, error);
        }
      }

      console.log(`Successfully synced ${syncedCount} bookings to calendar`);
      
      // Mark sync as completed
      localStorage.setItem(syncKey, 'true');
      
      if (syncedCount > 0) {
        toast.success(`Calendar restored`, {
          description: `Successfully restored ${syncedCount} confirmed bookings to the calendar`
        });
      }
      
    } catch (error) {
      console.error('Error during one-time sync:', error);
    }
  }, []);

  // Memoize the loadEvents function to prevent recreations
  const loadEvents = useCallback(async (force = false) => {
    // Skip if we've updated in the last 3 seconds (reduced from 5) and this isn't a forced refresh
    if (!force && lastUpdateRef.current) {
      const timeSinceLastUpdate = Date.now() - lastUpdateRef.current.getTime();
      if (timeSinceLastUpdate < 3000) {
        console.log('Skipping events update, last update was', timeSinceLastUpdate, 'ms ago');
        return;
      }
    }
    
    try {
      console.log('Fetching calendar events...');
      setIsLoading(true);
      const data = await fetchCalendarEvents();
      if (activeRef.current) {
        console.log('Calendar events loaded successfully:', data.length, 'events');
        setEvents(data);
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

    const initializeCalendar = async () => {
      // First load existing events
      await loadEvents(true);
      
      // Then perform one-time sync if needed
      await performOneTimeSync();
      
      // Reload events after sync
      await loadEvents(true);
    };

    // Initialize calendar
    initializeCalendar();

    // Set up polling every 45 seconds (increased from 30) to reduce load
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
  }, [loadEvents, performOneTimeSync]);

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

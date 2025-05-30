
import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';

export const useRealTimeCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  
  const mountedRef = useRef(true);

  // Enhanced refresh function with better error handling
  const refreshEvents = useCallback(async (): Promise<CalendarEvent[]> => {
    if (!mountedRef.current) {
      console.log('📴 Component unmounted, skipping refresh');
      return [];
    }

    console.log('🔄 useRealTimeCalendarEvents: Starting event refresh...');
    setIsLoading(true);
    
    try {
      const fetchedEvents = await fetchCalendarEvents();
      
      if (!mountedRef.current) {
        console.log('📴 Component unmounted during fetch, discarding results');
        return [];
      }

      console.log(`🎯 useRealTimeCalendarEvents: Successfully fetched ${fetchedEvents.length} events`);
      
      // Log event distribution for debugging
      const eventsByResource = fetchedEvents.reduce((acc, event) => {
        acc[event.resourceId] = (acc[event.resourceId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('📊 Event distribution by resource:', eventsByResource);
      
      setEvents(fetchedEvents);
      return fetchedEvents;
    } catch (error) {
      console.error('💥 useRealTimeCalendarEvents: Error fetching events:', error);
      if (mountedRef.current) {
        setEvents([]);
      }
      return [];
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    console.log('🚀 useRealTimeCalendarEvents: Initial mount, fetching events...');
    
    const loadInitialEvents = async () => {
      await refreshEvents();
      if (mountedRef.current) {
        setIsMounted(true);
        console.log('✅ useRealTimeCalendarEvents: Initial load complete');
      }
    };

    loadInitialEvents();

    return () => {
      mountedRef.current = false;
      console.log('🛑 useRealTimeCalendarEvents: Component unmounting');
    };
  }, [refreshEvents]);

  // Real-time subscription
  useEffect(() => {
    console.log('📡 Setting up real-time subscription for calendar events...');
    
    const channel = supabase
      .channel('calendar-events-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events'
        },
        async (payload) => {
          console.log('📨 Real-time event received:', payload.eventType, payload.new);
          
          if (mountedRef.current) {
            console.log('🔄 Refreshing events due to real-time update...');
            await refreshEvents();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Real-time subscription status:', status);
      });

    return () => {
      console.log('📡 Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [refreshEvents]);

  const handleDatesSet = useCallback((dateInfo: any) => {
    const newDate = startOfWeek(dateInfo.start, { weekStartsOn: 1 });
    console.log(`📅 Date changed to: ${format(newDate, 'yyyy-MM-dd')}`);
    setCurrentDate(newDate);
  }, []);

  console.log(`📋 useRealTimeCalendarEvents: Current state - ${events.length} events, loading: ${isLoading}, mounted: ${isMounted}`);

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

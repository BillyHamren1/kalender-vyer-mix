
import { useState, useEffect, useContext } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { supabase } from '@/integrations/supabase/client';

export const useCalendarEvents = () => {
  const { lastViewedDate, setLastViewedDate } = useContext(CalendarContext);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Load events from cache initially if available
  useEffect(() => {
    const cachedEvents = sessionStorage.getItem('calendarEvents');
    if (cachedEvents) {
      try {
        const parsedEvents = JSON.parse(cachedEvents);
        console.log('Loaded events from cache initially:', parsedEvents.length);
        setEvents(parsedEvents);
        setIsLoading(false);
      } catch (error) {
        console.error('Error parsing cached events:', error);
      }
    }
  }, []);

  // Initial fetch of events
  useEffect(() => {
    let active = true;

    const loadEvents = async () => {
      try {
        console.log('Fetching calendar events...');
        const data = await fetchCalendarEvents();
        if (active) {
          console.log('Calendar events loaded successfully:', data);
          
          // Store in session storage for fast loading on subsequent visits
          sessionStorage.setItem('calendarEvents', JSON.stringify(data));
          
          setEvents(data);
          setIsFirstLoad(false);
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

    // Only fetch from API if we don't have cached data or this is an explicit refresh
    if (isFirstLoad && events.length === 0) {
      loadEvents();
    } else {
      setIsLoading(false);
      setIsMounted(true);
    }

    return () => {
      active = false;
    };
  }, [isFirstLoad, events.length]);

  // Set up real-time subscription to calendar events
  useEffect(() => {
    if (!isMounted) return;

    console.log('Setting up real-time subscription for calendar events');
    
    const channel = supabase
      .channel('calendar-events-subscription')
      .on('postgres_changes', 
        { 
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public', 
          table: 'calendar_events' 
        }, 
        (payload) => {
          console.log('Real-time update received for calendar event:', payload);
          
          // Update our local state based on the database change
          if (payload.eventType === 'INSERT') {
            const newEvent = transformDatabaseEvent(payload.new);
            setEvents(prev => [...prev, newEvent]);
          } 
          else if (payload.eventType === 'UPDATE') {
            const updatedEvent = transformDatabaseEvent(payload.new);
            setEvents(prev => 
              prev.map(event => event.id === updatedEvent.id ? updatedEvent : event)
            );
          } 
          else if (payload.eventType === 'DELETE') {
            setEvents(prev => 
              prev.filter(event => event.id !== payload.old.id)
            );
          }
        })
      .subscribe();
      
    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isMounted]);

  // Transform database record to calendar event
  const transformDatabaseEvent = (dbEvent: any): CalendarEvent => {
    // Map resource_id to format expected by the UI
    const resourceIdMap: Record<string, string> = {
      'a': 'team-1',
      'b': 'team-2',
      'c': 'team-3',
      'd': 'team-4',
      'e': 'team-5',
      'f': 'team-6',
      'g': 'team-7',
      'h': 'team-8',
      'i': 'team-9',
      'j': 'team-10'
    };
    
    // Map database resource ID to application format
    const resourceId = dbEvent.resource_id.startsWith('team-') 
      ? dbEvent.resource_id 
      : resourceIdMap[dbEvent.resource_id] || `team-${dbEvent.resource_id}`;
    
    const eventType = dbEvent.event_type as 'rig' | 'event' | 'rigDown';
    
    // Get event color based on type
    const getEventColor = (type: 'rig' | 'event' | 'rigDown') => {
      switch(type) {
        case 'rig': return '#F2FCE2';
        case 'event': return '#FEF7CD';
        case 'rigDown': return '#FFDEE2';
        default: return '#E2F5FC';
      }
    };
    
    return {
      id: dbEvent.id,
      resourceId: resourceId,
      title: dbEvent.title,
      start: dbEvent.start_time,
      end: dbEvent.end_time,
      eventType: eventType,
      bookingId: dbEvent.booking_id,
      color: getEventColor(eventType),
      className: dbEvent.booking_id && !dbEvent.viewed ? 'new-booking-event' : ''
    };
  };

  const handleDatesSet = (dateInfo: any) => {
    const newDate = dateInfo.start;
    setCurrentDate(newDate);
    // Update both session storage and context
    sessionStorage.setItem('calendarDate', newDate.toISOString());
    setLastViewedDate(newDate);
    console.log('Calendar date set to:', newDate);
  };
  
  // Function to force refresh the calendar events
  const refreshEvents = async () => {
    setIsLoading(true);
    try {
      console.log('Manually refreshing calendar events...');
      const data = await fetchCalendarEvents();
      console.log('Refreshed calendar events:', data);
      
      // Update cached data
      sessionStorage.setItem('calendarEvents', JSON.stringify(data));
      
      setEvents(data);
      toast.success('Calendar refreshed successfully');
    } catch (error) {
      console.error('Error refreshing calendar events:', error);
      toast.error('Could not refresh calendar events');
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

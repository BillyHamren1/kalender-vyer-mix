
import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useDayCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const storedDate = sessionStorage.getItem('dayCalendarDate');
    return storedDate ? new Date(storedDate) : new Date();
  });

  // Initial fetch of events
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('calendar_events')
          .select('*');

        if (error) {
          throw error;
        }

        if (data) {
          const formattedEvents: CalendarEvent[] = data.map(event => ({
            id: event.id,
            resourceId: event.resource_id,
            title: event.title,
            start: event.start_time,
            end: event.end_time,
            eventType: event.event_type as 'rig' | 'event' | 'rigDown',
            bookingId: event.booking_id || undefined,
            color: getEventColor(event.event_type as 'rig' | 'event' | 'rigDown')
          }));
          
          setEvents(formattedEvents);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
        toast.error('Failed to load calendar events');
      } finally {
        setIsLoading(false);
        setIsMounted(true);
      }
    };

    fetchEvents();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('calendar_events_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'calendar_events' 
        }, 
        (payload) => {
          // Update events when database changes
          fetchEvents();
        })
      .subscribe();

    return () => {
      setIsMounted(false);
      supabase.removeChannel(channel);
    };
  }, []);

  // Helper function to get event color based on type
  const getEventColor = (eventType: 'rig' | 'event' | 'rigDown') => {
    switch(eventType) {
      case 'rig':
        return '#F2FCE2';
      case 'event':
        return '#FEF7CD';
      case 'rigDown':
        return '#FFDEE2';
      default:
        return '#E2F5FC';
    }
  };

  // Handle event updates (for drag & drop, resize)
  const updateEvent = async (updatedEvent: CalendarEvent) => {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          title: updatedEvent.title,
          start_time: updatedEvent.start,
          end_time: updatedEvent.end,
          resource_id: updatedEvent.resourceId,
          event_type: updatedEvent.eventType
        })
        .eq('id', updatedEvent.id);

      if (error) {
        throw error;
      }

      toast.success('Event updated successfully');
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  // Handle date changes
  const handleDatesSet = (dateInfo: any) => {
    setCurrentDate(dateInfo.start);
    sessionStorage.setItem('dayCalendarDate', dateInfo.start.toISOString());
  };

  return {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    updateEvent
  };
};

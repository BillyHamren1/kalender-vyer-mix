
import { useState, useEffect } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapDatabaseToAppResourceId, mapAppToDatabaseResourceId } from '@/services/eventService';

export const useDayCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const storedDate = sessionStorage.getItem('dayCalendarDate');
    return storedDate ? new Date(storedDate) : new Date();
  });

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

  // Initial fetch of events
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        console.log('Fetching calendar events from Supabase...');
        
        const { data, error } = await supabase
          .from('calendar_events')
          .select('*');

        if (error) {
          throw error;
        }

        if (data) {
          console.log('Calendar events data from Supabase:', data);
          
          // Process events with addresses
          const processedEvents = [];
          
          for (const event of data) {
            // Map the database resource_id to the application's resource ID format
            const mappedResourceId = mapDatabaseToAppResourceId(event.resource_id);
            
            // If the event has a booking_id, fetch the booking to get the address
            let deliveryAddress = 'No address provided';
            
            if (event.booking_id) {
              try {
                const { data: bookingData } = await supabase
                  .from('bookings')
                  .select('deliveryaddress, delivery_city')
                  .eq('id', event.booking_id)
                  .single();
                
                if (bookingData) {
                  // Format the address to only include street address and city
                  if (bookingData.deliveryaddress) {
                    deliveryAddress = bookingData.deliveryaddress;
                    if (bookingData.delivery_city) {
                      deliveryAddress += `, ${bookingData.delivery_city}`;
                    }
                  }
                }
              } catch (bookingError) {
                console.warn(`Could not fetch address for booking ${event.booking_id}:`, bookingError);
              }
            }
            
            processedEvents.push({
              id: event.id,
              resourceId: mappedResourceId,
              title: event.title,
              start: event.start_time,
              end: event.end_time,
              eventType: (event.event_type as 'rig' | 'event' | 'rigDown') || 'event',
              bookingId: event.booking_id || undefined,
              color: getEventColor((event.event_type as 'rig' | 'event' | 'rigDown') || 'event'),
              deliveryAddress: deliveryAddress,
              customer: deliveryAddress // Use this field as it may be used by some components
            });
          }
          
          console.log('Formatted events for calendar with mapped resource IDs:', processedEvents);
          setEvents(processedEvents);
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
          console.log('Real-time update received:', payload);
          // Update events when database changes
          fetchEvents();
        })
      .subscribe();

    return () => {
      setIsMounted(false);
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle event updates (for drag & drop, resize)
  const updateEvent = async (updatedEvent: CalendarEvent) => {
    try {
      console.log('Updating event in Supabase:', updatedEvent);
      
      // Convert application resourceId back to database format
      const databaseResourceId = mapAppToDatabaseResourceId(updatedEvent.resourceId);
      
      const { error } = await supabase
        .from('calendar_events')
        .update({
          title: updatedEvent.title,
          start_time: updatedEvent.start,
          end_time: updatedEvent.end,
          resource_id: databaseResourceId, // Use the reverse-mapped resource ID
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
    console.log('Date set in calendar:', dateInfo.start);
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

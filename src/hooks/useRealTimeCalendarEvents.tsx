
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents, mapDatabaseToAppResourceId } from '@/services/eventService';
import { smartUpdateBookingCalendar } from '@/services/bookingCalendarService';
import { fixAllEventTitles } from '@/services/eventTitleFixService';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { supabase } from '@/integrations/supabase/client';

export const useRealTimeCalendarEvents = () => {
  const { lastViewedDate, setLastViewedDate } = useContext(CalendarContext);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const activeRef = useRef(true);

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Enhanced event loading with better data mapping
  const loadEvents = useCallback(async () => {
    try {
      console.log('Loading calendar events...');
      setIsLoading(true);
      
      const calendarEvents = await fetchCalendarEvents();
      
      if (activeRef.current) {
        // Enhance events with booking data for better hover information
        const enhancedEvents = await Promise.all(
          calendarEvents.map(async (event) => {
            console.log('Processing event:', event.id, 'with booking ID:', event.bookingId);
            
            if (event.bookingId) {
              try {
                // Fetch booking details for enhanced hover data including project info
                const { data: booking } = await supabase
                  .from('bookings')
                  .select(`
                    *,
                    booking_products (
                      name,
                      quantity,
                      notes
                    )
                  `)
                  .eq('id', event.bookingId)
                  .single();

                if (booking) {
                  console.log('Enhanced event with booking data:', {
                    eventId: event.id,
                    bookingNumber: booking.booking_number,
                    deliveryCity: booking.delivery_city,
                    projectName: booking.assigned_project_name
                  });

                  return {
                    ...event,
                    bookingNumber: booking.booking_number,
                    extendedProps: {
                      ...event.extendedProps,
                      client: booking.client,
                      deliveryAddress: booking.deliveryaddress,
                      deliveryCity: booking.delivery_city,
                      deliveryPostalCode: booking.delivery_postal_code,
                      exactTimeNeeded: booking.exact_time_needed,
                      exactTimeInfo: booking.exact_time_info,
                      internalNotes: booking.internalnotes,
                      carryMoreThan10m: booking.carry_more_than_10m,
                      groundNailsAllowed: booking.ground_nails_allowed,
                      products: booking.booking_products || [],
                      bookingNumber: booking.booking_number,
                      booking_id: booking.id,
                      assignedProjectId: booking.assigned_project_id,
                      assignedProjectName: booking.assigned_project_name,
                      assignedToProject: booking.assigned_to_project
                    }
                  };
                }
              } catch (error) {
                console.warn(`Failed to fetch booking details for event ${event.id}:`, error);
              }
            }
            return event;
          })
        );

        setEvents(enhancedEvents);
        console.log(`Loaded ${enhancedEvents.length} calendar events with enhanced data`);
        
        // Check if we need to fix any titles (only run once per session)
        const titleFixKey = 'title-fix-attempted';
        if (!sessionStorage.getItem(titleFixKey)) {
          console.log('Checking if event titles need fixing...');
          
          const hasUuidTitles = enhancedEvents.some(event => 
            event.title && event.title.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
          );
          
          if (hasUuidTitles) {
            console.log('Found events with UUID titles, attempting to fix...');
            try {
              await fixAllEventTitles();
              const updatedEvents = await fetchCalendarEvents();
              if (activeRef.current) {
                setEvents(updatedEvents);
              }
            } catch (error) {
              console.error('Error fixing event titles:', error);
            }
          }
          
          sessionStorage.setItem(titleFixKey, 'true');
        }
      }
    } catch (error) {
      console.error('Error loading calendar events:', error);
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

  // Enhanced real-time calendar event handler
  const handleCalendarEventChange = useCallback((payload: any) => {
    console.log('Real-time calendar event change:', payload.eventType);
    
    if (!activeRef.current) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    setEvents(currentEvents => {
      let updatedEvents = [...currentEvents];
      
      switch (eventType) {
        case 'INSERT':
          if (newRecord && !updatedEvents.find(e => e.id === newRecord.id)) {
            const newEvent: CalendarEvent = {
              id: newRecord.id,
              resourceId: newRecord.resource_id,
              title: newRecord.title,
              start: newRecord.start_time,
              end: newRecord.end_time,
              eventType: newRecord.event_type as 'rig' | 'event' | 'rigDown',
              bookingId: newRecord.booking_id || '',
              bookingNumber: newRecord.booking_number || newRecord.booking_id || 'No ID',
              deliveryAddress: newRecord.delivery_address || 'No address provided',
              extendedProps: {
                bookingId: newRecord.booking_id,
                booking_id: newRecord.booking_id,
                resourceId: newRecord.resource_id,
                deliveryAddress: newRecord.delivery_address,
                bookingNumber: newRecord.booking_number,
                eventType: newRecord.event_type,
                deliveryCity: newRecord.delivery_city
              }
            };
            updatedEvents.push(newEvent);
            console.log('Added new event:', newEvent.title, 'to team:', newEvent.resourceId);
          }
          break;
          
        case 'UPDATE':
          if (newRecord) {
            const index = updatedEvents.findIndex(e => e.id === newRecord.id);
            if (index !== -1) {
              updatedEvents[index] = {
                ...updatedEvents[index],
                id: newRecord.id,
                resourceId: newRecord.resource_id,
                title: newRecord.title,
                start: newRecord.start_time,
                end: newRecord.end_time,
                eventType: newRecord.event_type as 'rig' | 'event' | 'rigDown',
                bookingId: newRecord.booking_id || '',
                bookingNumber: newRecord.booking_number || newRecord.booking_id || 'No ID',
                deliveryAddress: newRecord.delivery_address || 'No address provided',
                extendedProps: {
                  ...updatedEvents[index].extendedProps,
                  bookingId: newRecord.booking_id,
                  booking_id: newRecord.booking_id,
                  resourceId: newRecord.resource_id,
                  deliveryAddress: newRecord.delivery_address,
                  bookingNumber: newRecord.booking_number,
                  eventType: newRecord.event_type,
                  deliveryCity: newRecord.delivery_city
                }
              };
              console.log('Updated event:', newRecord.title, 'moved to team:', updatedEvents[index].resourceId);
            }
          }
          break;
          
        case 'DELETE':
          if (oldRecord) {
            updatedEvents = updatedEvents.filter(e => e.id !== oldRecord.id);
            console.log('Removed event:', oldRecord.title);
          }
          break;
      }
      
      return updatedEvents;
    });
  }, []);

  // Handle real-time booking changes with smart calendar updates
  const handleBookingChange = useCallback(async (payload: any) => {
    console.log('Real-time booking change:', payload.eventType);
    
    if (!activeRef.current) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    try {
      if (eventType === 'UPDATE' && newRecord && oldRecord) {
        // Use smart update to handle calendar changes only when necessary
        await smartUpdateBookingCalendar(newRecord.id, oldRecord, newRecord);
        
        // Show appropriate user feedback
        if (newRecord.status === 'CONFIRMED' && oldRecord.status !== 'CONFIRMED') {
          toast.success('Booking confirmed and added to calendar');
        } else if (oldRecord.status === 'CONFIRMED' && newRecord.status !== 'CONFIRMED') {
          toast.info('Booking events removed from calendar');
        } else if (newRecord.status === 'CONFIRMED' && (
          oldRecord.rigdaydate !== newRecord.rigdaydate ||
          oldRecord.eventdate !== newRecord.eventdate ||
          oldRecord.rigdowndate !== newRecord.rigdowndate
        )) {
          toast.success('Booking dates updated in calendar');
        }
      } else if (eventType === 'INSERT' && newRecord?.status === 'CONFIRMED') {
        console.log(`New confirmed booking ${newRecord.id} created, syncing to calendar...`);
        await smartUpdateBookingCalendar(newRecord.id, {}, newRecord);
        toast.success('New confirmed booking added to calendar');
      } else if (eventType === 'DELETE' && oldRecord?.status === 'CONFIRMED') {
        console.log(`Confirmed booking ${oldRecord.id} deleted, removing from calendar...`);
        await smartUpdateBookingCalendar(oldRecord.id, oldRecord, { status: 'DELETED' });
        toast.info('Deleted booking events removed from calendar');
      }
    } catch (error) {
      console.error('Error handling booking change:', error);
      toast.error('Failed to sync booking changes to calendar');
    }
  }, []);

  // Initialize calendar events and set up real-time subscriptions
  useEffect(() => {
    activeRef.current = true;

    // Load initial events
    loadEvents();

    // Set up real-time subscription for calendar events
    const calendarChannel = supabase
      .channel('calendar_events_realtime')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'calendar_events' 
        }, 
        handleCalendarEventChange)
      .subscribe();

    // Set up real-time subscription for booking changes
    const bookingChannel = supabase
      .channel('bookings_realtime')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'bookings' 
        }, 
        handleBookingChange)
      .subscribe();

    console.log('Real-time subscriptions established');

    return () => {
      activeRef.current = false;
      supabase.removeChannel(calendarChannel);
      supabase.removeChannel(bookingChannel);
      console.log('Real-time subscriptions cleaned up');
    };
  }, [loadEvents, handleCalendarEventChange, handleBookingChange]);

  // Handle date changes
  const handleDatesSet = useCallback((dateInfo: any) => {
    const newDate = dateInfo.start;
    
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
    await loadEvents();
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

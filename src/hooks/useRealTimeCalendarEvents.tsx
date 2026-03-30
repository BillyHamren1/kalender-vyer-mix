

import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { convertToISO8601 } from '@/utils/dateUtils';
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

  // Enhanced event loading with batch fetching (replaces N+1 queries)
  const loadEvents = useCallback(async () => {
    try {
      // Load events silently
      setIsLoading(true);
      
      const calendarEvents = await fetchCalendarEvents();
      
      if (activeRef.current) {
        // Collect all booking IDs for batch fetching (instead of N+1 queries)
        const bookingIds = calendarEvents
          .filter(e => e.bookingId)
          .map(e => e.bookingId);
        
        const uniqueBookingIds = [...new Set(bookingIds)];
        
        
        // Single batch query for all bookings
        let bookingMap = new Map<string, any>();
        if (uniqueBookingIds.length > 0) {
          const { data: bookings, error } = await supabase
            .from('bookings')
            .select(`
              id, client, booking_number, deliveryaddress, delivery_city, 
              delivery_postal_code, exact_time_needed, exact_time_info,
              internalnotes, carry_more_than_10m, ground_nails_allowed,
              assigned_project_id, assigned_project_name, assigned_to_project,
              status, large_project_id,
              booking_products (name, quantity, notes)
            `)
            .in('id', uniqueBookingIds);
          
          if (error) {
            console.error('Error batch fetching bookings:', error);
          } else {
            bookingMap = new Map(bookings?.map(b => [b.id, b]) || []);
          }
        }
        
        // Batch-fetch large project names
        const largeProjectIds = [...new Set(
          [...bookingMap.values()]
            .filter(b => b.large_project_id)
            .map(b => b.large_project_id)
        )];
        
        let largeProjectMap = new Map<string, string>();
        if (largeProjectIds.length > 0) {
          const { data: projects, error: lpError } = await supabase
            .from('large_projects')
            .select('id, name')
            .in('id', largeProjectIds);
          
          if (lpError) {
            console.error('Error fetching large projects:', lpError);
          } else {
            largeProjectMap = new Map(projects?.map(p => [p.id, p.name]) || []);
          }
        }
        
        // Enhance events using the pre-fetched booking data (no async, pure map)
        const enhancedEvents = calendarEvents.map(event => {
          if (event.bookingId && bookingMap.has(event.bookingId)) {
            const booking = bookingMap.get(event.bookingId);
            return {
              ...event,
              bookingNumber: booking.booking_number,
              bookingStatus: booking.status,
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
                bookingStatus: booking.status,
                assignedProjectId: booking.assigned_project_id,
                assignedProjectName: booking.assigned_project_name,
                assignedToProject: booking.assigned_to_project
              }
            };
          }
          return event;
        });

        setEvents(enhancedEvents);
        
        
        // Check if we need to fix any titles (only run once per session)
        const titleFixKey = 'title-fix-attempted';
        if (!sessionStorage.getItem(titleFixKey)) {
          
          
          const hasUuidTitles = enhancedEvents.some(event => 
            event.title && event.title.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
          );
          
          if (hasUuidTitles) {
            
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

  // Real-time calendar event handler (read-only: reacts to DB changes pushed by backend)
  const handleCalendarEventChange = useCallback((payload: any) => {
    if (!activeRef.current) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    setEvents(currentEvents => {
      let updatedEvents = [...currentEvents];
      
      switch (eventType) {
        case 'INSERT':
          // Deduplication guard: check by ID AND by booking_id+event_type combo
          if (newRecord) {
            const alreadyExistsById = updatedEvents.some(e => e.id === newRecord.id);
            const alreadyExistsByBooking = newRecord.booking_id && newRecord.event_type
              ? updatedEvents.some(e => e.bookingId === newRecord.booking_id && e.eventType === newRecord.event_type)
              : false;

            if (!alreadyExistsById && !alreadyExistsByBooking) {
              const newEvent: CalendarEvent = {
                id: newRecord.id,
                resourceId: newRecord.resource_id,
                title: newRecord.title,
                start: convertToISO8601(newRecord.start_time),
                end: convertToISO8601(newRecord.end_time),
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
            }
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
                start: convertToISO8601(newRecord.start_time),
                end: convertToISO8601(newRecord.end_time),
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
            }
          }
          break;
          
        case 'DELETE':
          if (oldRecord) {
            updatedEvents = updatedEvents.filter(e => e.id !== oldRecord.id);
          }
          break;
      }
      
      return updatedEvents;
    });
  }, []);

  // Initialize calendar events and set up real-time subscriptions
  useEffect(() => {
    activeRef.current = true;

    // Load initial events (read-only — no repair/sync)
    loadEvents();

    // Set up real-time subscription for calendar events (read-only reactions to backend changes)
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

    console.log('Real-time calendar subscription established (read-only mode)');

    return () => {
      activeRef.current = false;
      supabase.removeChannel(calendarChannel);
      console.log('Real-time subscriptions cleaned up');
    };
  }, [loadEvents, handleCalendarEventChange]);

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

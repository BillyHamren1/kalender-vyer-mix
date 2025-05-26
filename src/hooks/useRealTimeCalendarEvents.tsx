
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
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

  // Load initial events
  const loadEvents = useCallback(async () => {
    try {
      console.log('Loading calendar events...');
      setIsLoading(true);
      
      const calendarEvents = await fetchCalendarEvents();
      
      if (activeRef.current) {
        setEvents(calendarEvents);
        console.log(`Loaded ${calendarEvents.length} calendar events`);
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

  // Handle real-time calendar event changes
  const handleCalendarEventChange = useCallback((payload: any) => {
    console.log('Real-time calendar event change:', payload.eventType);
    
    if (!activeRef.current) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    setEvents(currentEvents => {
      let updatedEvents = [...currentEvents];
      
      switch (eventType) {
        case 'INSERT':
          // Add new event if it doesn't already exist
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
              deliveryAddress: newRecord.delivery_address || 'No address provided'
            };
            updatedEvents.push(newEvent);
            console.log('Added new event:', newEvent.title);
          }
          break;
          
        case 'UPDATE':
          // Update existing event
          if (newRecord) {
            const index = updatedEvents.findIndex(e => e.id === newRecord.id);
            if (index !== -1) {
              updatedEvents[index] = {
                id: newRecord.id,
                resourceId: newRecord.resource_id,
                title: newRecord.title,
                start: newRecord.start_time,
                end: newRecord.end_time,
                eventType: newRecord.event_type as 'rig' | 'event' | 'rigDown',
                bookingId: newRecord.booking_id || '',
                bookingNumber: newRecord.booking_number || newRecord.booking_id || 'No ID',
                deliveryAddress: newRecord.delivery_address || 'No address provided'
              };
              console.log('Updated event:', newRecord.title);
            }
          }
          break;
          
        case 'DELETE':
          // Remove deleted event
          if (oldRecord) {
            updatedEvents = updatedEvents.filter(e => e.id !== oldRecord.id);
            console.log('Removed event:', oldRecord.title);
          }
          break;
      }
      
      return updatedEvents;
    });
  }, []);

  // Handle real-time booking changes that might affect calendar events
  const handleBookingChange = useCallback((payload: any) => {
    console.log('Real-time booking change:', payload.eventType);
    
    if (!activeRef.current) return;

    // For booking changes, we'll do a simple refresh to ensure consistency
    // This is safer than trying to guess which events are affected
    const { eventType, new: newRecord } = payload;
    
    if (eventType === 'UPDATE' && newRecord) {
      // Check if the booking status changed to/from CONFIRMED
      // Only refresh if this might affect calendar visibility
      console.log('Booking updated, refreshing events to maintain consistency');
      loadEvents();
    }
  }, [loadEvents]);

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
          event: 'UPDATE', 
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
    await loadEvents();
    return events;
  }, [loadEvents, events]);

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

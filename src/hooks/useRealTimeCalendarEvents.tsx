
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { StaffAssignmentSyncService } from '@/services/staffAssignmentSyncService';
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

  // Load initial events - NO MORE AUTOMATIC SYNC
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
  const handleCalendarEventChange = useCallback(async (payload: any) => {
    console.log('Real-time calendar event change:', payload.eventType);
    
    if (!activeRef.current) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Sync staff assignments when calendar events change
    try {
      if (eventType === 'INSERT' && newRecord?.booking_id) {
        console.log('Calendar event inserted, syncing staff assignments...');
        await StaffAssignmentSyncService.syncCalendarEventStaffAssignments(newRecord.id);
      } else if (eventType === 'UPDATE' && newRecord?.booking_id) {
        console.log('Calendar event updated, syncing staff assignments...');
        await StaffAssignmentSyncService.syncCalendarEventStaffAssignments(newRecord.id);
      } else if (eventType === 'DELETE' && oldRecord?.booking_id) {
        console.log('Calendar event deleted, resyncing booking staff assignments...');
        await StaffAssignmentSyncService.syncBookingStaffAssignments(oldRecord.booking_id);
      }
    } catch (error) {
      console.error('Error syncing staff assignments:', error);
    }
    
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

  // Handle real-time booking changes - UPDATE EXISTING EVENTS, DON'T CREATE NEW ONES
  const handleBookingChange = useCallback(async (payload: any) => {
    console.log('Real-time booking change:', payload.eventType);
    
    if (!activeRef.current) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    try {
      if (eventType === 'UPDATE') {
        // Check if status changed to CONFIRMED
        if (newRecord?.status === 'CONFIRMED' && oldRecord?.status !== 'CONFIRMED') {
          console.log(`Booking ${newRecord.id} was confirmed, but checking for existing events first...`);
          
          // Check if events already exist for this booking
          const { data: existingEvents } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('booking_id', newRecord.id);
          
          if (existingEvents && existingEvents.length > 0) {
            console.log(`Booking ${newRecord.id} already has ${existingEvents.length} calendar events - SKIPPING sync to prevent duplicates`);
            return;
          }
          
          // Only sync if no events exist
          const { syncSingleBookingToCalendar } = await import('@/services/bookingToCalendarSync');
          await syncSingleBookingToCalendar(newRecord.id);
          toast.success('Booking confirmed and added to calendar');
        }
        // Check if status changed from CONFIRMED to something else
        else if (oldRecord?.status === 'CONFIRMED' && newRecord?.status !== 'CONFIRMED') {
          console.log(`Booking ${newRecord.id} status changed from confirmed, removing from calendar...`);
          const { removeBookingEventsFromCalendar } = await import('@/services/bookingToCalendarSync');
          await removeBookingEventsFromCalendar(newRecord.id);
          toast.info('Booking events removed from calendar');
        }
        // Check if dates changed for a confirmed booking - UPDATE existing events
        else if (newRecord?.status === 'CONFIRMED' && (
          oldRecord?.rigdaydate !== newRecord?.rigdaydate ||
          oldRecord?.eventdate !== newRecord?.eventdate ||
          oldRecord?.rigdowndate !== newRecord?.rigdowndate
        )) {
          console.log(`Confirmed booking ${newRecord.id} dates changed, updating existing calendar events...`);
          
          // Get existing events and update them instead of recreating
          const { data: existingEvents } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('booking_id', newRecord.id);
          
          if (existingEvents && existingEvents.length > 0) {
            // Update existing events with new dates
            for (const event of existingEvents) {
              let newDate = null;
              if (event.event_type === 'rig' && newRecord.rigdaydate) {
                newDate = newRecord.rigdaydate;
              } else if (event.event_type === 'event' && newRecord.eventdate) {
                newDate = newRecord.eventdate;
              } else if (event.event_type === 'rigDown' && newRecord.rigdowndate) {
                newDate = newRecord.rigdowndate;
              }
              
              if (newDate) {
                const startTime = new Date(newDate);
                startTime.setHours(8, 0, 0, 0);
                const endTime = new Date(newDate);
                endTime.setHours(event.event_type === 'event' ? 11 : 12, 0, 0, 0);
                
                await supabase
                  .from('calendar_events')
                  .update({
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString(),
                    title: `${event.event_type === 'rig' ? 'Rig Day' : event.event_type === 'event' ? 'Event' : 'Rig Down'} - ${newRecord.client}`,
                    delivery_address: [newRecord.deliveryaddress, newRecord.delivery_city].filter(Boolean).join(', ') || 'No address provided'
                  })
                  .eq('id', event.id);
              }
            }
            toast.success('Booking dates updated in calendar');
          }
        }
      }
      // For new confirmed bookings, check for duplicates first
      else if (eventType === 'INSERT' && newRecord?.status === 'CONFIRMED') {
        console.log(`New confirmed booking ${newRecord.id} created, checking for existing events...`);
        
        const { data: existingEvents } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('booking_id', newRecord.id);
        
        if (existingEvents && existingEvents.length > 0) {
          console.log(`New booking ${newRecord.id} already has ${existingEvents.length} calendar events - SKIPPING to prevent duplicates`);
          return;
        }
        
        const { syncSingleBookingToCalendar } = await import('@/services/bookingToCalendarSync');
        await syncSingleBookingToCalendar(newRecord.id);
        toast.success('New confirmed booking added to calendar');
      }
      else if (eventType === 'DELETE' && oldRecord?.status === 'CONFIRMED') {
        console.log(`Confirmed booking ${oldRecord.id} deleted, removing from calendar...`);
        const { removeBookingEventsFromCalendar } = await import('@/services/bookingToCalendarSync');
        await removeBookingEventsFromCalendar(oldRecord.id);
        toast.info('Deleted booking events removed from calendar');
      }
    } catch (error) {
      console.error('Error handling booking change:', error);
      toast.error('Failed to sync booking changes to calendar');
    }
  }, []);

  // Handle real-time staff assignment changes
  const handleStaffAssignmentChange = useCallback(async (payload: any) => {
    console.log('Real-time staff assignment change:', payload.eventType);
    
    if (!activeRef.current) return;

    try {
      // When staff assignments change, we need to update booking staff assignments
      console.log('Staff assignment changed, resyncing all staff assignments...');
      await StaffAssignmentSyncService.syncStaffAssignments();
    } catch (error) {
      console.error('Error handling staff assignment change:', error);
    }
  }, []);

  // Initialize calendar events and set up real-time subscriptions
  useEffect(() => {
    activeRef.current = true;

    // Load initial events - NO automatic sync anymore
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

    // Set up real-time subscription for staff assignment changes
    const staffAssignmentChannel = supabase
      .channel('staff_assignments_realtime')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'staff_assignments' 
        }, 
        handleStaffAssignmentChange)
      .subscribe();

    console.log('Real-time subscriptions established');

    return () => {
      activeRef.current = false;
      supabase.removeChannel(calendarChannel);
      supabase.removeChannel(bookingChannel);
      supabase.removeChannel(staffAssignmentChannel);
      console.log('Real-time subscriptions cleaned up');
    };
  }, [loadEvents, handleCalendarEventChange, handleBookingChange, handleStaffAssignmentChange]);

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

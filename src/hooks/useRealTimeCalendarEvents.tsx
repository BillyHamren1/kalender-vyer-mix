
import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { fetchCalendarEvents } from '@/services/eventService';
import { syncConfirmedBookingsToCalendar, syncSingleBookingToCalendar, removeBookingEventsFromCalendar } from '@/services/bookingToCalendarSync';
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
  const [syncCompleted, setSyncCompleted] = useState(false);

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Load initial events and sync bookings
  const loadEvents = useCallback(async () => {
    try {
      console.log('Loading calendar events...');
      setIsLoading(true);
      
      // First sync confirmed bookings to calendar if not done yet
      if (!syncCompleted) {
        console.log('Syncing confirmed bookings to calendar...');
        const syncedCount = await syncConfirmedBookingsToCalendar();
        if (syncedCount > 0) {
          toast.success(`Synced ${syncedCount} booking events to calendar`);
        }
        setSyncCompleted(true);
      }
      
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
  }, [syncCompleted]);

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

  // Handle real-time booking changes that might affect calendar events
  const handleBookingChange = useCallback(async (payload: any) => {
    console.log('Real-time booking change:', payload.eventType);
    
    if (!activeRef.current) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    try {
      if (eventType === 'UPDATE') {
        // Check if status changed to CONFIRMED
        if (newRecord?.status === 'CONFIRMED' && oldRecord?.status !== 'CONFIRMED') {
          console.log(`Booking ${newRecord.id} was confirmed, syncing to calendar...`);
          await syncSingleBookingToCalendar(newRecord.id);
          toast.success('Booking confirmed and added to calendar');
        }
        // Check if status changed from CONFIRMED to something else
        else if (oldRecord?.status === 'CONFIRMED' && newRecord?.status !== 'CONFIRMED') {
          console.log(`Booking ${newRecord.id} status changed from confirmed, removing from calendar...`);
          await removeBookingEventsFromCalendar(newRecord.id);
          toast.info('Booking events removed from calendar');
        }
        // Check if dates changed for a confirmed booking
        else if (newRecord?.status === 'CONFIRMED' && (
          oldRecord?.rigdaydate !== newRecord?.rigdaydate ||
          oldRecord?.eventdate !== newRecord?.eventdate ||
          oldRecord?.rigdowndate !== newRecord?.rigdowndate
        )) {
          console.log(`Confirmed booking ${newRecord.id} dates changed, updating calendar...`);
          // Remove old events and create new ones
          await removeBookingEventsFromCalendar(newRecord.id);
          await syncSingleBookingToCalendar(newRecord.id);
          toast.success('Booking dates updated in calendar');
        }
      }
      else if (eventType === 'INSERT' && newRecord?.status === 'CONFIRMED') {
        console.log(`New confirmed booking ${newRecord.id} created, syncing to calendar...`);
        await syncSingleBookingToCalendar(newRecord.id);
        toast.success('New confirmed booking added to calendar');
      }
      else if (eventType === 'DELETE' && oldRecord?.status === 'CONFIRMED') {
        console.log(`Confirmed booking ${oldRecord.id} deleted, removing from calendar...`);
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

    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    try {
      // When staff assignments change, we need to update booking staff assignments
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        console.log('Staff assignment changed, resyncing all staff assignments...');
        await StaffAssignmentSyncService.syncStaffAssignments();
      } else if (eventType === 'DELETE') {
        console.log('Staff assignment deleted, resyncing all staff assignments...');
        await StaffAssignmentSyncService.syncStaffAssignments();
      }
    } catch (error) {
      console.error('Error handling staff assignment change:', error);
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

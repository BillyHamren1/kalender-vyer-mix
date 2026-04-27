

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
  const reloadTimerRef = useRef<number | null>(null);

  // Initialize currentDate from context, sessionStorage, or default to today
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (lastViewedDate) return lastViewedDate;
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : new Date();
  });

  // Enhanced event loading with batch fetching (replaces N+1 queries)
  const loadEvents = useCallback(async (force = false) => {
    try {
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
                assignedToProject: booking.assigned_to_project,
                largeProjectId: booking.large_project_id
              }
            };
          }
          return event;
        });

        // Consolidate large project events: group by (large_project_id, event_type, source_date)
        const consolidatedEvents: CalendarEvent[] = [];
        const lpGroupMap = new Map<string, CalendarEvent>();

        for (const event of enhancedEvents) {
          const lpId = event.extendedProps?.largeProjectId;
          if (!lpId) {
            consolidatedEvents.push(event);
            continue;
          }

          const sourceDate = (event.extendedProps as any)?.sourceDate || event.start?.split('T')[0] || '';
          const groupKey = `${lpId}-${event.eventType}-${sourceDate}`;

          if (!lpGroupMap.has(groupKey)) {
            const projectName = largeProjectMap.get(lpId) || event.title;
            const consolidated: CalendarEvent = {
              ...event,
              title: projectName,
              extendedProps: {
                ...event.extendedProps,
                isLargeProject: true,
                largeProjectId: lpId,
                largeProjectName: projectName,
                consolidatedBookingIds: [event.bookingId]
              }
            };
            lpGroupMap.set(groupKey, consolidated);
            consolidatedEvents.push(consolidated);
          } else {
            // Merge this event's booking into the existing consolidated event
            const existing = lpGroupMap.get(groupKey)!;
            const ids = existing.extendedProps?.consolidatedBookingIds || [];
            if (event.bookingId && !ids.includes(event.bookingId)) {
              ids.push(event.bookingId);
            }
            // Use earliest start and latest end
            if (event.start < existing.start) existing.start = event.start;
            if (event.end > existing.end) existing.end = event.end;
          }
        }

        setEvents(prev => {
          if (
            !force &&
            prev.length > 0 &&
            consolidatedEvents.length === 0
          ) {
            console.warn(`[useRealTimeCalendarEvents] Ignoring empty reload while ${prev.length} events are already visible`);
            return prev;
          }

          if (
            !force &&
            prev.length > 0 &&
            consolidatedEvents.length > 0 &&
            consolidatedEvents.length < prev.length * 0.5
          ) {
            console.warn(`[useRealTimeCalendarEvents] Ignoring suspicious shrink ${prev.length} → ${consolidatedEvents.length}`);
            return prev;
          }

          return consolidatedEvents;
        });

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

  // Real-time calendar change handler.
  // IMPORTANT: The planner view renders CONSOLIDATED large-project rows, so
  // trying to patch individual INSERT/UPDATE/DELETE payloads into local state
  // causes identity drift (e.g. several rig-days for one booking collapse into
  // one row). We therefore debounce to a full reload instead.
  const handleCalendarEventChange = useCallback(() => {
    if (!activeRef.current) return;

    if (reloadTimerRef.current !== null) {
      clearTimeout(reloadTimerRef.current);
    }

    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null;
      if (activeRef.current) {
        void loadEvents(false);
      }
    }, 800);
  }, [loadEvents]);

  // Initialize calendar events and set up real-time subscriptions
  useEffect(() => {
    activeRef.current = true;

    // Load initial events (read-only — no repair/sync)
    loadEvents(true);

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
      if (reloadTimerRef.current !== null) {
        clearTimeout(reloadTimerRef.current);
      }
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
    await loadEvents(true);
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

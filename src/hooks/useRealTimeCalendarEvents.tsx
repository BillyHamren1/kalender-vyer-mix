

import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { startOfWeek, endOfWeek, subDays, addDays, format } from 'date-fns';
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
    // Säkerhetsnät: oavsett vad som händer i finally-blocket ska UI:t
    // aldrig fastna i evig spinner. Vi släpper isLoading/isMounted efter
    // max 25s — kalendern visar då tom vy istället för låst skärm.
    const watchdog = window.setTimeout(() => {
      if (!activeRef.current) return;
      console.warn('[useRealTimeCalendarEvents] Watchdog tripped — släpper loading-state efter 25s');
      setIsLoading(false);
      setIsMounted(true);
    }, 25_000);
    try {
      setIsLoading(true);

      const calendarEvents = await fetchCalendarEvents();





      if (activeRef.current) {
        // Collect all booking IDs for batch fetching (instead of N+1 queries)
        const bookingIds = calendarEvents
          .map(e => e.bookingId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

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
              rental_only,
              assigned_project_id, assigned_project_name, assigned_to_project,
              status, large_project_id,
              rig_time_locked, event_time_locked, rigdown_time_locked,
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

        // fetchCalendarEvents() returns the authoritative planner tiles already
        // grouped on the correct identity. Do NOT re-consolidate large projects
        // here — that risks splitting/merging them differently from the planner.
        const enhancedEvents = calendarEvents.map(event => {
          const booking = event.bookingId ? bookingMap.get(event.bookingId) : undefined;
          const largeProjectId = event.extendedProps?.largeProjectId || booking?.large_project_id;
          const projectName = largeProjectId
            ? (largeProjectMap.get(largeProjectId) || event.extendedProps?.largeProjectName || event.title)
            : undefined;

          return {
            ...event,
            title: projectName || event.title,
            bookingNumber: booking?.booking_number || event.bookingNumber,
            bookingStatus: booking?.status || event.bookingStatus,
            extendedProps: {
              ...event.extendedProps,
              client: booking?.client || event.extendedProps?.client,
              deliveryAddress: booking?.deliveryaddress || event.extendedProps?.deliveryAddress,
              deliveryCity: booking?.delivery_city || event.extendedProps?.deliveryCity,
              deliveryPostalCode: booking?.delivery_postal_code || event.extendedProps?.deliveryPostalCode,
              exactTimeNeeded: booking?.exact_time_needed || event.extendedProps?.exactTimeNeeded,
              exactTimeInfo: booking?.exact_time_info || event.extendedProps?.exactTimeInfo,
              internalNotes: booking?.internalnotes || event.extendedProps?.internalNotes,
              carryMoreThan10m: booking?.carry_more_than_10m ?? event.extendedProps?.carryMoreThan10m,
              groundNailsAllowed: booking?.ground_nails_allowed ?? event.extendedProps?.groundNailsAllowed,
              rentalOnly: booking?.rental_only ?? event.extendedProps?.rentalOnly,
              products: booking?.booking_products || event.extendedProps?.products || [],
              bookingNumber: booking?.booking_number || event.extendedProps?.bookingNumber,
              booking_id: booking?.id || event.extendedProps?.booking_id,
              bookingStatus: booking?.status || event.extendedProps?.bookingStatus,
              assignedProjectId: booking?.assigned_project_id || event.extendedProps?.assignedProjectId,
              assignedProjectName: booking?.assigned_project_name || event.extendedProps?.assignedProjectName,
              assignedToProject: booking?.assigned_to_project ?? event.extendedProps?.assignedToProject,
              largeProjectId: largeProjectId || event.extendedProps?.largeProjectId,
              largeProjectName: projectName || event.extendedProps?.largeProjectName,
              isLargeProject: Boolean(largeProjectId) || event.extendedProps?.isLargeProject,
              timeLocked: (() => {
                // Per-day lock (calendar_events.times_locked) tar alltid precedence
                if (event.extendedProps?.timeLocked === true) return true;
                const phase = event.eventType || event.extendedProps?.eventType;
                if (booking) {
                  if (phase === 'rig') return booking.rig_time_locked === true;
                  if (phase === 'event') return booking.event_time_locked === true;
                  if (phase === 'rigDown') return booking.rigdown_time_locked === true;
                }
                return false;
              })(),
            }
          };
        });

        setEvents(prev => {
          if (
            !force &&
            prev.length > 0 &&
            enhancedEvents.length === 0
          ) {
            console.warn(`[useRealTimeCalendarEvents] Ignoring empty reload while ${prev.length} events are already visible`);
            return prev;
          }

          if (
            !force &&
            prev.length > 0 &&
            enhancedEvents.length > 0 &&
            enhancedEvents.length < prev.length * 0.5
          ) {
            console.warn(`[useRealTimeCalendarEvents] Ignoring suspicious shrink ${prev.length} → ${enhancedEvents.length}`);
            return prev;
          }

          return enhancedEvents;
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
        toast.error('Kunde inte ladda kalenderhändelser');
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
        { event: '*', schema: 'public', table: 'calendar_events' },
        handleCalendarEventChange)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'large_project_team_assignments' },
        handleCalendarEventChange)
      .subscribe();

    // Manual cross-component refresh signal (dispatched after planning saves)
    const onManualRefresh = () => handleCalendarEventChange();
    window.addEventListener('planner-calendar-refresh', onManualRefresh);
    // `bookings.<phase>_time_locked` lives outside calendar_events realtime,
    // so we listen for the explicit signal from setPhaseLock. Patch local
    // state OPTIMISTICALLY first so the red border appears immediately,
    // then fall back to the debounced full reload for consistency.
    const onPhaseLockChanged = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { bookingId?: string; phase?: string; locked?: boolean; largeProjectId?: string | null }
        | undefined;
      if (detail && detail.bookingId && detail.phase) {
        setEvents(prev => prev.map(e => {
          const phase = e.eventType || (e.extendedProps as any)?.eventType;
          const matchesBooking = e.bookingId === detail.bookingId
            || (detail.largeProjectId && (e.extendedProps as any)?.largeProjectId === detail.largeProjectId);
          if (matchesBooking && phase === detail.phase) {
            return {
              ...e,
              extendedProps: {
                ...(e.extendedProps || {}),
                timeLocked: detail.locked === true,
              },
            };
          }
          return e;
        }));
      }
      handleCalendarEventChange();
    };
    window.addEventListener('phase-lock-changed', onPhaseLockChanged as EventListener);

    console.log('Real-time calendar subscription established (read-only mode)');

    return () => {
      activeRef.current = false;
      if (reloadTimerRef.current !== null) {
        clearTimeout(reloadTimerRef.current);
      }
      window.removeEventListener('planner-calendar-refresh', onManualRefresh);
      window.removeEventListener('phase-lock-changed', onPhaseLockChanged as EventListener);
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

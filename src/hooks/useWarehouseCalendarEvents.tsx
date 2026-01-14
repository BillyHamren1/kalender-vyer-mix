import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { 
  fetchWarehouseEvents, 
  markWarehouseEventAsViewed, 
  markWarehouseEventAsAdjusted,
  WarehouseEventType 
} from '@/services/warehouseCalendarService';

export interface WarehouseEvent {
  id: string;
  booking_id: string;
  booking_number: string | null;
  title: string;
  start_time: string;
  end_time: string;
  resource_id: string;
  event_type: WarehouseEventType;
  delivery_address: string | null;
  source_rig_date: string | null;
  source_event_date: string | null;
  source_rigdown_date: string | null;
  has_source_changes: boolean;
  change_details: string | null;
  manually_adjusted: boolean;
  viewed: boolean;
  created_at: string;
  updated_at: string;
}

interface UseWarehouseCalendarEventsProps {
  currentDate: Date;
  view: 'day' | 'week' | 'month';
}

export function useWarehouseCalendarEvents({ currentDate, view }: UseWarehouseCalendarEventsProps) {
  const [events, setEvents] = useState<WarehouseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [changedEventsCount, setChangedEventsCount] = useState(0);
  const { toast } = useToast();

  // Calculate date range based on view
  const getDateRange = useCallback(() => {
    let start: Date;
    let end: Date;

    switch (view) {
      case 'day':
        start = currentDate;
        end = addDays(currentDate, 1);
        break;
      case 'week':
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
        break;
      case 'month':
      default:
        start = startOfMonth(currentDate);
        end = endOfMonth(currentDate);
        break;
    }

    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(addDays(end, 1), 'yyyy-MM-dd') // Add one day to include end date
    };
  }, [currentDate, view]);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { start, end } = getDateRange();
      const data = await fetchWarehouseEvents(start, end);
      
      // Type assertion since we know the structure
      setEvents(data as WarehouseEvent[]);
      
      // Count events with changes
      const changedCount = data.filter((e: any) => e.has_source_changes && !e.manually_adjusted).length;
      setChangedEventsCount(changedCount);
      
      if (changedCount > 0) {
        toast({
          title: "Ändringar från personalplanering",
          description: `${changedCount} händelse(r) har ändrats i personalplaneringen`,
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error('[WarehouseCalendar] Error fetching events:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, toast]);

  // Acknowledge a change
  const acknowledgeChange = useCallback(async (eventId: string) => {
    try {
      await markWarehouseEventAsViewed(eventId);
      setEvents(prev => prev.map(e => 
        e.id === eventId 
          ? { ...e, has_source_changes: false, viewed: true }
          : e
      ));
      setChangedEventsCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[WarehouseCalendar] Error acknowledging change:', err);
      throw err;
    }
  }, []);

  // Mark as manually adjusted
  const markAsAdjusted = useCallback(async (eventId: string) => {
    try {
      await markWarehouseEventAsAdjusted(eventId);
      setEvents(prev => prev.map(e => 
        e.id === eventId 
          ? { ...e, manually_adjusted: true, has_source_changes: false }
          : e
      ));
      setChangedEventsCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[WarehouseCalendar] Error marking as adjusted:', err);
      throw err;
    }
  }, []);

  // Initial fetch and refresh on date/view change
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('warehouse-calendar-events')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warehouse_calendar_events'
        },
        (payload) => {
          console.log('[WarehouseCalendar] Real-time update:', payload);
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  // Group events by date for calendar display
  const eventsByDate = events.reduce((acc, event) => {
    const dateKey = format(new Date(event.start_time), 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, WarehouseEvent[]>);

  // Get events with changes
  const eventsWithChanges = events.filter(e => e.has_source_changes && !e.manually_adjusted);

  return {
    events,
    eventsByDate,
    eventsWithChanges,
    changedEventsCount,
    loading,
    error,
    refetch: fetchEvents,
    acknowledgeChange,
    markAsAdjusted
  };
}

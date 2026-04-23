import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';

interface TransportCalendarData {
  id: string;
  transport_date: string;
  transport_time: string | null;
  estimated_duration: number | null;
  status: string;
  vehicle: { id: string; name: string } | null;
  booking: {
    id: string;
    client: string;
    booking_number: string | null;
    deliveryaddress: string | null;
    delivery_city: string | null;
  } | null;
}

export const useTransportCalendarEvents = (currentDate: Date, view: 'day' | 'week' | 'month' = 'week') => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const dateRange = useMemo(() => {
    if (view === 'day') {
      return { start: currentDate, end: currentDate };
    }
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return { start: weekStart, end: addDays(weekStart, 6) };
  }, [currentDate, view]);

  const startStr = format(dateRange.start, 'yyyy-MM-dd');
  const endStr = format(dateRange.end, 'yyyy-MM-dd');

  const fetchTransports = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('transport_assignments')
        .select(`
          id,
          transport_date,
          transport_time,
          estimated_duration,
          status,
          vehicle:vehicles!vehicle_id ( id, name ),
          booking:bookings!booking_id ( id, client, booking_number, deliveryaddress, delivery_city )
        `)
        .gte('transport_date', startStr)
        .lte('transport_date', endStr)
        .order('transport_time', { ascending: true });

      if (error) throw error;

      const mapped: CalendarEvent[] = (data as unknown as TransportCalendarData[] || []).map(t => {
        const time = t.transport_time || '08:00';
        const duration = t.estimated_duration || 60;
        const startISO = `${t.transport_date}T${time}:00`;
        const endDate = new Date(startISO);
        endDate.setMinutes(endDate.getMinutes() + duration);
        const endISO = endDate.toISOString();

        const vehicleName = t.vehicle?.name || '';
        const clientName = t.booking?.client || 'Okänd';
        const title = vehicleName ? `${clientName} — ${vehicleName}` : clientName;

        return {
          id: `transport-${t.id}`,
          title,
          start: startISO,
          end: endISO,
          resourceId: 'transport',
          bookingId: t.booking?.id,
          bookingNumber: t.booking?.booking_number || undefined,
          eventType: 'delivery' as const,
          deliveryAddress: t.booking?.deliveryaddress || undefined,
          viewed: true,
          backgroundColor: '#BFDBFE',
          borderColor: '#93C5FD',
          extendedProps: {
            bookingNumber: t.booking?.booking_number || undefined,
            booking_id: t.booking?.id,
            deliveryCity: t.booking?.delivery_city || undefined,
            isTransport: true,
            transportStatus: t.status,
            vehicleName,
          },
        };
      });

      setEvents(mapped);
    } catch (err) {
      console.error('Error fetching transport calendar events:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startStr, endStr]);

  useEffect(() => {
    fetchTransports();

    const channel = supabase
      .channel('transport-calendar-events')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transport_assignments',
      }, () => {
        fetchTransports();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTransports]);

  return { transportEvents: events, isLoading };
};

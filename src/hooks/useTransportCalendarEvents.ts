import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent, getEventColor, getTransportEventType } from '@/components/Calendar/ResourceData';
import { format, startOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';

interface TransportCalendarData {
  id: string;
  transport_date: string;
  transport_time: string | null;
  transport_end_time: string | null;
  estimated_duration: number | null;
  status: string;
  planning_status: string | null;
  partner_response: string | null;
  transport_type: string | null;
  origin_address: string | null;
  destination_address: string | null;
  driver_notes: string | null;
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
    if (view === 'day') return { start: currentDate, end: currentDate };
    if (view === 'month') return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
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
          id, transport_date, transport_time, transport_end_time, estimated_duration,
          status, planning_status, partner_response, transport_type, origin_address, destination_address, driver_notes,
          vehicle:vehicles!vehicle_id ( id, name ),
          booking:bookings!booking_id ( id, client, booking_number, deliveryaddress, delivery_city )
        `)
        .gte('transport_date', startStr)
        .lte('transport_date', endStr)
        .order('transport_time', { ascending: true });

      if (error) throw error;

      const mapped: CalendarEvent[] = ((data as unknown as TransportCalendarData[]) || []).map(t => {
        const time = (t.transport_time || '08:00').slice(0, 5);
        let endTime = t.transport_end_time?.slice(0, 5) || '';
        if (!endTime) {
          const duration = t.estimated_duration || 60;
          const [h, m] = time.split(':').map(Number);
          const total = h * 60 + m + duration;
          endTime = `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        }
        const vehicleName = t.vehicle?.name || 'Fordon ej bestämt';
        const clientName = t.booking?.client || 'Okänd';
        const effectivePlanningStatus = t.planning_status === 'confirmed' || t.partner_response === 'accepted' ? 'confirmed' : 'preliminary';
        const planningLabel = effectivePlanningStatus === 'confirmed' ? 'Bekräftad' : 'Preliminär';
      const transportEventType = getTransportEventType(t.transport_type);
      return {
          id: `transport-${t.id}`,
          title: clientName,
          start: `${t.transport_date}T${time}:00`,
          end: `${t.transport_date}T${endTime}:00`,
          resourceId: 'warehouse-transport',
          bookingId: t.booking?.id,
          bookingNumber: t.booking?.booking_number || undefined,
          eventType: transportEventType,
          deliveryAddress: t.destination_address || t.booking?.deliveryaddress || undefined,
          viewed: true,
          editable: false,
          startEditable: false,
          durationEditable: false,
          backgroundColor: getEventColor(transportEventType),
          borderColor: transportEventType === 'transport_out' ? '#EC4899' : '#F59E0B',
          extendedProps: {
            bookingNumber: t.booking?.booking_number || undefined,
            booking_id: t.booking?.id,
            deliveryCity: t.booking?.delivery_city || undefined,
            isTransport: true,
            isTransportPlanning: true,
            transportAssignmentId: t.id,
            transportStatus: t.status,
            planningStatus: effectivePlanningStatus,
            planningStatusLabel: planningLabel,
            transportType: t.transport_type || 'delivery',
            originAddress: t.origin_address,
            destinationAddress: t.destination_address,
            driverNotes: t.driver_notes,
            vehicleName,
            timeLabel: `${time}–${endTime}`,
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_assignments' }, fetchTransports)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTransports]);

  return { transportEvents: events, isLoading };
};

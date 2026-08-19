import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface CalendarTransportProjection {
  id: string;
  bookingId: string;
  bookingNumber: string | null;
  bookingTitle: string;
  deliveryAddress: string | null;
  transportDate: string;
  transportTime: string | null;
  transportEndTime: string | null;
  estimatedDuration: number | null;
  status: string | null;
  planningStatus: 'preliminary' | 'confirmed';
  transportType: string;
  originAddress: string | null;
  destinationAddress: string | null;
  pickupAddress: string | null;
  driverNotes: string | null;
  vehicleId: string | null;
  vehicleName: string;
  vehicleType: string | null;
  isExternal: boolean;
}

/**
 * Read-only projection of transport_assignments into operational calendars.
 * transport_assignments remains the single source of truth; this hook never
 * writes calendar_events or booking phase dates.
 */
export const useTransportCalendarProjection = (startDate: Date, endDate: Date) => {
  const [items, setItems] = useState<CalendarTransportProjection[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const start = format(startDate, 'yyyy-MM-dd');
  const end = format(endDate, 'yyyy-MM-dd');

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transport_assignments')
        .select(`
          id,
          booking_id,
          vehicle_id,
          transport_date,
          transport_time,
          transport_end_time,
          estimated_duration,
          status,
          planning_status,
          partner_response,
          transport_type,
          origin_address,
          destination_address,
          pickup_address,
          driver_notes,
          vehicle:vehicles!vehicle_id (
            id,
            name,
            vehicle_type,
            is_external
          ),
          booking:bookings!booking_id (
            id,
            client,
            booking_number,
            deliveryaddress
          )
        `)
        .gte('transport_date', start)
        .lte('transport_date', end)
        .order('transport_date', { ascending: true })
        .order('transport_time', { ascending: true });

      if (error) throw error;

      setItems((data || []).map((row: any) => ({
        id: row.id,
        bookingId: row.booking_id,
        bookingNumber: row.booking?.booking_number || null,
        bookingTitle: row.booking?.client || 'Transport',
        deliveryAddress: row.booking?.deliveryaddress || null,
        vehicleId: row.vehicle_id || null,
        transportDate: row.transport_date,
        transportTime: row.transport_time,
        transportEndTime: row.transport_end_time,
        estimatedDuration: row.estimated_duration,
        status: row.status,
        planningStatus: row.planning_status === 'confirmed' || row.partner_response === 'accepted' ? 'confirmed' : 'preliminary',
        transportType: row.transport_type || 'delivery',
        originAddress: row.origin_address || row.pickup_address || null,
        destinationAddress: row.destination_address || row.booking?.deliveryaddress || null,
        pickupAddress: row.pickup_address,
        driverNotes: row.driver_notes,
        vehicleName: row.vehicle?.name || 'Fordon ej bestämt',
        vehicleType: row.vehicle?.vehicle_type || null,
        isExternal: Boolean(row.vehicle?.is_external),
      })));
    } catch (error) {
      console.error('[useTransportCalendarProjection] fetch failed', error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    fetchItems();
    const channel = supabase
      .channel(`staff-calendar-transport-${start}-${end}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_assignments' }, fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchItems, start, end]);

  const byBookingAndDate = useMemo(() => {
    const map = new Map<string, CalendarTransportProjection[]>();
    for (const item of items) {
      const key = `${item.bookingId}|${item.transportDate}`;
      const existing = map.get(key) || [];
      existing.push(item);
      map.set(key, existing);
    }
    return map;
  }, [items]);

  return { items, byBookingAndDate, isLoading, refetch: fetchItems };
};

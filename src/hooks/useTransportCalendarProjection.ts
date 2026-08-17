import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface CalendarTransportProjection {
  id: string;
  bookingId: string;
  transportDate: string;
  transportTime: string | null;
  estimatedDuration: number | null;
  status: string | null;
  pickupAddress: string | null;
  driverNotes: string | null;
  vehicleId: string;
  vehicleName: string;
  vehicleType: string | null;
  isExternal: boolean;
}

/**
 * Read-only projection of transport_assignments into Bemanningsplaneringen.
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
          estimated_duration,
          status,
          pickup_address,
          driver_notes,
          vehicle:vehicles!vehicle_id (
            id,
            name,
            vehicle_type,
            is_external
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
        vehicleId: row.vehicle_id,
        transportDate: row.transport_date,
        transportTime: row.transport_time,
        estimatedDuration: row.estimated_duration,
        status: row.status,
        pickupAddress: row.pickup_address,
        driverNotes: row.driver_notes,
        vehicleName: row.vehicle?.name || 'Transport',
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

    return () => {
      supabase.removeChannel(channel);
    };
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

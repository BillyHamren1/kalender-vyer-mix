import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BookingForTransport {
  id: string;
  client: string;
  booking_number: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  status: string | null;
  has_transport: boolean;
  transport_assignments: {
    id: string;
    vehicle_id: string;
    transport_date: string;
    stop_order: number | null;
    status: string | null;
    vehicle_name?: string;
  }[];
}

export const useBookingsForTransport = () => {
  const [bookings, setBookings] = useState<BookingForTransport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch confirmed bookings
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          id,
          client,
          booking_number,
          deliveryaddress,
          delivery_city,
          delivery_postal_code,
          delivery_latitude,
          delivery_longitude,
          rigdaydate,
          eventdate,
          rigdowndate,
          status
        `)
        .eq('status', 'CONFIRMED')
        .order('eventdate', { ascending: true });

      if (bookingError) throw bookingError;

      // Fetch all transport assignments with vehicle names
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('transport_assignments')
        .select(`
          id,
          vehicle_id,
          booking_id,
          transport_date,
          stop_order,
          status,
          vehicles!vehicle_id (name)
        `);

      if (assignmentError) throw assignmentError;

      // Map assignments by booking_id
      const assignmentsByBooking: Record<string, BookingForTransport['transport_assignments']> = {};
      (assignmentData || []).forEach((a: any) => {
        if (!assignmentsByBooking[a.booking_id]) {
          assignmentsByBooking[a.booking_id] = [];
        }
        assignmentsByBooking[a.booking_id].push({
          id: a.id,
          vehicle_id: a.vehicle_id,
          transport_date: a.transport_date,
          stop_order: a.stop_order,
          status: a.status,
          vehicle_name: a.vehicles?.name || 'Okänt fordon',
        });
      });

      const mapped: BookingForTransport[] = (bookingData || []).map(b => ({
        ...b,
        has_transport: !!assignmentsByBooking[b.id]?.length,
        transport_assignments: assignmentsByBooking[b.id] || [],
      }));

      setBookings(mapped);
    } catch (error: any) {
      console.error('Error fetching bookings for transport:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const withoutTransport = bookings.filter(b => !b.has_transport);
  const withTransport = bookings.filter(b => b.has_transport);

  return {
    bookings,
    withoutTransport,
    withTransport,
    isLoading,
    refetch: fetchBookings,
  };
};

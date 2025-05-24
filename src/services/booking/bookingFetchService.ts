
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";
import { extractClientName } from "./bookingUtils";

export const fetchBookings = async (): Promise<Booking[]> => {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_products (
        id,
        name,
        quantity,
        notes
      ),
      booking_attachments (
        id,
        url,
        file_name,
        file_type
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }

  return (data || []).map(booking => ({
    id: booking.id,
    client: extractClientName(booking.client),
    rigDayDate: booking.rigdaydate,
    eventDate: booking.eventdate,
    rigDownDate: booking.rigdowndate,
    deliveryAddress: booking.deliveryaddress,
    deliveryCity: booking.delivery_city,
    deliveryPostalCode: booking.delivery_postal_code,
    deliveryLatitude: booking.delivery_latitude,
    deliveryLongitude: booking.delivery_longitude,
    carryMoreThan10m: booking.carry_more_than_10m,
    groundNailsAllowed: booking.ground_nails_allowed,
    exactTimeNeeded: booking.exact_time_needed,
    exactTimeInfo: booking.exact_time_info,
    products: booking.booking_products?.map(product => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes || undefined,
    })) || [],
    internalNotes: booking.internalnotes,
    attachments: booking.booking_attachments?.map(attachment => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
    })) || [],
    viewed: booking.viewed,
    status: booking.status || 'PENDING',
  }));
};

export const fetchBookingById = async (id: string): Promise<Booking | null> => {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_products (
        id,
        name,
        quantity,
        notes
      ),
      booking_attachments (
        id,
        url,
        file_name,
        file_type
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching booking:', error);
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    client: extractClientName(data.client),
    rigDayDate: data.rigdaydate,
    eventDate: data.eventdate,
    rigDownDate: data.rigdowndate,
    deliveryAddress: data.deliveryaddress,
    deliveryCity: data.delivery_city,
    deliveryPostalCode: data.delivery_postal_code,
    deliveryLatitude: data.delivery_latitude,
    deliveryLongitude: data.delivery_longitude,
    carryMoreThan10m: data.carry_more_than_10m,
    groundNailsAllowed: data.ground_nails_allowed,
    exactTimeNeeded: data.exact_time_needed,
    exactTimeInfo: data.exact_time_info,
    products: data.booking_products?.map(product => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes || undefined,
    })) || [],
    internalNotes: data.internalnotes,
    attachments: data.booking_attachments?.map(attachment => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
    })) || [],
    viewed: data.viewed,
    status: data.status || 'PENDING',
  };
};

export const fetchUpcomingBookings = async (startDate?: string, endDate?: string): Promise<Booking[]> => {
  let query = supabase
    .from('bookings')
    .select(`
      *,
      booking_products (
        id,
        name,
        quantity,
        notes
      ),
      booking_attachments (
        id,
        url,
        file_name,
        file_type
      )
    `)
    .not('eventdate', 'is', null)
    .order('eventdate', { ascending: true });

  if (startDate) {
    query = query.gte('eventdate', startDate);
  }
  
  if (endDate) {
    query = query.lte('eventdate', endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching upcoming bookings:', error);
    throw error;
  }

  return (data || []).map(booking => ({
    id: booking.id,
    client: extractClientName(booking.client),
    rigDayDate: booking.rigdaydate,
    eventDate: booking.eventdate,
    rigDownDate: booking.rigdowndate,
    deliveryAddress: booking.deliveryaddress,
    deliveryCity: booking.delivery_city,
    deliveryPostalCode: booking.delivery_postal_code,
    deliveryLatitude: booking.delivery_latitude,
    deliveryLongitude: booking.delivery_longitude,
    carryMoreThan10m: booking.carry_more_than_10m,
    groundNailsAllowed: booking.ground_nails_allowed,
    exactTimeNeeded: booking.exact_time_needed,
    exactTimeInfo: booking.exact_time_info,
    products: booking.booking_products?.map(product => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes || undefined,
    })) || [],
    internalNotes: booking.internalnotes,
    attachments: booking.booking_attachments?.map(attachment => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
    })) || [],
    viewed: booking.viewed,
    status: booking.status || 'PENDING',
  }));
};

export const fetchConfirmedBookings = async (): Promise<Booking[]> => {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_products (
        id,
        name,
        quantity,
        notes
      ),
      booking_attachments (
        id,
        url,
        file_name,
        file_type
      )
    `)
    .eq('status', 'CONFIRMED')
    .order('eventdate', { ascending: true });

  if (error) {
    console.error('Error fetching confirmed bookings:', error);
    throw error;
  }

  return (data || []).map(booking => ({
    id: booking.id,
    client: extractClientName(booking.client),
    rigDayDate: booking.rigdaydate,
    eventDate: booking.eventdate,
    rigDownDate: booking.rigdowndate,
    deliveryAddress: booking.deliveryaddress,
    deliveryCity: booking.delivery_city,
    deliveryPostalCode: booking.delivery_postal_code,
    deliveryLatitude: booking.delivery_latitude,
    deliveryLongitude: booking.delivery_longitude,
    carryMoreThan10m: booking.carry_more_than_10m,
    groundNailsAllowed: booking.ground_nails_allowed,
    exactTimeNeeded: booking.exact_time_needed,
    exactTimeInfo: booking.exact_time_info,
    products: booking.booking_products?.map(product => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes || undefined,
    })) || [],
    internalNotes: booking.internalnotes,
    attachments: booking.booking_attachments?.map(attachment => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
    })) || [],
    viewed: booking.viewed,
    status: booking.status || 'PENDING',
  }));
};

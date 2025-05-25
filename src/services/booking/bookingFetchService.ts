
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";

const transformBookingData = (data: any): Booking => {
  return {
    id: data.id,
    bookingNumber: data.booking_number,
    client: data.client,
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
    products: data.booking_products?.map((product: any) => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes || undefined,
    })) || [],
    internalNotes: data.internalnotes,
    attachments: data.booking_attachments?.map((attachment: any) => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
    })) || [],
    viewed: data.viewed,
    status: data.status || 'PENDING',
  };
};

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

  return data.map(transformBookingData);
};

export const fetchBookingById = async (id: string): Promise<Booking> => {
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
    .single();

  if (error) {
    console.error('Error fetching booking:', error);
    throw error;
  }

  return transformBookingData(data);
};

export const fetchUpcomingBookings = async (): Promise<Booking[]> => {
  const today = new Date().toISOString().split('T')[0];
  
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
    .or(`rigdaydate.gte.${today},eventdate.gte.${today},rigdowndate.gte.${today}`)
    .order('rigdaydate', { ascending: true });

  if (error) {
    console.error('Error fetching upcoming bookings:', error);
    throw error;
  }

  return data.map(transformBookingData);
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
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching confirmed bookings:', error);
    throw error;
  }

  return data.map(transformBookingData);
};

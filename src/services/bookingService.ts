
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";

// Helper function to extract client name from various formats
const extractClientName = (clientData: any): string => {
  if (typeof clientData === 'string') {
    // Try to parse as JSON first in case it's a JSON string
    try {
      const parsed = JSON.parse(clientData);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed.name || parsed.client_name || clientData;
      }
      return clientData;
    } catch {
      // If it's not valid JSON, return as-is
      return clientData;
    }
  } else if (typeof clientData === 'object' && clientData !== null) {
    // If it's already an object, extract the name
    return clientData.name || clientData.client_name || String(clientData);
  }
  
  // Fallback to string conversion
  return String(clientData || '');
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

export const markBookingAsViewed = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ viewed: true })
    .eq('id', id);

  if (error) {
    console.error('Error marking booking as viewed:', error);
    throw error;
  }
};

export const updateBookingStatus = async (id: string, status: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};

export const updateBookingDates = async (
  id: string, 
  dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate', 
  date: string | null
): Promise<void> => {
  const columnMap = {
    rigDayDate: 'rigdaydate',
    eventDate: 'eventdate',
    rigDownDate: 'rigdowndate'
  };

  const { error } = await supabase
    .from('bookings')
    .update({ [columnMap[dateType]]: date })
    .eq('id', id);

  if (error) {
    console.error(`Error updating ${dateType}:`, error);
    throw error;
  }
};

export const updateBookingLogistics = async (
  id: string, 
  logisticsData: {
    carryMoreThan10m: boolean;
    groundNailsAllowed: boolean;
    exactTimeNeeded: boolean;
    exactTimeInfo: string;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({
      carry_more_than_10m: logisticsData.carryMoreThan10m,
      ground_nails_allowed: logisticsData.groundNailsAllowed,
      exact_time_needed: logisticsData.exactTimeNeeded,
      exact_time_info: logisticsData.exactTimeInfo
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating logistics information:', error);
    throw error;
  }
};

export const updateDeliveryDetails = async (
  id: string, 
  deliveryData: {
    deliveryAddress: string;
    deliveryCity: string;
    deliveryPostalCode: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
  }
): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({
      deliveryaddress: deliveryData.deliveryAddress,
      delivery_city: deliveryData.deliveryCity,
      delivery_postal_code: deliveryData.deliveryPostalCode,
      delivery_latitude: deliveryData.deliveryLatitude,
      delivery_longitude: deliveryData.deliveryLongitude
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating delivery details:', error);
    throw error;
  }
};

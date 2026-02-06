
import { supabase } from '@/integrations/supabase/client';
import { transformBookingData } from './bookingUtils';

export const fetchBookingById = async (id: string) => {
  console.log('Fetching booking with ID:', id);
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_products (*),
      booking_attachments (*)
    `)
    .eq('id', id)
    .order('parent_product_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true })
    .order('parent_package_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true })
    .single();

  if (error) {
    console.error('Error fetching booking:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Booking not found');
  }

  console.log('Raw booking data from database:', data);
  
  const transformedBooking = transformBookingData(data);
  console.log('Transformed booking data:', transformedBooking);
  
  return transformedBooking;
};

export const fetchBookings = async (filters?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  client?: string;
  projectId?: string;
}) => {
  console.log('Fetching bookings with filters:', filters);
  
  let query = supabase
    .from('bookings')
    .select(`
      *,
      booking_products (*),
      booking_attachments (*)
    `)
    .order('created_at', { ascending: false })
    .order('parent_product_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true })
    .order('parent_package_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true });

  // Apply filters
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  
  if (filters?.startDate) {
    query = query.gte('eventdate', filters.startDate);
  }
  
  if (filters?.endDate) {
    query = query.lte('eventdate', filters.endDate);
  }
  
  if (filters?.client) {
    query = query.ilike('client', `%${filters.client}%`);
  }
  
  if (filters?.projectId) {
    query = query.eq('assigned_project_id', filters.projectId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }

  return data?.map(transformBookingData) || [];
};

export const fetchConfirmedBookings = async () => {
  console.log('Fetching confirmed bookings');
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_products (*),
      booking_attachments (*)
    `)
    .eq('status', 'CONFIRMED')
    .order('eventdate', { ascending: true })
    .order('parent_product_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true })
    .order('parent_package_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true });

  if (error) {
    console.error('Error fetching confirmed bookings:', error);
    throw error;
  }

  return data?.map(transformBookingData) || [];
};

export const fetchUpcomingBookings = async () => {
  console.log('Fetching upcoming bookings');
  
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_products (*),
      booking_attachments (*)
    `)
    .gte('eventdate', today)
    .order('eventdate', { ascending: true })
    .order('parent_product_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true })
    .order('parent_package_id', { referencedTable: 'booking_products', ascending: true, nullsFirst: true });

  if (error) {
    console.error('Error fetching upcoming bookings:', error);
    throw error;
  }

  return data?.map(transformBookingData) || [];
};

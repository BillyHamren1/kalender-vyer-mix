
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";

// Function to get the next available booking ID
const getNextBookingId = async (): Promise<string> => {
  // Get the current year
  const currentYear = new Date().getFullYear();
  
  // Determine prefix based on year
  const prefix = currentYear === 2025 ? '2025' : '2505';
  
  // Find the highest existing number for this prefix
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .like('id', `${prefix}-%`)
    .not('id', 'like', '%-%-%-%-%') // Exclude UUIDs
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching last booking ID:', error);
    throw error;
  }

  // Extract the number from the last booking ID
  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastId = data[0].id;
    const numberPart = lastId.split('-')[1];
    nextNumber = parseInt(numberPart, 10) + 1;
  }

  return `${prefix}-${nextNumber}`;
};

// Function to create a new booking with proper sequential ID
export const createBooking = async (bookingData: {
  client: string;
  rigDayDate?: string;
  eventDate?: string;
  rigDownDate?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostalCode?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  carryMoreThan10m?: boolean;
  groundNailsAllowed?: boolean;
  exactTimeNeeded?: boolean;
  exactTimeInfo?: string;
  internalNotes?: string;
  status?: string;
}): Promise<Booking> => {
  // Generate the next sequential booking ID
  const bookingId = await getNextBookingId();
  
  console.log(`Creating new booking with ID: ${bookingId}`);

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      id: bookingId,
      client: bookingData.client,
      rigdaydate: bookingData.rigDayDate || null,
      eventdate: bookingData.eventDate || null,
      rigdowndate: bookingData.rigDownDate || null,
      deliveryaddress: bookingData.deliveryAddress || null,
      delivery_city: bookingData.deliveryCity || null,
      delivery_postal_code: bookingData.deliveryPostalCode || null,
      delivery_latitude: bookingData.deliveryLatitude || null,
      delivery_longitude: bookingData.deliveryLongitude || null,
      carry_more_than_10m: bookingData.carryMoreThan10m || false,
      ground_nails_allowed: bookingData.groundNailsAllowed || false,
      exact_time_needed: bookingData.exactTimeNeeded || false,
      exact_time_info: bookingData.exactTimeInfo || null,
      internalnotes: bookingData.internalNotes || null,
      status: bookingData.status || 'PENDING',
      viewed: false
    })
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
    .single();

  if (error) {
    console.error('Error creating booking:', error);
    throw error;
  }

  // Transform the data to match our Booking type
  return {
    id: data.id,
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

// Function to duplicate an existing booking with a new sequential ID
export const duplicateBooking = async (originalBookingId: string): Promise<Booking> => {
  // First, fetch the original booking
  const { data: originalBooking, error: fetchError } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_products (
        name,
        quantity,
        notes
      )
    `)
    .eq('id', originalBookingId)
    .single();

  if (fetchError || !originalBooking) {
    console.error('Error fetching original booking:', fetchError);
    throw fetchError || new Error('Booking not found');
  }

  // Create the new booking based on the original
  const newBooking = await createBooking({
    client: originalBooking.client,
    rigDayDate: originalBooking.rigdaydate,
    eventDate: originalBooking.eventdate,
    rigDownDate: originalBooking.rigdowndate,
    deliveryAddress: originalBooking.deliveryaddress,
    deliveryCity: originalBooking.delivery_city,
    deliveryPostalCode: originalBooking.delivery_postal_code,
    deliveryLatitude: originalBooking.delivery_latitude,
    deliveryLongitude: originalBooking.delivery_longitude,
    carryMoreThan10m: originalBooking.carry_more_than_10m,
    groundNailsAllowed: originalBooking.ground_nails_allowed,
    exactTimeNeeded: originalBooking.exact_time_needed,
    exactTimeInfo: originalBooking.exact_time_info,
    internalNotes: originalBooking.internalnotes,
    status: 'PENDING' // Always start duplicated bookings as pending
  });

  // Copy over the products from the original booking
  if (originalBooking.booking_products && originalBooking.booking_products.length > 0) {
    const { error: productsError } = await supabase
      .from('booking_products')
      .insert(
        originalBooking.booking_products.map(product => ({
          booking_id: newBooking.id,
          name: product.name,
          quantity: product.quantity,
          notes: product.notes
        }))
      );

    if (productsError) {
      console.error('Error copying booking products:', productsError);
      // Don't throw here, just log the error as the booking was created successfully
    }
  }

  console.log(`Successfully duplicated booking ${originalBookingId} as ${newBooking.id}`);
  return newBooking;
};

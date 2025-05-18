import { supabase } from "@/integrations/supabase/client";
import { Booking, BookingProduct } from "@/types/booking";

// Fetch all bookings
export const fetchBookings = async (): Promise<Booking[]> => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }

  return data.map(booking => ({
    id: booking.id,
    client: booking.client,
    rigDayDate: booking.rigdaydate,
    eventDate: booking.eventdate,
    rigDownDate: booking.rigdowndate,
    deliveryAddress: booking.deliveryaddress || undefined,
    internalNotes: booking.internalnotes || undefined,
  }));
};

// Fetch a single booking by ID
export const fetchBookingById = async (id: string): Promise<Booking> => {
  // Fetch booking details
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (bookingError) {
    console.error('Error fetching booking:', bookingError);
    throw bookingError;
  }

  // Fetch products for this booking
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select('*')
    .eq('booking_id', id);

  if (productsError) {
    console.error('Error fetching booking products:', productsError);
    throw productsError;
  }

  // Fetch attachments for this booking
  const { data: attachments, error: attachmentsError } = await supabase
    .from('booking_attachments')
    .select('*')
    .eq('booking_id', id);

  if (attachmentsError) {
    console.error('Error fetching booking attachments:', attachmentsError);
    throw attachmentsError;
  }

  return {
    id: booking.id,
    client: booking.client,
    rigDayDate: booking.rigdaydate,
    eventDate: booking.eventdate,
    rigDownDate: booking.rigdowndate,
    deliveryAddress: booking.deliveryaddress || undefined,
    internalNotes: booking.internalnotes || undefined,
    products: products.map(product => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes || undefined,
    })),
    attachments: attachments.map(attachment => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.file_name || 'Unnamed File',
      fileType: attachment.file_type || 'application/octet-stream'
    })),
  };
};

// Mark a booking as viewed
export const markBookingAsViewed = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ viewed: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error marking booking as viewed:', error);
    throw error;
  }
};

// Update booking dates
export const updateBookingDates = async (
  id: string,
  field: 'rigDayDate' | 'eventDate' | 'rigDownDate',
  date: string
): Promise<void> => {
  // Map the camelCase field names to the snake_case column names in the database
  const fieldMapping: Record<string, string> = {
    'rigDayDate': 'rigdaydate',
    'eventDate': 'eventdate',
    'rigDownDate': 'rigdowndate'
  };
  
  const dbField = fieldMapping[field];
  
  const { error } = await supabase
    .from('bookings')
    .update({ [dbField]: date, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error(`Error updating ${field}:`, error);
    throw error;
  }
};

// Update booking notes
export const updateBookingNotes = async (id: string, notes: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ internalnotes: notes, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating notes:', error);
    throw error;
  }
};

// Upload file to Supabase Storage and add attachment to booking
export const uploadBookingAttachment = async (
  bookingId: string,
  file: File
): Promise<string> => {
  try {
    // Create a unique file path using the booking ID and timestamp
    const filePath = `${bookingId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    
    // Upload the file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('booking-attachments')
      .upload(filePath, file);
    
    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      throw uploadError;
    }
    
    // Get the public URL for the uploaded file
    const { data: { publicUrl } } = supabase.storage
      .from('booking-attachments')
      .getPublicUrl(filePath);
    
    // Add the attachment record to the database
    await addBookingAttachment(
      bookingId, 
      publicUrl,
      file.name,
      file.type
    );
    
    return publicUrl;
  } catch (error) {
    console.error('Error in uploadBookingAttachment:', error);
    throw error;
  }
};

// Add attachment to booking
export const addBookingAttachment = async (
  bookingId: string, 
  url: string,
  fileName?: string,
  fileType?: string
): Promise<void> => {
  const { error } = await supabase
    .from('booking_attachments')
    .insert({
      booking_id: bookingId,
      url,
      file_name: fileName,
      file_type: fileType
    });

  if (error) {
    console.error('Error adding attachment:', error);
    throw error;
  }
};

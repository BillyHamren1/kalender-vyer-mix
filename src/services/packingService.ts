import { supabase } from "@/integrations/supabase/client";
import { Packing, PackingWithBooking, PackingTask, PackingComment, PackingFile, PackingStatus } from "@/types/packing";
import { BookingProduct } from "@/types/booking";

// Fetch all packing projects with optional booking info
export const fetchPackings = async (): Promise<PackingWithBooking[]> => {
  const { data: packings, error } = await supabase
    .from('packing_projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Fetch booking info for each packing that has a booking_id
  const packingsWithBookings: PackingWithBooking[] = await Promise.all(
    (packings || []).map(async (packing: Packing) => {
      if (packing.booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
          .eq('id', packing.booking_id)
          .single();
        return { ...packing, booking } as PackingWithBooking;
      }
      return packing as PackingWithBooking;
    })
  );

  return packingsWithBookings;
};

// Fetch a single packing by ID
export const fetchPacking = async (id: string): Promise<PackingWithBooking | null> => {
  const { data: packing, error } = await supabase
    .from('packing_projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!packing) return null;

  if (packing.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
      .eq('id', packing.booking_id)
      .single();
    return { ...packing, booking } as PackingWithBooking;
  }

  return packing as PackingWithBooking;
};

// Create a new packing
export const createPacking = async (packing: { name: string; booking_id?: string | null }): Promise<Packing> => {
  const { data, error } = await supabase
    .from('packing_projects')
    .insert(packing)
    .select()
    .single();

  if (error) throw error;
  return data as Packing;
};

// Update packing status
export const updatePackingStatus = async (id: string, status: PackingStatus): Promise<void> => {
  const { error } = await supabase
    .from('packing_projects')
    .update({ status })
    .eq('id', id);

  if (error) throw error;
};

// Delete a packing
export const deletePacking = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('packing_projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Packing Tasks
export const fetchPackingTasks = async (packingId: string): Promise<PackingTask[]> => {
  const { data, error } = await supabase
    .from('packing_tasks')
    .select('*')
    .eq('packing_id', packingId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as PackingTask[];
};

export const createPackingTask = async (task: {
  packing_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  deadline?: string | null;
  is_info_only?: boolean;
  sort_order?: number;
}): Promise<PackingTask> => {
  const { data, error } = await supabase
    .from('packing_tasks')
    .insert(task)
    .select()
    .single();

  if (error) throw error;
  return data as PackingTask;
};

export const updatePackingTask = async (id: string, updates: Partial<PackingTask>): Promise<void> => {
  const { error } = await supabase
    .from('packing_tasks')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
};

export const deletePackingTask = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('packing_tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Packing Comments
export const fetchPackingComments = async (packingId: string): Promise<PackingComment[]> => {
  const { data, error } = await supabase
    .from('packing_comments')
    .select('*')
    .eq('packing_id', packingId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as PackingComment[];
};

export const createPackingComment = async (comment: {
  packing_id: string;
  author_name: string;
  content: string;
}): Promise<PackingComment> => {
  const { data, error } = await supabase
    .from('packing_comments')
    .insert(comment)
    .select()
    .single();

  if (error) throw error;
  return data as PackingComment;
};

// Packing Files
export const fetchPackingFiles = async (packingId: string): Promise<PackingFile[]> => {
  const { data, error } = await supabase
    .from('packing_files')
    .select('*')
    .eq('packing_id', packingId)
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return (data || []) as PackingFile[];
};

export const uploadPackingFile = async (
  packingId: string,
  file: File,
  uploadedBy?: string
): Promise<PackingFile> => {
  const fileName = `${Date.now()}-${file.name}`;
  const filePath = `packing-files/${packingId}/${fileName}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('packing-files')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('packing-files')
    .getPublicUrl(filePath);

  // Save file record
  const { data, error } = await supabase
    .from('packing_files')
    .insert({
      packing_id: packingId,
      file_name: file.name,
      file_type: file.type,
      url: publicUrl,
      uploaded_by: uploadedBy
    })
    .select()
    .single();

  if (error) throw error;
  return data as PackingFile;
};

export const deletePackingFile = async (id: string, url: string): Promise<void> => {
  // Extract path from URL and delete from storage
  const urlParts = url.split('/packing-files/');
  if (urlParts.length > 1) {
    await supabase.storage.from('packing-files').remove([urlParts[1]]);
  }

  // Delete record
  const { error } = await supabase
    .from('packing_files')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Fetch products for a packing's linked booking
export const fetchPackingProducts = async (bookingId: string): Promise<BookingProduct[]> => {
  const { data, error } = await supabase
    .from('booking_products')
    .select('id, name, quantity, notes, unit_price, total_price, parent_product_id, parent_package_id, is_package_component')
    .eq('booking_id', bookingId)
    .order('id', { ascending: true });

  if (error) throw error;
  
  return (data || []).map(p => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    notes: p.notes || undefined,
    unitPrice: p.unit_price || undefined,
    totalPrice: p.total_price || undefined,
    parentProductId: p.parent_product_id || undefined,
    parentPackageId: p.parent_package_id || undefined,
    isPackageComponent: p.is_package_component || false
  })) as BookingProduct[];
};

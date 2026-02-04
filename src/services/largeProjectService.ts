import { supabase } from "@/integrations/supabase/client";
import type { 
  LargeProject, 
  LargeProjectWithBookings, 
  LargeProjectBooking,
  LargeProjectTask,
  LargeProjectFile,
  LargeProjectComment,
  LargeProjectPurchase,
  LargeProjectBudget,
  LargeProjectStatus 
} from "@/types/largeProject";

// ============================================
// LARGE PROJECT CRUD
// ============================================

export async function fetchLargeProjects(): Promise<LargeProjectWithBookings[]> {
  const { data, error } = await supabase
    .from('large_projects')
    .select(`
      *,
      large_project_bookings (
        id,
        large_project_id,
        booking_id,
        display_name,
        sort_order,
        created_at
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(project => ({
    ...project,
    status: project.status as LargeProjectStatus,
    bookings: (project.large_project_bookings || []).map((b: any) => ({
      ...b,
      large_project_id: b.large_project_id || project.id
    })) as LargeProjectBooking[],
    bookingCount: project.large_project_bookings?.length || 0
  }));
}

export async function fetchLargeProject(id: string): Promise<LargeProjectWithBookings | null> {
  const { data, error } = await supabase
    .from('large_projects')
    .select(`
      *,
      large_project_bookings (
        id,
        large_project_id,
        booking_id,
        display_name,
        sort_order,
        created_at
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  // Fetch full booking data for each linked booking
  const bookingIds = data.large_project_bookings?.map((b: any) => b.booking_id) || [];
  let bookingsData: any[] = [];
  
  if (bookingIds.length > 0) {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, client, booking_number, deliveryaddress, eventdate, rigdaydate, rigdowndate, contact_name')
      .in('id', bookingIds);
    
    if (!bookingsError && bookings) {
      bookingsData = bookings;
    }
  }

  // Merge booking data
  const bookingsWithData: LargeProjectBooking[] = (data.large_project_bookings || []).map((lpb: any) => ({
    ...lpb,
    large_project_id: lpb.large_project_id || id,
    booking: bookingsData.find(b => b.id === lpb.booking_id)
  }));

  return {
    ...data,
    status: data.status as LargeProjectStatus,
    bookings: bookingsWithData,
    bookingCount: bookingsWithData.length
  };
}

export async function createLargeProject(project: {
  name: string;
  description?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  project_leader?: string;
}): Promise<LargeProject> {
  const { data, error } = await supabase
    .from('large_projects')
    .insert({
      name: project.name,
      description: project.description || null,
      location: project.location || null,
      start_date: project.start_date || null,
      end_date: project.end_date || null,
      project_leader: project.project_leader || null,
      status: 'planning'
    })
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    status: data.status as LargeProjectStatus
  };
}

export async function updateLargeProject(id: string, updates: Partial<LargeProject>): Promise<LargeProject> {
  const { data, error } = await supabase
    .from('large_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    status: data.status as LargeProjectStatus
  };
}

export async function deleteLargeProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('large_projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// BOOKING MANAGEMENT
// ============================================

export async function addBookingToLargeProject(
  largeProjectId: string, 
  bookingId: string, 
  displayName?: string
): Promise<LargeProjectBooking> {
  // Get the max sort_order
  const { data: existing } = await supabase
    .from('large_project_bookings')
    .select('sort_order')
    .eq('large_project_id', largeProjectId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('large_project_bookings')
    .insert({
      large_project_id: largeProjectId,
      booking_id: bookingId,
      display_name: displayName || null,
      sort_order: nextOrder
    })
    .select()
    .single();

  if (error) throw error;

  // Also update the booking's large_project_id reference
  await supabase
    .from('bookings')
    .update({ large_project_id: largeProjectId })
    .eq('id', bookingId);

  return data;
}

export async function removeBookingFromLargeProject(largeProjectId: string, bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_bookings')
    .delete()
    .eq('large_project_id', largeProjectId)
    .eq('booking_id', bookingId);

  if (error) throw error;

  // Remove the booking's large_project_id reference
  await supabase
    .from('bookings')
    .update({ large_project_id: null })
    .eq('id', bookingId);
}

export async function updateBookingDisplayName(id: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_bookings')
    .update({ display_name: displayName })
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// TASKS
// ============================================

export async function fetchLargeProjectTasks(largeProjectId: string): Promise<LargeProjectTask[]> {
  const { data, error } = await supabase
    .from('large_project_tasks')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createLargeProjectTask(task: {
  large_project_id: string;
  title: string;
  description?: string;
  assigned_to?: string;
  deadline?: string;
  is_info_only?: boolean;
}): Promise<LargeProjectTask> {
  const { data: existing } = await supabase
    .from('large_project_tasks')
    .select('sort_order')
    .eq('large_project_id', task.large_project_id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('large_project_tasks')
    .insert({
      ...task,
      sort_order: nextOrder,
      completed: false
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateLargeProjectTask(id: string, updates: Partial<LargeProjectTask>): Promise<void> {
  const { error } = await supabase
    .from('large_project_tasks')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteLargeProjectTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// FILES
// ============================================

export async function fetchLargeProjectFiles(largeProjectId: string): Promise<LargeProjectFile[]> {
  const { data, error } = await supabase
    .from('large_project_files')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createLargeProjectFile(file: {
  large_project_id: string;
  file_name: string;
  file_type?: string;
  url: string;
  uploaded_by?: string;
}): Promise<LargeProjectFile> {
  const { data, error } = await supabase
    .from('large_project_files')
    .insert(file)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteLargeProjectFile(id: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_files')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// COMMENTS
// ============================================

export async function fetchLargeProjectComments(largeProjectId: string): Promise<LargeProjectComment[]> {
  const { data, error } = await supabase
    .from('large_project_comments')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createLargeProjectComment(comment: {
  large_project_id: string;
  author_name: string;
  content: string;
}): Promise<LargeProjectComment> {
  const { data, error } = await supabase
    .from('large_project_comments')
    .insert(comment)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteLargeProjectComment(id: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_comments')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// PURCHASES
// ============================================

export async function fetchLargeProjectPurchases(largeProjectId: string): Promise<LargeProjectPurchase[]> {
  const { data, error } = await supabase
    .from('large_project_purchases')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createLargeProjectPurchase(purchase: {
  large_project_id: string;
  description: string;
  amount: number;
  category?: string;
  supplier?: string;
  purchase_date?: string;
  created_by?: string;
}): Promise<LargeProjectPurchase> {
  const { data, error } = await supabase
    .from('large_project_purchases')
    .insert(purchase)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteLargeProjectPurchase(id: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_purchases')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// BUDGET
// ============================================

export async function fetchLargeProjectBudget(largeProjectId: string): Promise<LargeProjectBudget | null> {
  const { data, error } = await supabase
    .from('large_project_budget')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function upsertLargeProjectBudget(budget: {
  large_project_id: string;
  budgeted_hours: number;
  hourly_rate: number;
  description?: string;
}): Promise<LargeProjectBudget> {
  const { data, error } = await supabase
    .from('large_project_budget')
    .upsert(budget, { onConflict: 'large_project_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// UTILITY: Fetch available bookings for large project
// ============================================

export async function fetchAvailableBookingsForLargeProject(): Promise<any[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, client, booking_number, deliveryaddress, eventdate, rigdaydate, rigdowndate, status')
    .eq('status', 'CONFIRMED')
    .is('large_project_id', null)
    .order('eventdate', { ascending: true });

  if (error) throw error;
  return data || [];
}

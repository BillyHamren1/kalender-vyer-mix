import { supabase } from "@/integrations/supabase/client";
import { recomputeBookingAssignment } from "@/services/bookingAssignmentService";
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
import {
  mergeLargeProjectMembers,
  resolvePrimaryBookingId,
  findActiveLargeProjectForBooking,
  LargeProjectMembershipConflictError,
} from "@/lib/largeProject/largeProjectMembers";
export { LargeProjectMembershipConflictError };

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
        created_at,
        bookings:booking_id (
          id,
          booking_number,
          client,
          status
        )
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Legacy-only medlemmar (endast bookings.large_project_id) — samma
  // sammanslagning som kanoniska loadern, så sök/antal blir tillförlitliga.
  const projectIds = (data || []).map((p) => p.id);
  const legacyByProject = new Map<string, Array<{ id: string; booking_number: string | null; client: string | null; status: string | null }>>();
  if (projectIds.length > 0) {
    const { data: legacy, error: legacyErr } = await supabase
      .from('bookings')
      .select('id, booking_number, client, status, large_project_id')
      .in('large_project_id', projectIds);
    if (legacyErr) throw legacyErr;
    for (const b of (legacy || []) as any[]) {
      const arr = legacyByProject.get(b.large_project_id) || [];
      arr.push(b);
      legacyByProject.set(b.large_project_id, arr);
    }
  }

  return (data || []).map(project => {
    const joinRows = (project.large_project_bookings || []) as any[];
    const legacy = legacyByProject.get(project.id) || [];
    const members = mergeLargeProjectMembers(project.id, joinRows, legacy.map((b) => b.id));
    const primaryId = resolvePrimaryBookingId(members, (project as any).primary_booking_id);
    const bookings = members.map((m) => {
      const joinRow = joinRows.find((r) => r.booking_id === m.booking_id);
      const nested = joinRow?.bookings || legacy.find((b) => b.id === m.booking_id) || undefined;
      const { source, ...rest } = m;
      return { ...rest, member_source: source, is_primary: m.booking_id === primaryId, booking: nested, bookings: nested };
    }) as unknown as LargeProjectBooking[];
    return {
      ...project,
      status: project.status as LargeProjectStatus,
      bookings,
      bookingCount: bookings.length,
    };
  });
}

/**
 * Fast core load: project row + linked-bookings stubs (id, booking_id,
 * display_name, sort_order). Does NOT hit `bookings` — that broad
 * `.in('id', […])` is the slowest part of opening a large project
 * (think Almedalen) and is hydrated separately via
 * `fetchLargeProjectBookingsFull` so the page renders immediately.
 */
export async function fetchLargeProjectCore(id: string): Promise<LargeProjectWithBookings | null> {
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

  // Stubs only — booking.* is hydrated separately. Join-tabellen är master,
  // legacy bookings.large_project_id läggs till utan dubbletter.
  const { data: fkRows } = await supabase
    .from('bookings')
    .select('id')
    .eq('large_project_id', id);
  const members = mergeLargeProjectMembers(
    id,
    (data.large_project_bookings || []) as any[],
    ((fkRows || []) as Array<{ id: string }>).map((r) => r.id),
  );
  const primaryId = resolvePrimaryBookingId(members, (data as any).primary_booking_id);
  const bookingStubs: LargeProjectBooking[] = members.map(({ source, ...m }) => ({
    ...m,
    sort_order: m.sort_order ?? 0,
    is_primary: m.booking_id === primaryId,
    member_source: source,
    booking: undefined,
  } as unknown as LargeProjectBooking));

  return {
    ...data,
    status: data.status as LargeProjectStatus,
    bookings: bookingStubs,
    bookingCount: bookingStubs.length,
  };
}


/**
 * Hydrate the wide booking data (delivery, contact, times, status …)
 * for an already-loaded large project. Runs as a separate React Query
 * so the project page can render immediately from the core query.
 */
export async function fetchLargeProjectBookingsFull(bookingIds: string[]): Promise<any[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, client, booking_number, title, deliveryaddress, eventdate, rigdaydate, rigdowndate, contact_name, contact_phone, contact_email, delivery_city, delivery_postal_code, carry_more_than_10m, ground_nails_allowed, exact_time_needed, exact_time_info, internalnotes, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time, status')
    .in('id', bookingIds);
  if (error) throw error;
  return data || [];
}

/**
 * @deprecated Use fetchLargeProjectCore + fetchLargeProjectBookingsFull
 * via useLargeProjectDetail. Kept only for the few legacy callers that
 * still expect a fully merged payload.
 */
export async function fetchLargeProject(id: string): Promise<LargeProjectWithBookings | null> {
  const core = await fetchLargeProjectCore(id);
  if (!core) return null;
  const bookingIds = (core.bookings || []).map(b => b.booking_id);
  const bookingsData = await fetchLargeProjectBookingsFull(bookingIds);
  const merged: LargeProjectBooking[] = (core.bookings || []).map(lpb => ({
    ...lpb,
    booking: bookingsData.find(b => b.id === lpb.booking_id),
  }));
  return { ...core, bookings: merged, bookingCount: merged.length };
}


export async function createLargeProject(project: {
  name: string;
  description?: string;
  location?: string;
  start_date?: string[];
  end_date?: string[];
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

export async function deleteLargeProject(id: string, performedBy?: string): Promise<{ bookingIds: string[] }> {
  const { data: linkedBookings } = await supabase
    .from('large_project_bookings')
    .select('booking_id')
    .eq('large_project_id', id);

  const { data: directBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('large_project_id', id);

  const allBookingIds = [
    ...(linkedBookings || []).map(b => b.booking_id),
    ...(directBookings || []).map(b => b.id),
  ];
  const uniqueBookingIds = [...new Set(allBookingIds)];

  const { data: project } = await supabase.from('large_projects').select('name').eq('id', id).single();

  // Soft-delete
  const { error } = await supabase
    .from('large_projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Kunde inte radera stort projekt: ${error.message}`);

  await (supabase.from('project_audit_log') as any).insert({
    project_id: id, project_type: 'large', action: 'soft_delete',
    booking_id: uniqueBookingIds[0] || null,
    performed_by: performedBy || null,
    details: { name: project?.name, bookingIds: uniqueBookingIds },
  });

  for (const bookingId of uniqueBookingIds) {
    await recomputeBookingAssignment(bookingId);
  }

  return { bookingIds: uniqueBookingIds };
}

export async function restoreLargeProject(id: string): Promise<void> {
  // Soft-delete lämnar medlemsraderna kvar. Har någon medlem under tiden
  // kopplats till ett annat aktivt projekt stoppas återställningen.
  const { data: links, error: linkErr } = await supabase
    .from('large_project_bookings')
    .select('booking_id')
    .eq('large_project_id', id);
  if (linkErr) throw linkErr;
  for (const l of (links || []) as Array<{ booking_id: string }>) {
    const other = await findActiveLargeProjectForBooking(l.booking_id);
    if (other && other.id !== id) throw new LargeProjectMembershipConflictError(other.id, other.name);
  }

  const { error } = await supabase.from('large_projects').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;

  await (supabase.from('project_audit_log') as any).insert({
    project_id: id, project_type: 'large', action: 'restore',
    details: {},
  });
}

export async function fetchDeletedLargeProjects() {
  const { data, error } = await supabase
    .from('large_projects')
    .select('id, name, deleted_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ============================================
// BOOKING MANAGEMENT
// ============================================

/**
 * Kopplar en bokning till ett grupprojekt.
 * - Idempotent: redan kopplad till samma projekt → returnerar befintlig länk
 *   (och läker legacy-fältet om det saknas).
 * - Konflikt: bokningen ligger i ett annat aktivt projekt → LargeProjectMembershipConflictError.
 * - Dual-write: join-rad + bookings.large_project_id. Misslyckas legacy-skrivningen
 *   tas den nya join-raden bort igen och ett riktigt fel kastas (ingen halv koppling).
 * - Bokningen själv (UUID, nummer, orderrader, status) ändras aldrig utöver large_project_id.
 */
export async function addBookingToLargeProject(
  largeProjectId: string,
  bookingId: string,
  displayName?: string
): Promise<LargeProjectBooking> {
  const other = await findActiveLargeProjectForBooking(bookingId);
  if (other && other.id !== largeProjectId) {
    throw new LargeProjectMembershipConflictError(other.id, other.name);
  }

  const { data: existingLink, error: exErr } = await supabase
    .from('large_project_bookings')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existingLink) {
    const { error: healErr } = await supabase
      .from('bookings')
      .update({ large_project_id: largeProjectId })
      .eq('id', bookingId);
    if (healErr) throw new Error(`Kopplingen finns men bokningen kunde inte uppdateras: ${healErr.message}`);
    return existingLink as LargeProjectBooking;
  }

  const { data: existing, error: ordErr } = await supabase
    .from('large_project_bookings')
    .select('sort_order')
    .eq('large_project_id', largeProjectId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (ordErr) throw ordErr;

  const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('large_project_bookings')
    .insert({
      large_project_id: largeProjectId,
      booking_id: bookingId,
      display_name: displayName || null,
      sort_order: nextOrder
    } as any)
    .select()
    .single();

  if (error) throw error;

  const { error: legacyErr } = await supabase
    .from('bookings')
    .update({ large_project_id: largeProjectId })
    .eq('id', bookingId);
  if (legacyErr) {
    // Kompensera: ta bort den nya join-raden så vi inte lämnar halv koppling.
    await supabase.from('large_project_bookings').delete().eq('id', (data as any).id);
    throw new Error(`Kunde inte koppla bokningen till projektet: ${legacyErr.message}`);
  }

  // If project has no dates, inherit from the first booking
  const { data: project } = await supabase
    .from('large_projects')
    .select('start_date, event_date, end_date')
    .eq('id', largeProjectId)
    .single();

  if (project && !project.start_date && !project.event_date && !project.end_date) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('rigdaydate, eventdate, rigdowndate')
      .eq('id', bookingId)
      .single();

    if (booking) {
      await supabase
        .from('large_projects')
        .update({
          start_date: booking.rigdaydate ? [booking.rigdaydate] : null,
          event_date: booking.eventdate ? [booking.eventdate] : null,
          end_date: booking.rigdowndate ? [booking.rigdowndate] : null,
        })
        .eq('id', largeProjectId);
    }
  }

  return data as LargeProjectBooking;
}

/**
 * Skapar ett nytt grupprojekt från en bokning. Bokningen blir grundbokning
 * (första medlem). Om kopplingen misslyckas soft-raderas det nya tomma projektet.
 */
export async function createLargeProjectFromBooking(
  bookingId: string,
  project: { name: string; description?: string; project_leader?: string },
): Promise<{ project: LargeProject; link: LargeProjectBooking }> {
  const other = await findActiveLargeProjectForBooking(bookingId);
  if (other) throw new LargeProjectMembershipConflictError(other.id, other.name);
  const created = await createLargeProject(project);
  try {
    const link = await addBookingToLargeProject(created.id, bookingId);
    // Explicit grundbokning om kolumnen finns (additiv migration, se
    // .lovable/pending-migrations/large-project-primary-booking.sql).
    // Saknas kolumnen gäller "första medlem" som grundbokning.
    await supabase.from('large_projects').update({ primary_booking_id: bookingId } as any).eq('id', created.id);
    return { project: created, link };
  } catch (e) {
    await supabase.from('large_projects').update({ deleted_at: new Date().toISOString() }).eq('id', created.id);
    throw e;
  }
}

/**
 * Tar bort en medlemslänk. Raderar aldrig bokningen eller dess data.
 * Legacy-fältet nollas endast om det pekar på just detta projekt.
 */
export async function removeBookingFromLargeProject(largeProjectId: string, bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_bookings')
    .delete()
    .eq('large_project_id', largeProjectId)
    .eq('booking_id', bookingId);

  if (error) throw error;

  const { error: legacyErr } = await supabase
    .from('bookings')
    .update({ large_project_id: null })
    .eq('id', bookingId)
    .eq('large_project_id', largeProjectId);
  if (legacyErr) throw new Error(`Länken togs bort men bokningens projektfält kunde inte rensas: ${legacyErr.message}`);
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

export async function deleteLargeProjectFile(id: string, url?: string): Promise<void> {
  // Try to remove from storage if URL provided
  if (url) {
    const urlParts = url.split('/project-files/');
    if (urlParts.length > 1) {
      const filePath = urlParts[1];
      await supabase.storage.from('project-files').remove([filePath]);
    }
  }

  const { error } = await supabase
    .from('large_project_files')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function uploadLargeProjectFile(
  largeProjectId: string,
  file: File,
  uploadedBy?: string
): Promise<LargeProjectFile> {
  const fileName = `large-${largeProjectId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('project-files')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('project-files')
    .getPublicUrl(fileName);

  const { data, error } = await supabase
    .from('large_project_files')
    .insert({
      large_project_id: largeProjectId,
      file_name: file.name,
      file_type: file.type,
      url: urlData.publicUrl,
      uploaded_by: uploadedBy || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// COMMENTS — REMOVED. Use `internalnotes` on large_projects instead.
// ============================================

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

export async function updateLargeProjectPurchase(id: string, updates: Partial<{
  description: string;
  amount: number;
  category: string | null;
  supplier: string | null;
  purchase_date: string | null;
  receipt_url: string | null;
}>): Promise<void> {
  const { error } = await supabase
    .from('large_project_purchases')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
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

// ============================================
// GANTT STEPS
// ============================================

export interface LargeProjectGanttStep {
  id: string;
  large_project_id: string;
  step_key: string;
  step_name: string;
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function fetchLargeProjectGanttSteps(largeProjectId: string): Promise<LargeProjectGanttStep[]> {
  const { data, error } = await supabase
    .from('large_project_gantt_steps')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function saveLargeProjectGanttSteps(
  largeProjectId: string,
  steps: Array<{
    key: string;
    name: string;
    start_date: string;
    end_date: string;
    is_milestone: boolean;
  }>
): Promise<LargeProjectGanttStep[]> {
  // Delete existing steps
  await supabase
    .from('large_project_gantt_steps')
    .delete()
    .eq('large_project_id', largeProjectId);

  // Insert new steps
  const stepsToInsert = steps.map((step, index) => ({
    large_project_id: largeProjectId,
    step_key: step.key,
    step_name: step.name,
    start_date: step.start_date,
    end_date: step.end_date,
    is_milestone: step.is_milestone,
    sort_order: index
  }));

  const { data, error } = await supabase
    .from('large_project_gantt_steps')
    .insert(stepsToInsert)
    .select();

  if (error) throw error;
  return data || [];
}

// ============================================
// LARGE PROJECT STAFF (Project Team)
// ============================================

export interface LargeProjectStaffMember {
  id: string;
  large_project_id: string;
  staff_id: string;
  role: string;
  created_at: string;
  organization_id: string;
  staff_name?: string;
}

export async function fetchLargeProjectStaff(largeProjectId: string): Promise<LargeProjectStaffMember[]> {
  const { data, error } = await supabase
    .from('large_project_staff')
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Resolve staff names
  const staffIds = (data || []).map(s => s.staff_id);
  if (staffIds.length === 0) return [];

  const { data: staffMembers } = await supabase
    .from('staff_members' as any)
    .select('id, name')
    .in('id', staffIds);

  const nameMap = new Map((staffMembers || []).map((s: any) => [s.id, s.name]));

  return (data || []).map(s => ({
    ...s,
    staff_name: nameMap.get(s.staff_id) || s.staff_id,
  }));
}

export async function addLargeProjectStaff(
  largeProjectId: string,
  staffId: string,
  role: string = 'field'
): Promise<void> {
  const { error } = await supabase
    .from('large_project_staff')
    .insert({ large_project_id: largeProjectId, staff_id: staffId, role } as any);

  if (error) throw error;
}

export async function removeLargeProjectStaff(id: string): Promise<void> {
  const { error } = await supabase
    .from('large_project_staff')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

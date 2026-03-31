import { supabase } from "@/integrations/supabase/client";
import { subDays, addDays, format, eachDayOfInterval, parseISO } from "date-fns";

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type TaskReadiness = 'ready' | 'missing_information' | 'waiting_for_decision' | 'waiting_for_external';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface EstablishmentTask {
  id: string;
  booking_id: string | null;
  large_project_id: string | null;
  title: string;
  category: string;
  start_date: string;
  end_date: string;
  completed: boolean;
  sort_order: number;
  notes: string | null;
  assigned_to: string | null;
  assigned_to_ids: string[];
  source: string;
  source_product_id: string | null;
  source_product_ids: string[] | null;
  status: TaskStatus;
  readiness: TaskReadiness;
  priority: TaskPriority;
  description: string | null;
  blockers: string | null;
  blocker_responsible: string | null;
  decision_needed: boolean;
}

// VISIBILITY RULE: booking_staff_assignments is the SINGLE source of truth for
// mobile job visibility. When staff are assigned to tasks, we auto-create
// booking_staff_assignments rows with team_id='activity' to ensure the job
// appears in their mobile app. This sentinel team_id distinguishes activity-based
// assignments from team-scheduled ones.
const ACTIVITY_TEAM_ID = 'activity';

/**
 * Ensures booking_staff_assignments rows exist for all staff assigned to a task.
 * This is the mechanism that makes jobs visible in the mobile app when staff
 * are assigned to activities/tasks rather than through team scheduling.
 */
const ensureBookingStaffAssignments = async (
  bookingId: string | null,
  staffIds: string[],
  startDate: string,
  endDate: string
): Promise<void> => {
  if (!bookingId || staffIds.length === 0) return;

  try {
    const dates = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    }).map(d => format(d, 'yyyy-MM-dd'));

    const rows = staffIds.flatMap(staffId =>
      dates.map(date => ({
        booking_id: bookingId,
        staff_id: staffId,
        team_id: ACTIVITY_TEAM_ID,
        assignment_date: date,
      }))
    );

    // upsert with onConflict to avoid duplicates
    const { error } = await supabase
      .from('booking_staff_assignments')
      .upsert(rows, { onConflict: 'booking_id,staff_id,assignment_date', ignoreDuplicates: true });

    if (error) {
      console.error('Failed to sync booking_staff_assignments from task:', error);
    }
  } catch (err) {
    console.error('Error in ensureBookingStaffAssignments:', err);
  }
};

const TASK_SELECT = 'id, booking_id, large_project_id, title, category, start_date, end_date, completed, sort_order, notes, assigned_to, assigned_to_ids, source, source_product_id, source_product_ids, status, readiness, priority, description, blockers, blocker_responsible, decision_needed';

export const fetchEstablishmentTasks = async (bookingId: string): Promise<EstablishmentTask[]> => {
  const { data, error } = await supabase
    .from('establishment_tasks')
    .select(TASK_SELECT)
    .eq('booking_id', bookingId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as EstablishmentTask[];
};

export const fetchEstablishmentTasksByProject = async (largeProjectId: string): Promise<EstablishmentTask[]> => {
  const { data, error } = await supabase
    .from('establishment_tasks')
    .select(TASK_SELECT)
    .eq('large_project_id', largeProjectId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as EstablishmentTask[];
};

export const createEstablishmentTask = async (task: {
  booking_id?: string | null;
  large_project_id?: string | null;
  title: string;
  category: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  sort_order?: number;
  source?: string;
  source_product_id?: string;
  source_product_ids?: string[];
  notes?: string;
  assigned_to?: string | null;
  assigned_to_ids?: string[];
  status?: TaskStatus;
  readiness?: TaskReadiness;
  priority?: TaskPriority;
  description?: string | null;
  blockers?: string | null;
  blocker_responsible?: string | null;
  decision_needed?: boolean;
}): Promise<EstablishmentTask> => {
  // Ensure assigned_to_ids is always the primary source of truth
  const assignedTo = task.assigned_to ?? null;
  const assignedToIds = task.assigned_to_ids
    ? task.assigned_to_ids
    : assignedTo
      ? [assignedTo]
      : [];

  const { data, error } = await supabase
    .from('establishment_tasks')
    .insert({
      booking_id: task.booking_id ?? null,
      large_project_id: task.large_project_id ?? null,
      title: task.title,
      category: task.category,
      start_date: task.start_date,
      end_date: task.end_date,
      start_time: task.start_time ?? null,
      end_time: task.end_time ?? null,
      sort_order: task.sort_order ?? 0,
      source: task.source ?? 'manual',
      source_product_id: task.source_product_id ?? null,
      source_product_ids: task.source_product_ids ?? null,
      notes: task.notes ?? null,
      assigned_to: assignedTo,
      assigned_to_ids: assignedToIds,
      status: task.status ?? 'not_started',
      readiness: task.readiness ?? 'missing_information',
      priority: task.priority ?? 'medium',
      description: task.description ?? null,
      blockers: task.blockers ?? null,
      blocker_responsible: task.blocker_responsible ?? null,
      decision_needed: task.decision_needed ?? false,
    })
    .select()
    .single();

  if (error) throw error;

  // VISIBILITY SYNC: Ensure assigned staff can see this job in mobile
  if (assignedToIds.length > 0 && task.booking_id) {
    ensureBookingStaffAssignments(task.booking_id, assignedToIds, task.start_date, task.end_date);
  }

  return data as EstablishmentTask;
};

export const updateEstablishmentTask = async (
  id: string,
  updates: Partial<Pick<EstablishmentTask, 'title' | 'category' | 'start_date' | 'end_date' | 'completed' | 'sort_order' | 'notes' | 'assigned_to' | 'assigned_to_ids' | 'status' | 'readiness' | 'priority' | 'description' | 'blockers' | 'blocker_responsible' | 'decision_needed'>>
): Promise<void> => {
  // Sync completed with status
  if (updates.status === 'done' && updates.completed === undefined) {
    updates.completed = true;
  }
  if (updates.completed === true && !updates.status) {
    updates.status = 'done';
  }
  if (updates.completed === false && !updates.status) {
    updates.status = 'not_started';
  }

  // SAFEGUARD: If assigned_to is being set but assigned_to_ids is not, sync them
  if (updates.assigned_to && !updates.assigned_to_ids) {
    // Fetch current assigned_to_ids to merge
    const { data: current } = await supabase
      .from('establishment_tasks')
      .select('assigned_to_ids')
      .eq('id', id)
      .single();
    const currentIds: string[] = (current?.assigned_to_ids as string[]) || [];
    if (!currentIds.includes(updates.assigned_to)) {
      updates.assigned_to_ids = [...currentIds, updates.assigned_to];
    }
  }

  // SAFEGUARD: If assigned_to_ids is being set, keep assigned_to in sync (first entry)
  if (updates.assigned_to_ids && updates.assigned_to === undefined) {
    updates.assigned_to = updates.assigned_to_ids[0] || null;
  }

  const { error } = await supabase
    .from('establishment_tasks')
    .update(updates)
    .eq('id', id);

  if (error) throw error;

  // VISIBILITY SYNC: If assigned_to_ids changed, ensure booking_staff_assignments exist
  if (updates.assigned_to_ids && updates.assigned_to_ids.length > 0) {
    // Fetch the task's booking_id and dates to create BSA rows
    const { data: taskData } = await supabase
      .from('establishment_tasks')
      .select('booking_id, start_date, end_date')
      .eq('id', id)
      .single();
    if (taskData?.booking_id) {
      ensureBookingStaffAssignments(taskData.booking_id, updates.assigned_to_ids, taskData.start_date, taskData.end_date);
    }
  }
};

export const bulkUpdateEstablishmentTasks = async (
  ids: string[],
  updates: Partial<Pick<EstablishmentTask, 'assigned_to' | 'assigned_to_ids' | 'start_date' | 'end_date' | 'status' | 'priority'>>
): Promise<void> => {
  if (ids.length === 0) return;

  // Sync assigned_to and assigned_to_ids
  if (updates.assigned_to_ids && updates.assigned_to === undefined) {
    updates.assigned_to = updates.assigned_to_ids[0] || null;
  }
  if (updates.assigned_to && !updates.assigned_to_ids) {
    updates.assigned_to_ids = [updates.assigned_to];
  }

  const { error } = await supabase
    .from('establishment_tasks')
    .update(updates)
    .in('id', ids);
  if (error) throw error;
};

export const deleteEstablishmentTask = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('establishment_tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const generateDefaultTasks = async (
  bookingId: string,
  rigDate: string,
  eventDate: string
): Promise<EstablishmentTask[]> => {
  const rig = new Date(rigDate);
  const event = new Date(eventDate);

  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  const defaults = [
    { title: 'Lastning på lager', category: 'material', start_date: fmt(subDays(rig, 1)), end_date: fmt(subDays(rig, 1)), sort_order: 0 },
    { title: 'Transport till plats', category: 'transport', start_date: fmt(rig), end_date: fmt(rig), sort_order: 1 },
    { title: 'Personal anländer', category: 'personal', start_date: fmt(rig), end_date: fmt(rig), sort_order: 2 },
    { title: 'Lossning & uppställning', category: 'installation', start_date: fmt(rig), end_date: fmt(rig), sort_order: 3 },
    { title: 'Montering dag 1', category: 'installation', start_date: fmt(rig), end_date: fmt(rig), sort_order: 4 },
    { title: 'Montering dag 2', category: 'installation', start_date: fmt(addDays(rig, 1)), end_date: fmt(addDays(rig, 1)), sort_order: 5 },
    { title: 'Slutkontroll & städning', category: 'kontroll', start_date: fmt(subDays(event, 1)), end_date: fmt(subDays(event, 1)), sort_order: 6 },
    { title: 'Överlämning till kund', category: 'kontroll', start_date: fmt(event), end_date: fmt(event), sort_order: 7 },
  ];

  const rows = defaults.map(d => ({
    booking_id: bookingId,
    source: 'default',
    status: 'not_started' as TaskStatus,
    readiness: 'missing_information' as TaskReadiness,
    priority: 'medium' as TaskPriority,
    ...d,
  }));

  const { data, error } = await supabase
    .from('establishment_tasks')
    .insert(rows)
    .select();

  if (error) throw error;
  return (data || []) as EstablishmentTask[];
};

export const generateDefaultTasksForProject = async (
  largeProjectId: string,
  startDate: string,
  endDate: string
): Promise<EstablishmentTask[]> => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  const defaults = [
    { title: 'Lastning på lager', category: 'material', start_date: fmt(subDays(start, 1)), end_date: fmt(subDays(start, 1)), sort_order: 0 },
    { title: 'Transport till plats', category: 'transport', start_date: fmt(start), end_date: fmt(start), sort_order: 1 },
    { title: 'Personal anländer', category: 'personal', start_date: fmt(start), end_date: fmt(start), sort_order: 2 },
    { title: 'Lossning & uppställning', category: 'installation', start_date: fmt(start), end_date: fmt(start), sort_order: 3 },
    { title: 'Montering dag 1', category: 'installation', start_date: fmt(start), end_date: fmt(start), sort_order: 4 },
    { title: 'Montering dag 2', category: 'installation', start_date: fmt(addDays(start, 1)), end_date: fmt(addDays(start, 1)), sort_order: 5 },
    { title: 'Slutkontroll & städning', category: 'kontroll', start_date: fmt(subDays(end, 1)), end_date: fmt(subDays(end, 1)), sort_order: 6 },
    { title: 'Överlämning till kund', category: 'kontroll', start_date: fmt(end), end_date: fmt(end), sort_order: 7 },
  ];

  const rows = defaults.map(d => ({
    large_project_id: largeProjectId,
    source: 'default',
    status: 'not_started' as TaskStatus,
    readiness: 'missing_information' as TaskReadiness,
    priority: 'medium' as TaskPriority,
    ...d,
  }));

  const { data, error } = await supabase
    .from('establishment_tasks')
    .insert(rows)
    .select();

  if (error) throw error;
  return (data || []) as EstablishmentTask[];
};

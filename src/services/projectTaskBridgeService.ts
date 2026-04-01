/**
 * Bridge service: mirrors project_tasks / large_project_tasks into establishment_tasks.
 * This is a SOFT BRIDGE — the old system keeps working independently.
 * The execution task is created as a 'pm' type task in the establishment system.
 */
import { supabase } from "@/integrations/supabase/client";
import { createEstablishmentTask } from "./establishmentTaskService";
import { format } from "date-fns";

interface BridgeContext {
  /** For regular projects */
  bookingId?: string | null;
  /** For large projects */
  largeProjectId?: string | null;
}

/**
 * After a project task is created, mirror it into the execution layer.
 * Returns the execution_task_id if successful, null otherwise.
 */
export async function bridgeProjectTaskToExecution(
  projectTaskId: string,
  task: {
    title: string;
    description?: string | null;
    assigned_to?: string | null;
    deadline?: string | null;
  },
  context: BridgeContext,
  tableName: 'project_tasks' | 'large_project_tasks'
): Promise<string | null> {
  try {
    // Guard: check if this project task already has a linked execution task
    const { data: existing } = await supabase
      .from(tableName)
      .select('execution_task_id')
      .eq('id', projectTaskId)
      .maybeSingle();

    if ((existing as any)?.execution_task_id) {
      return (existing as any).execution_task_id;
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const dueDate = task.deadline || null;

    const executionTask = await createEstablishmentTask({
      booking_id: context.bookingId ?? null,
      large_project_id: context.largeProjectId ?? null,
      title: task.title,
      category: 'general',
      start_date: today,
      end_date: dueDate || today,
      task_type: 'pm',
      priority: 'medium',
      description: task.description ?? null,
      assigned_to: task.assigned_to ?? null,
      assigned_to_ids: task.assigned_to ? [task.assigned_to] : [],
      due_date: dueDate,
      source: 'coordination',
      status: 'todo',
    });

    // Store the link back on the project task
    const { error } = await supabase
      .from(tableName)
      .update({ execution_task_id: executionTask.id } as any)
      .eq('id', projectTaskId);

    if (error) {
      console.error('[Bridge] Failed to store execution_task_id:', error);
    }

    return executionTask.id;
  } catch (err) {
    // Bridge failures are non-critical — log but don't block
    console.error('[Bridge] Failed to create execution task:', err);
    return null;
  }
}

/**
 * Sync title/deadline updates from project task to linked execution task.
 * Non-critical — failures are logged but don't block.
 */
export async function syncProjectTaskToExecution(
  executionTaskId: string,
  updates: { title?: string; description?: string | null; deadline?: string | null; completed?: boolean; assigned_to?: string | null }
): Promise<void> {
  try {
    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.assigned_to !== undefined) {
      const staffId = updates.assigned_to || null;
      patch.assigned_to = staffId;
      patch.assigned_to_ids = staffId ? [staffId] : [];
    }
    if (updates.deadline !== undefined) {
      patch.due_date = updates.deadline;
      patch.end_date = updates.deadline || format(new Date(), 'yyyy-MM-dd');
    }
    if (updates.completed === true) {
      patch.status = 'done';
      patch.completed = true;
    } else if (updates.completed === false) {
      // Only revert to 'todo' if execution task is still in initial state
      // Don't regress from in_progress or blocked
      const { data: current } = await supabase
        .from('establishment_tasks')
        .select('status')
        .eq('id', executionTaskId)
        .maybeSingle();
      if (current?.status === 'done' || current?.status === 'todo') {
        patch.status = 'todo';
        patch.completed = false;
      }
    }

    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase
      .from('establishment_tasks')
      .update(patch)
      .eq('id', executionTaskId);

    if (error) {
      console.error('[Bridge] Failed to sync to execution task:', error);
    }
  } catch (err) {
    console.error('[Bridge] Sync error:', err);
  }
}

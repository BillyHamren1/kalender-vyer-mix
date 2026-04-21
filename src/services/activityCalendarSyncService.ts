/**
 * ============================================================
 * activityCalendarSyncService.ts
 * ============================================================
 *
 * Opt-in sync of establishment_tasks (activities) to calendar_events
 * so they appear as real events in the personal/team calendar.
 *
 * Architecture:
 * - event_type = 'activity' → bypassed by import-bookings reconciler
 * - One calendar row per activity, spans start_date → end_date
 * - resource_id = 'team-tasks' (same column as the read-only overlay)
 * - establishment_tasks.calendar_event_id links back; FK ON DELETE SET NULL
 * ============================================================
 */

import { supabase } from "@/integrations/supabase/client";

const RESOURCE_ID = "team-tasks";

const TASK_TYPE_LABEL: Record<string, string> = {
  crew: "Fält",
  pm: "PL",
  logistics: "Logistik",
  admin: "Admin",
};

interface TaskRow {
  id: string;
  title: string;
  category: string | null;
  task_type: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  organization_id: string;
  calendar_event_id: string | null;
}

const buildEventPayload = async (task: TaskRow) => {
  // Resolve booking context if present
  let bookingNumber: string | null = null;
  let address: string | null = null;
  let calendarBookingId: string | null = null;

  if (task.booking_id) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("booking_number, deliveryaddress, delivery_city")
      .eq("id", task.booking_id)
      .maybeSingle();
    bookingNumber = booking?.booking_number || null;
    address = [booking?.deliveryaddress, booking?.delivery_city].filter(Boolean).join(", ") || null;
    calendarBookingId = task.booking_id;
  } else if (task.large_project_id) {
    calendarBookingId = `project-${task.large_project_id}`;
    const { data: lp } = await supabase
      .from("large_projects")
      .select("project_number, address, address_city")
      .eq("id", task.large_project_id)
      .maybeSingle();
    bookingNumber = lp?.project_number || null;
    address = [lp?.address, lp?.address_city].filter(Boolean).join(", ") || null;
  }

  const startDate = task.start_date;
  const endDate = task.end_date || task.start_date;
  const startTime = task.start_time || "08:00";
  const endTime = task.end_time || "16:00";

  const typeLabel = TASK_TYPE_LABEL[task.task_type || "crew"] || "Aktivitet";
  const title = `[${typeLabel}] ${task.title}`;

  return {
    title,
    start_time: `${startDate}T${startTime.length === 5 ? startTime + ":00" : startTime}`,
    end_time: `${endDate}T${endTime.length === 5 ? endTime + ":00" : endTime}`,
    resource_id: RESOURCE_ID,
    event_type: "activity",
    booking_id: calendarBookingId,
    booking_number: bookingNumber,
    delivery_address: address || "",
    organization_id: task.organization_id,
    source_date: startDate,
  };
};

const fetchTask = async (taskId: string): Promise<TaskRow | null> => {
  const { data, error } = await supabase
    .from("establishment_tasks")
    .select(
      "id, title, category, task_type, start_date, end_date, start_time, end_time, booking_id, large_project_id, organization_id, calendar_event_id"
    )
    .eq("id", taskId)
    .maybeSingle();
  if (error) {
    console.error("[activityCalendarSync] fetchTask failed:", error);
    return null;
  }
  return data as TaskRow | null;
};

/**
 * Create or update a calendar_events row for the given activity.
 * If task already has calendar_event_id → update; else insert + link.
 */
export const syncActivityToCalendar = async (taskId: string): Promise<void> => {
  const task = await fetchTask(taskId);
  if (!task) throw new Error("Aktiviteten hittades inte");

  const payload = await buildEventPayload(task);

  if (task.calendar_event_id) {
    // Update existing
    const { error } = await supabase
      .from("calendar_events")
      .update(payload)
      .eq("id", task.calendar_event_id);
    if (error) {
      console.error("[activityCalendarSync] update failed:", error);
      throw error;
    }
    return;
  }

  // Insert new
  const { data: inserted, error: insertError } = await supabase
    .from("calendar_events")
    .insert(payload)
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[activityCalendarSync] insert failed:", insertError);
    throw insertError ?? new Error("Kunde inte skapa kalenderhändelse");
  }

  const { error: linkError } = await supabase
    .from("establishment_tasks")
    .update({ calendar_event_id: inserted.id })
    .eq("id", taskId);

  if (linkError) {
    console.error("[activityCalendarSync] link failed:", linkError);
    // Best effort: don't throw — event exists, just not linked
  }
};

/**
 * Remove the calendar_events row linked to this activity and clear the link.
 */
export const removeActivityFromCalendar = async (taskId: string): Promise<void> => {
  const task = await fetchTask(taskId);
  if (!task || !task.calendar_event_id) return;

  const { error: delError } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", task.calendar_event_id);

  if (delError) {
    console.error("[activityCalendarSync] delete failed:", delError);
    throw delError;
  }

  await supabase
    .from("establishment_tasks")
    .update({ calendar_event_id: null })
    .eq("id", taskId);
};

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarEvent } from "@/components/Calendar/ResourceData";
import type { TaskType } from "@/services/establishmentTaskService";

/**
 * Maps establishment_tasks with dates into CalendarEvent objects
 * for read-only visualization in the planning calendar.
 *
 * IMPORTANT: This is ONLY visualization — no auto-creation or auto-assignment.
 */

const TASK_TYPE_RESOURCE: Record<TaskType, string> = {
  crew: "team-tasks",
  pm: "team-tasks",
  logistics: "team-tasks",
  admin: "team-tasks",
};

const TASK_TYPE_COLOR: Record<TaskType, string> = {
  crew: "#DBEAFE",     // blue-100
  pm: "#E9D5FF",       // purple-100
  logistics: "#FEF3C7", // amber-100
  admin: "#F1F5F9",     // slate-100
};

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  crew: "Fält",
  pm: "PL",
  logistics: "Logistik",
  admin: "Admin",
};

export function useTaskCalendarEvents(enabled: boolean) {
  const { data: rawTasks = [], isLoading } = useQuery({
    queryKey: ["calendar-task-overlay"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishment_tasks")
        .select(
          "id, title, task_type, start_date, end_date, due_date, status, priority, booking_id, large_project_id, assigned_to_ids"
        )
        .neq("status", "done")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 30_000,
  });

  const events: CalendarEvent[] = useMemo(() => {
    if (!enabled) return [];

    return rawTasks
      .filter((t) => t.start_date || t.due_date)
      .map((t) => {
        const taskType = (t.task_type as TaskType) || "crew";
        const startStr = t.start_date || t.due_date!;
        const endStr = t.end_date || t.due_date || startStr;

        // Create full-day-style events: 08:00 – 09:00 as visual marker
        const start = `${startStr}T08:00:00`;
        const end = `${endStr}T09:00:00`;

        const typeLabel = TASK_TYPE_LABEL[taskType] || "Uppgift";

        return {
          id: `task-${t.id}`,
          title: `[${typeLabel}] ${t.title}`,
          start,
          end,
          resourceId: TASK_TYPE_RESOURCE[taskType],
          eventType: `task_${taskType}` as CalendarEvent["eventType"],
          backgroundColor: TASK_TYPE_COLOR[taskType],
          borderColor: TASK_TYPE_COLOR[taskType],
          extendedProps: {
            isTaskOverlay: true,
            taskId: t.id,
            taskType,
            bookingId: t.booking_id,
            status: t.status,
            priority: t.priority,
          },
        } as CalendarEvent;
      });
  }, [rawTasks, enabled]);

  return { taskEvents: events, isLoading };
}

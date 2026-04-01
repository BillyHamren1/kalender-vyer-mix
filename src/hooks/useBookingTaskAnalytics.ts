/**
 * useBookingTaskAnalytics — Same analytics as useTaskAnalytics but for single-booking projects.
 * Queries establishment_tasks by booking_id instead of large_project_id.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, addDays, isBefore, isToday, isTomorrow, isWithinInterval, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { EstablishmentTask } from "@/services/establishmentTaskService";
import type { TaskAnalytics, TeamMemberWorkload, CriticalIssue } from "@/hooks/useTaskAnalytics";

const TASK_SELECT =
  "id, booking_id, large_project_id, title, category, start_date, end_date, completed, sort_order, notes, assigned_to, assigned_to_ids, source, source_product_id, source_product_ids, status, readiness, priority, description, blockers, blocker_responsible, decision_needed, task_type, assigned_user_id, due_date, start_date_ts, linked_entity_type, linked_entity_id";

const hasValidDates = (task: EstablishmentTask) =>
  task.start_date && task.end_date && task.start_date !== "" && task.end_date !== "";

const isOverdue = (task: EstablishmentTask, today: Date) => {
  if (task.status === "done") return false;
  if (!task.end_date) return false;
  try {
    return isBefore(startOfDay(new Date(task.end_date)), today);
  } catch {
    return false;
  }
};

export const useBookingTaskAnalytics = (bookingId: string | null | undefined) => {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["establishment-tasks-analytics-booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishment_tasks")
        .select(TASK_SELECT)
        .eq("booking_id", bookingId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as EstablishmentTask[];
    },
    enabled: !!bookingId,
    refetchInterval: 30_000,
  });

  const analytics = useMemo<TaskAnalytics>(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);

    const activeTasks = tasks;
    const completed = activeTasks.filter((t) => t.status === "done");
    const blocked = activeTasks.filter((t) => t.status === "blocked");
    const inProgress = activeTasks.filter((t) => t.status === "in_progress");
    const todoTasks = activeTasks.filter((t) => t.status === "todo");
    const withDates = activeTasks.filter((t) => hasValidDates(t));
    const withoutDates = activeTasks.filter((t) => !hasValidDates(t));
    const withoutOwner = activeTasks.filter(
      (t) =>
        (!t.assigned_to_ids || t.assigned_to_ids.length === 0) &&
        !t.assigned_to &&
        !t.assigned_user_id &&
        t.status !== "done"
    );
    const overdueTasks = activeTasks.filter((t) => isOverdue(t, today));
    const waitingForDecision = activeTasks.filter((t) => t.decision_needed && t.status !== "done");
    const missingSetup = activeTasks.filter((t) => t.readiness === "missing_information" && t.status !== "done");
    const waitingForExternal = activeTasks.filter((t) => t.readiness === "waiting_for_external" && t.status !== "done");

    // Team workload
    const staffMap = new Map<string, { tasks: EstablishmentTask[] }>();
    activeTasks.forEach((t) => {
      const ids = t.assigned_to_ids?.length ? t.assigned_to_ids : t.assigned_to ? [t.assigned_to] : [];
      ids.forEach((staffId) => {
        if (!staffMap.has(staffId)) staffMap.set(staffId, { tasks: [] });
        staffMap.get(staffId)!.tasks.push(t);
      });
    });

    const teamWorkload: TeamMemberWorkload[] = Array.from(staffMap.entries()).map(([staffId, { tasks: staffTasks }]) => {
      const active = staffTasks.filter((t) => t.status !== "done");
      return {
        staffId,
        staffName: staffId,
        totalTasks: staffTasks.length,
        inProgress: staffTasks.filter((t) => t.status === "in_progress").length,
        completed: staffTasks.filter((t) => t.status === "done").length,
        overdue: staffTasks.filter((t) => isOverdue(t, today)).length,
        blocked: staffTasks.filter((t) => t.status === "blocked").length,
        level: (active.length <= 2 ? "low" : active.length <= 5 ? "normal" : "high") as "low" | "normal" | "high",
      };
    });

    const upcomingToday = activeTasks.filter((t) => {
      if (t.status === "done" || !t.start_date) return false;
      try { return isToday(new Date(t.start_date)); } catch { return false; }
    });
    const upcomingTomorrow = activeTasks.filter((t) => {
      if (t.status === "done" || !t.start_date) return false;
      try { return isTomorrow(new Date(t.start_date)); } catch { return false; }
    });
    const upcomingWeek = activeTasks.filter((t) => {
      if (t.status === "done" || !t.start_date) return false;
      try {
        const start = startOfDay(new Date(t.start_date));
        return isWithinInterval(start, { start: addDays(tomorrow, 1), end: weekEnd });
      } catch { return false; }
    });
    const todayStr = format(today, "yyyy-MM-dd");
    const upcomingNext10 = activeTasks
      .filter((t) => t.status !== "done" && t.start_date && t.start_date >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 10);

    const criticalIssues: CriticalIssue[] = [
      ...blocked.map((t) => ({
        taskId: t.id, taskTitle: t.title, type: "blocked" as const,
        assignedTo: t.assigned_to_ids?.[0] || t.assigned_to || t.assigned_user_id || null,
        startDate: t.start_date, endDate: t.end_date,
        blockerReason: t.blockers, blockerResponsible: t.blocker_responsible, blockedSince: t.start_date,
      })),
      ...overdueTasks.filter((t) => t.status !== "blocked").map((t) => ({
        taskId: t.id, taskTitle: t.title, type: "overdue" as const,
        assignedTo: t.assigned_to_ids?.[0] || t.assigned_to || t.assigned_user_id || null,
        startDate: t.start_date, endDate: t.end_date,
      })),
      ...waitingForDecision.filter((t) => t.status !== "blocked" && !isOverdue(t, today)).map((t) => ({
        taskId: t.id, taskTitle: t.title, type: "decision_needed" as const,
        assignedTo: t.assigned_to_ids?.[0] || t.assigned_to || t.assigned_user_id || null,
        startDate: t.start_date, endDate: t.end_date,
      })),
      ...missingSetup.filter((t) => t.status !== "blocked" && !t.decision_needed && !isOverdue(t, today)).map((t) => ({
        taskId: t.id, taskTitle: t.title, type: "missing_setup" as const,
        assignedTo: t.assigned_to_ids?.[0] || t.assigned_to || t.assigned_user_id || null,
        startDate: t.start_date, endDate: t.end_date,
      })),
      ...waitingForExternal.filter((t) => t.status !== "blocked" && t.readiness !== "missing_information" && !isOverdue(t, today)).map((t) => ({
        taskId: t.id, taskTitle: t.title, type: "waiting_for_external" as const,
        assignedTo: t.assigned_to_ids?.[0] || t.assigned_to || t.assigned_user_id || null,
        startDate: t.start_date, endDate: t.end_date,
      })),
      ...withoutOwner.filter((t) => t.status !== "blocked" && !isOverdue(t, today) && !t.decision_needed).map((t) => ({
        taskId: t.id, taskTitle: t.title, type: "no_owner" as const,
        assignedTo: null, startDate: t.start_date, endDate: t.end_date,
      })),
      ...withoutDates.filter((t) => t.status !== "done" && t.status !== "blocked").map((t) => ({
        taskId: t.id, taskTitle: t.title, type: "no_dates" as const,
        assignedTo: t.assigned_to_ids?.[0] || t.assigned_to || t.assigned_user_id || null,
        startDate: t.start_date, endDate: t.end_date,
      })),
    ];

    return {
      tasks,
      total: activeTasks.length,
      completed: completed.length,
      withDates: withDates.length,
      withoutDates: withoutDates.length,
      withoutOwner: withoutOwner.length,
      overdue: overdueTasks.length,
      blocked: blocked.length,
      inProgress: inProgress.length,
      todo: todoTasks.length,
      waitingForDecision: waitingForDecision.length,
      missingSetup: missingSetup.length,
      waitingForExternal: waitingForExternal.length,
      teamWorkload,
      upcomingToday,
      upcomingTomorrow,
      upcomingWeek,
      upcomingNext10,
      nextUpcoming: null,
      criticalIssues,
    };
  }, [tasks]);

  return { analytics, isLoading, tasks };
};

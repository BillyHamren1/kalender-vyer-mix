import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, addDays, isBefore, isAfter, isEqual, isToday, isTomorrow, isWithinInterval } from "date-fns";
import { fetchEstablishmentTasksByProject } from "@/services/establishmentTaskService";
import type { EstablishmentTask } from "@/services/establishmentTaskService";

export interface TaskAnalytics {
  tasks: EstablishmentTask[];
  total: number;
  completed: number;
  withDates: number;
  withoutDates: number;
  withoutOwner: number;
  overdue: number;
  blocked: number;
  inProgress: number;
  teamWorkload: TeamMemberWorkload[];
  upcomingToday: EstablishmentTask[];
  upcomingTomorrow: EstablishmentTask[];
  upcomingWeek: EstablishmentTask[];
  criticalIssues: CriticalIssue[];
}

export interface TeamMemberWorkload {
  staffId: string;
  staffName: string;
  totalTasks: number;
  inProgress: number;
  completed: number;
  overdue: number;
  blocked: number;
  level: "low" | "normal" | "high";
}

export interface CriticalIssue {
  taskId: string;
  taskTitle: string;
  type: "no_owner" | "no_dates" | "overdue" | "blocked";
  assignedTo: string | null;
  startDate: string;
  endDate: string;
}

const hasValidDates = (task: EstablishmentTask) => {
  return task.start_date && task.end_date && task.start_date !== "" && task.end_date !== "";
};

const isOverdue = (task: EstablishmentTask, today: Date) => {
  if (task.completed) return false;
  if (!task.end_date) return false;
  try {
    const end = startOfDay(new Date(task.end_date));
    return isBefore(end, today);
  } catch {
    return false;
  }
};

const isTaskInProgress = (task: EstablishmentTask, today: Date) => {
  if (task.completed) return false;
  if (!hasValidDates(task)) return false;
  try {
    const start = startOfDay(new Date(task.start_date));
    const end = startOfDay(new Date(task.end_date));
    return (isBefore(start, today) || isEqual(start, today)) && (isAfter(end, today) || isEqual(end, today));
  } catch {
    return false;
  }
};

// For now "blocked" = no owner + overdue (a pragmatic heuristic until we have explicit blocked status)
const isBlocked = (task: EstablishmentTask, today: Date) => {
  return !task.completed && !task.assigned_to && isOverdue(task, today);
};

export const useTaskAnalytics = (largeProjectId: string | undefined) => {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["establishment-tasks-analytics", largeProjectId],
    queryFn: () => fetchEstablishmentTasksByProject(largeProjectId!),
    enabled: !!largeProjectId,
    refetchInterval: 30_000, // live refresh every 30s
  });

  const analytics = useMemo<TaskAnalytics>(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);

    const completed = tasks.filter(t => t.completed);
    const withDates = tasks.filter(t => hasValidDates(t));
    const withoutDates = tasks.filter(t => !hasValidDates(t));
    const withoutOwner = tasks.filter(t => !t.assigned_to && !t.completed);
    const overdueTasks = tasks.filter(t => isOverdue(t, today));
    const blockedTasks = tasks.filter(t => isBlocked(t, today));
    const inProgressTasks = tasks.filter(t => isTaskInProgress(t, today));

    // Team workload
    const staffMap = new Map<string, { tasks: EstablishmentTask[] }>();
    tasks.forEach(t => {
      if (t.assigned_to) {
        if (!staffMap.has(t.assigned_to)) {
          staffMap.set(t.assigned_to, { tasks: [] });
        }
        staffMap.get(t.assigned_to)!.tasks.push(t);
      }
    });

    const teamWorkload: TeamMemberWorkload[] = Array.from(staffMap.entries()).map(([staffId, { tasks: staffTasks }]) => {
      const active = staffTasks.filter(t => !t.completed);
      const ip = staffTasks.filter(t => isTaskInProgress(t, today));
      const od = staffTasks.filter(t => isOverdue(t, today));
      const bl = staffTasks.filter(t => isBlocked(t, today));
      const cp = staffTasks.filter(t => t.completed);

      const level: "low" | "normal" | "high" = active.length <= 2 ? "low" : active.length <= 5 ? "normal" : "high";

      return {
        staffId,
        staffName: staffId, // will be resolved by the component using staffPool
        totalTasks: staffTasks.length,
        inProgress: ip.length,
        completed: cp.length,
        overdue: od.length,
        blocked: bl.length,
        level,
      };
    });

    // Upcoming tasks
    const upcomingToday = tasks.filter(t => {
      if (t.completed || !t.start_date) return false;
      try { return isToday(new Date(t.start_date)); } catch { return false; }
    });

    const upcomingTomorrow = tasks.filter(t => {
      if (t.completed || !t.start_date) return false;
      try { return isTomorrow(new Date(t.start_date)); } catch { return false; }
    });

    const upcomingWeek = tasks.filter(t => {
      if (t.completed || !t.start_date) return false;
      try {
        const start = startOfDay(new Date(t.start_date));
        return isWithinInterval(start, { start: addDays(tomorrow, 1), end: weekEnd });
      } catch { return false; }
    });

    // Critical issues
    const criticalIssues: CriticalIssue[] = [
      ...blockedTasks.map(t => ({ taskId: t.id, taskTitle: t.title, type: "blocked" as const, assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date })),
      ...overdueTasks.filter(t => !isBlocked(t, today)).map(t => ({ taskId: t.id, taskTitle: t.title, type: "overdue" as const, assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date })),
      ...withoutOwner.filter(t => !isOverdue(t, today)).map(t => ({ taskId: t.id, taskTitle: t.title, type: "no_owner" as const, assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date })),
      ...withoutDates.filter(t => !t.completed).map(t => ({ taskId: t.id, taskTitle: t.title, type: "no_dates" as const, assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date })),
    ];

    return {
      tasks,
      total: tasks.length,
      completed: completed.length,
      withDates: withDates.length,
      withoutDates: withoutDates.length,
      withoutOwner: withoutOwner.length,
      overdue: overdueTasks.length,
      blocked: blockedTasks.length,
      inProgress: inProgressTasks.length,
      teamWorkload,
      upcomingToday,
      upcomingTomorrow,
      upcomingWeek,
      criticalIssues,
    };
  }, [tasks]);

  return { analytics, isLoading, tasks };
};

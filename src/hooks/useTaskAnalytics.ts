import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, addDays, isBefore, isToday, isTomorrow, isWithinInterval, format } from "date-fns";
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
  cancelled: number;
  notStarted: number;
  waitingForDecision: number;
  missingSetup: number;
  waitingForExternal: number;
  teamWorkload: TeamMemberWorkload[];
  upcomingToday: EstablishmentTask[];
  upcomingTomorrow: EstablishmentTask[];
  upcomingWeek: EstablishmentTask[];
  upcomingNext10: EstablishmentTask[];
  nextUpcoming: EstablishmentTask | null;
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
  type: "no_owner" | "no_dates" | "overdue" | "blocked" | "decision_needed" | "missing_setup" | "waiting_for_external";
  assignedTo: string | null;
  startDate: string;
  endDate: string;
  blockerReason?: string | null;
  blockerResponsible?: string | null;
  blockedSince?: string | null;
}

const hasValidDates = (task: EstablishmentTask) => {
  return task.start_date && task.end_date && task.start_date !== "" && task.end_date !== "";
};

const isOverdue = (task: EstablishmentTask, today: Date) => {
  if (task.status === 'done' || task.status === 'cancelled') return false;
  if (!task.end_date) return false;
  try {
    const end = startOfDay(new Date(task.end_date));
    return isBefore(end, today);
  } catch {
    return false;
  }
};

export const useTaskAnalytics = (largeProjectId: string | undefined) => {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["establishment-tasks-analytics", largeProjectId],
    queryFn: () => fetchEstablishmentTasksByProject(largeProjectId!),
    enabled: !!largeProjectId,
    refetchInterval: 30_000,
  });

  const analytics = useMemo<TaskAnalytics>(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);

    const activeTasks = tasks.filter(t => t.status !== 'cancelled');
    const completed = activeTasks.filter(t => t.status === 'done');
    const blocked = activeTasks.filter(t => t.status === 'blocked');
    const inProgress = activeTasks.filter(t => t.status === 'in_progress');
    const notStarted = activeTasks.filter(t => t.status === 'not_started');
    const cancelled = tasks.filter(t => t.status === 'cancelled');
    const withDates = activeTasks.filter(t => hasValidDates(t));
    const withoutDates = activeTasks.filter(t => !hasValidDates(t));
    const withoutOwner = activeTasks.filter(t => (!t.assigned_to_ids || t.assigned_to_ids.length === 0) && !t.assigned_to && t.status !== 'done');
    const overdueTasks = activeTasks.filter(t => isOverdue(t, today));
    const waitingForDecision = activeTasks.filter(t => t.decision_needed && t.status !== 'done');
    const missingSetup = activeTasks.filter(t => t.readiness === 'missing_information' && t.status !== 'done');
    const waitingForExternal = activeTasks.filter(t => t.readiness === 'waiting_for_external' && t.status !== 'done');

    // Team workload
    const staffMap = new Map<string, { tasks: EstablishmentTask[] }>();
    activeTasks.forEach(t => {
      const ids = t.assigned_to_ids?.length ? t.assigned_to_ids : (t.assigned_to ? [t.assigned_to] : []);
      ids.forEach(staffId => {
        if (!staffMap.has(staffId)) {
          staffMap.set(staffId, { tasks: [] });
        }
        staffMap.get(staffId)!.tasks.push(t);
      });
    });

    const teamWorkload: TeamMemberWorkload[] = Array.from(staffMap.entries()).map(([staffId, { tasks: staffTasks }]) => {
      const active = staffTasks.filter(t => t.status !== 'done');
      const ip = staffTasks.filter(t => t.status === 'in_progress');
      const od = staffTasks.filter(t => isOverdue(t, today));
      const bl = staffTasks.filter(t => t.status === 'blocked');
      const cp = staffTasks.filter(t => t.status === 'done');

      const level: "low" | "normal" | "high" = active.length <= 2 ? "low" : active.length <= 5 ? "normal" : "high";

      return {
        staffId,
        staffName: staffId,
        totalTasks: staffTasks.length,
        inProgress: ip.length,
        completed: cp.length,
        overdue: od.length,
        blocked: bl.length,
        level,
      };
    });

    // Upcoming tasks
    const upcomingToday = activeTasks.filter(t => {
      if (t.status === 'done' || !t.start_date) return false;
      try { return isToday(new Date(t.start_date)); } catch { return false; }
    });

    const upcomingTomorrow = activeTasks.filter(t => {
      if (t.status === 'done' || !t.start_date) return false;
      try { return isTomorrow(new Date(t.start_date)); } catch { return false; }
    });

    const upcomingWeek = activeTasks.filter(t => {
      if (t.status === 'done' || !t.start_date) return false;
      try {
        const start = startOfDay(new Date(t.start_date));
        return isWithinInterval(start, { start: addDays(tomorrow, 1), end: weekEnd });
      } catch { return false; }
    });

    // Next 10 upcoming tasks (start_date >= today, not done)
    const todayStr = format(today, 'yyyy-MM-dd');
    const upcomingNext10 = activeTasks
      .filter(t => t.status !== 'done' && t.start_date && t.start_date >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 10);

    const nextUpcoming = null; // kept for interface compat
    // Critical issues — ordered by severity
    const criticalIssues: CriticalIssue[] = [
      ...blocked.map(t => ({
        taskId: t.id, taskTitle: t.title, type: "blocked" as const,
        assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date,
        blockerReason: t.blockers, blockerResponsible: t.blocker_responsible,
        blockedSince: t.start_date,
      })),
      ...overdueTasks.filter(t => t.status !== 'blocked').map(t => ({
        taskId: t.id, taskTitle: t.title, type: "overdue" as const,
        assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date,
      })),
      ...waitingForDecision.filter(t => t.status !== 'blocked' && !isOverdue(t, today)).map(t => ({
        taskId: t.id, taskTitle: t.title, type: "decision_needed" as const,
        assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date,
      })),
      ...missingSetup.filter(t => t.status !== 'blocked' && !t.decision_needed && !isOverdue(t, today)).map(t => ({
        taskId: t.id, taskTitle: t.title, type: "missing_setup" as const,
        assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date,
      })),
      ...waitingForExternal.filter(t => t.status !== 'blocked' && t.readiness !== 'missing_information' && !isOverdue(t, today)).map(t => ({
        taskId: t.id, taskTitle: t.title, type: "waiting_for_external" as const,
        assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date,
      })),
      ...withoutOwner.filter(t => t.status !== 'blocked' && !isOverdue(t, today) && !t.decision_needed).map(t => ({
        taskId: t.id, taskTitle: t.title, type: "no_owner" as const,
        assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date,
      })),
      ...withoutDates.filter(t => t.status !== 'done' && t.status !== 'blocked').map(t => ({
        taskId: t.id, taskTitle: t.title, type: "no_dates" as const,
        assignedTo: t.assigned_to, startDate: t.start_date, endDate: t.end_date,
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
      cancelled: cancelled.length,
      notStarted: notStarted.length,
      waitingForDecision: waitingForDecision.length,
      missingSetup: missingSetup.length,
      waitingForExternal: waitingForExternal.length,
      teamWorkload,
      upcomingToday,
      upcomingTomorrow,
      upcomingWeek,
      upcomingNext10,
      nextUpcoming,
      criticalIssues,
    };
  }, [tasks]);

  return { analytics, isLoading, tasks };
};

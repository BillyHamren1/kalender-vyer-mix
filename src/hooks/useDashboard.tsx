import { useQuery } from "@tanstack/react-query";
import {
  fetchDashboardStats,
  fetchUpcomingEvents,
  fetchAttentionTasks,
  fetchActiveProjects,
  fetchTodayStaffStatus,
  fetchRecentActivity,
  DashboardStats,
  UpcomingEvent,
  AttentionTask,
  ActiveProject,
  StaffTodayStatus,
  RecentActivity
} from "@/services/dashboardService";

export const useDashboard = () => {
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const eventsQuery = useQuery<UpcomingEvent[]>({
    queryKey: ['dashboard', 'events'],
    queryFn: () => fetchUpcomingEvents(7),
    refetchInterval: 30000,
  });

  const tasksQuery = useQuery<AttentionTask[]>({
    queryKey: ['dashboard', 'tasks'],
    queryFn: fetchAttentionTasks,
    refetchInterval: 30000,
  });

  const projectsQuery = useQuery<ActiveProject[]>({
    queryKey: ['dashboard', 'projects'],
    queryFn: fetchActiveProjects,
    refetchInterval: 30000,
  });

  const staffQuery = useQuery<StaffTodayStatus>({
    queryKey: ['dashboard', 'staff'],
    queryFn: fetchTodayStaffStatus,
    refetchInterval: 30000,
  });

  const activityQuery = useQuery<RecentActivity[]>({
    queryKey: ['dashboard', 'activity'],
    queryFn: fetchRecentActivity,
    refetchInterval: 30000,
  });

  const isLoading = 
    statsQuery.isLoading ||
    eventsQuery.isLoading ||
    tasksQuery.isLoading ||
    projectsQuery.isLoading ||
    staffQuery.isLoading ||
    activityQuery.isLoading;

  const refetchAll = () => {
    statsQuery.refetch();
    eventsQuery.refetch();
    tasksQuery.refetch();
    projectsQuery.refetch();
    staffQuery.refetch();
    activityQuery.refetch();
  };

  return {
    stats: statsQuery.data,
    events: eventsQuery.data || [],
    tasks: tasksQuery.data || [],
    projects: projectsQuery.data || [],
    staffStatus: staffQuery.data || { assigned: [], available: [] },
    activities: activityQuery.data || [],
    isLoading,
    refetchAll
  };
};

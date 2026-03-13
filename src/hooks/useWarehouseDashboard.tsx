import { useQuery } from '@tanstack/react-query';
import {
  fetchWarehouseStats,
  fetchUpcomingJobs,
  fetchUrgentPackings,
  fetchActivePackings,
  fetchPackingTasksAttention,
  WarehouseStats,
  UpcomingJob,
  UrgentPacking,
  ActivePacking,
  PackingTask
} from '@/services/warehouseDashboardService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

export const useWarehouseDashboard = () => {
  // Realtime subscriptions replace polling
  useRealtimeInvalidation({
    channelName: 'warehouse-dashboard-realtime',
    tables: ['packing_projects', 'packing_list_items', 'packing_tasks', 'bookings'],
    queryKeys: [
      ['warehouse-stats'],
      ['warehouse-upcoming-jobs'],
      ['warehouse-urgent-packings'],
      ['warehouse-active-packings'],
      ['warehouse-tasks-attention'],
    ],
  });

  const statsQuery = useQuery<WarehouseStats>({
    queryKey: ['warehouse-stats'],
    queryFn: fetchWarehouseStats,
    refetchInterval: 300000,
  });

  const upcomingJobsQuery = useQuery<UpcomingJob[]>({
    queryKey: ['warehouse-upcoming-jobs'],
    queryFn: fetchUpcomingJobs,
    refetchInterval: 300000,
  });

  const urgentPackingsQuery = useQuery<UrgentPacking[]>({
    queryKey: ['warehouse-urgent-packings'],
    queryFn: fetchUrgentPackings,
    refetchInterval: 300000,
  });

  const activePackingsQuery = useQuery<ActivePacking[]>({
    queryKey: ['warehouse-active-packings'],
    queryFn: fetchActivePackings,
    refetchInterval: 300000,
  });

  const tasksQuery = useQuery<PackingTask[]>({
    queryKey: ['warehouse-tasks-attention'],
    queryFn: fetchPackingTasksAttention,
    refetchInterval: 300000,
  });

  const isLoading = 
    statsQuery.isLoading ||
    upcomingJobsQuery.isLoading ||
    urgentPackingsQuery.isLoading ||
    activePackingsQuery.isLoading ||
    tasksQuery.isLoading;

  const refetchAll = () => {
    statsQuery.refetch();
    upcomingJobsQuery.refetch();
    urgentPackingsQuery.refetch();
    activePackingsQuery.refetch();
    tasksQuery.refetch();
  };

  return {
    stats: statsQuery.data || { upcomingJobs: 0, activePackings: 0, urgentPackings: 0, overdueTasks: 0 },
    upcomingJobs: upcomingJobsQuery.data || [],
    urgentPackings: urgentPackingsQuery.data || [],
    activePackings: activePackingsQuery.data || [],
    tasksAttention: tasksQuery.data || [],
    isLoading,
    isStatsLoading: statsQuery.isLoading,
    isUpcomingLoading: upcomingJobsQuery.isLoading,
    isUrgentLoading: urgentPackingsQuery.isLoading,
    isActiveLoading: activePackingsQuery.isLoading,
    isTasksLoading: tasksQuery.isLoading,
    statsError: statsQuery.error,
    upcomingError: upcomingJobsQuery.error,
    urgentError: urgentPackingsQuery.error,
    activeError: activePackingsQuery.error,
    tasksError: tasksQuery.error,
    refetchAll
  };
};

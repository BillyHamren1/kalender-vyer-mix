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

const REFETCH_INTERVAL = 30000; // 30 seconds

export const useWarehouseDashboard = () => {
  // Warehouse stats query
  const statsQuery = useQuery<WarehouseStats>({
    queryKey: ['warehouse-stats'],
    queryFn: fetchWarehouseStats,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Upcoming jobs query
  const upcomingJobsQuery = useQuery<UpcomingJob[]>({
    queryKey: ['warehouse-upcoming-jobs'],
    queryFn: fetchUpcomingJobs,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Urgent packings query
  const urgentPackingsQuery = useQuery<UrgentPacking[]>({
    queryKey: ['warehouse-urgent-packings'],
    queryFn: fetchUrgentPackings,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Active packings query
  const activePackingsQuery = useQuery<ActivePacking[]>({
    queryKey: ['warehouse-active-packings'],
    queryFn: fetchActivePackings,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Tasks needing attention query
  const tasksQuery = useQuery<PackingTask[]>({
    queryKey: ['warehouse-tasks-attention'],
    queryFn: fetchPackingTasksAttention,
    refetchInterval: REFETCH_INTERVAL,
  });

  // Combined loading state
  const isLoading = 
    statsQuery.isLoading ||
    upcomingJobsQuery.isLoading ||
    urgentPackingsQuery.isLoading ||
    activePackingsQuery.isLoading ||
    tasksQuery.isLoading;

  // Refetch all data
  const refetchAll = () => {
    statsQuery.refetch();
    upcomingJobsQuery.refetch();
    urgentPackingsQuery.refetch();
    activePackingsQuery.refetch();
    tasksQuery.refetch();
  };

  return {
    // Data
    stats: statsQuery.data || { upcomingJobs: 0, activePackings: 0, urgentPackings: 0, overdueTasks: 0 },
    upcomingJobs: upcomingJobsQuery.data || [],
    urgentPackings: urgentPackingsQuery.data || [],
    activePackings: activePackingsQuery.data || [],
    tasksAttention: tasksQuery.data || [],
    
    // Loading states
    isLoading,
    isStatsLoading: statsQuery.isLoading,
    isUpcomingLoading: upcomingJobsQuery.isLoading,
    isUrgentLoading: urgentPackingsQuery.isLoading,
    isActiveLoading: activePackingsQuery.isLoading,
    isTasksLoading: tasksQuery.isLoading,
    
    // Error states
    statsError: statsQuery.error,
    upcomingError: upcomingJobsQuery.error,
    urgentError: urgentPackingsQuery.error,
    activeError: activePackingsQuery.error,
    tasksError: tasksQuery.error,
    
    // Actions
    refetchAll
  };
};

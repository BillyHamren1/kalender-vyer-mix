import { useQuery } from "@tanstack/react-query";
import {
  fetchPlanningStats,
  fetchStaffLocations,
  fetchAvailableStaff,
  fetchOngoingProjects,
  fetchCompletedToday,
  PlanningStats,
  StaffLocation,
  AvailableStaff,
  OngoingProject,
  CompletedToday
} from "@/services/planningDashboardService";

export const usePlanningDashboard = () => {
  const statsQuery = useQuery<PlanningStats>({
    queryKey: ['planning-dashboard', 'stats'],
    queryFn: fetchPlanningStats,
    refetchInterval: 30000,
  });

  const locationsQuery = useQuery<StaffLocation[]>({
    queryKey: ['planning-dashboard', 'locations'],
    queryFn: fetchStaffLocations,
    refetchInterval: 30000,
  });

  const availableQuery = useQuery<AvailableStaff[]>({
    queryKey: ['planning-dashboard', 'available'],
    queryFn: fetchAvailableStaff,
    refetchInterval: 30000,
  });

  const projectsQuery = useQuery<OngoingProject[]>({
    queryKey: ['planning-dashboard', 'projects'],
    queryFn: fetchOngoingProjects,
    refetchInterval: 30000,
  });

  const completedQuery = useQuery<CompletedToday[]>({
    queryKey: ['planning-dashboard', 'completed'],
    queryFn: fetchCompletedToday,
    refetchInterval: 30000,
  });

  const isLoading = 
    statsQuery.isLoading ||
    locationsQuery.isLoading ||
    availableQuery.isLoading ||
    projectsQuery.isLoading ||
    completedQuery.isLoading;

  const refetchAll = () => {
    statsQuery.refetch();
    locationsQuery.refetch();
    availableQuery.refetch();
    projectsQuery.refetch();
    completedQuery.refetch();
  };

  return {
    stats: statsQuery.data,
    staffLocations: locationsQuery.data || [],
    availableStaff: availableQuery.data || [],
    ongoingProjects: projectsQuery.data || [],
    completedToday: completedQuery.data || [],
    isLoading,
    refetchAll
  };
};

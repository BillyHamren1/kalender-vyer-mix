import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchPlanningStats,
  fetchStaffLocations,
  fetchAvailableStaff,
  fetchOngoingProjects,
  fetchCompletedToday,
  fetchAllStaff,
  fetchWeekAssignments,
  toggleStaffActive,
  assignStaffToDay,
  PlanningStats,
  StaffLocation,
  AvailableStaff,
  OngoingProject,
  CompletedToday,
  AllStaffMember,
  DayAssignment
} from "@/services/planningDashboardService";
import { format } from "date-fns";

export const usePlanningDashboard = () => {
  const queryClient = useQueryClient();

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

  const allStaffQuery = useQuery<AllStaffMember[]>({
    queryKey: ['planning-dashboard', 'all-staff'],
    queryFn: fetchAllStaff,
    refetchInterval: 30000,
  });

  const weekAssignmentsQuery = useQuery<DayAssignment[]>({
    queryKey: ['planning-dashboard', 'week-assignments'],
    queryFn: fetchWeekAssignments,
    refetchInterval: 30000,
  });

  const isLoading = 
    statsQuery.isLoading ||
    locationsQuery.isLoading ||
    availableQuery.isLoading ||
    projectsQuery.isLoading ||
    completedQuery.isLoading ||
    allStaffQuery.isLoading ||
    weekAssignmentsQuery.isLoading;

  const refetchAll = () => {
    statsQuery.refetch();
    locationsQuery.refetch();
    availableQuery.refetch();
    projectsQuery.refetch();
    completedQuery.refetch();
    allStaffQuery.refetch();
    weekAssignmentsQuery.refetch();
  };

  const handleToggleStaffActive = async (staffId: string, isActive: boolean) => {
    await toggleStaffActive(staffId, isActive);
    // Refetch relevant queries
    queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'all-staff'] });
    queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'available'] });
    queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'stats'] });
  };

  const handleStaffDrop = async (staffId: string, teamId: string, date: Date) => {
    try {
      await assignStaffToDay(staffId, teamId, date);
      toast.success(`Personal tilldelad ${teamId === 'team-11' ? 'Live' : teamId.replace('team-', 'Team ')} för ${format(date, 'd/M')}`);
      // Refetch assignments
      queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'week-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'all-staff'] });
      queryClient.invalidateQueries({ queryKey: ['planning-dashboard', 'locations'] });
    } catch (error) {
      toast.error('Kunde inte tilldela personal');
      throw error;
    }
  };

  return {
    stats: statsQuery.data,
    staffLocations: locationsQuery.data || [],
    availableStaff: availableQuery.data || [],
    ongoingProjects: projectsQuery.data || [],
    completedToday: completedQuery.data || [],
    allStaff: allStaffQuery.data || [],
    weekAssignments: weekAssignmentsQuery.data || [],
    isLoading,
    refetchAll,
    handleToggleStaffActive,
    handleStaffDrop
  };
};

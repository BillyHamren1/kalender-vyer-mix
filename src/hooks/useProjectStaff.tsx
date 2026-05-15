import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchPlannedStaff,
  fetchTimeReports,
  fetchLaborCosts,
  createLaborCost,
  updateLaborCost,
  deleteLaborCost,
  createTimeReport,
  deleteTimeReport
} from '@/services/projectStaffService';
import { ProjectLaborCost, ProjectStaffSummary } from '@/types/projectStaff';

export const useProjectStaff = (
  projectId: string | undefined,
  target: { bookingId?: string | null; largeProjectId?: string | null },
) => {
  const queryClient = useQueryClient();
  const bookingId = target.bookingId ?? null;
  const largeProjectId = target.largeProjectId ?? null;

  // Fetch planned staff
  const { data: plannedStaff = [], isLoading: isLoadingStaff } = useQuery({
    queryKey: ['project-planned-staff', bookingId],
    queryFn: () => fetchPlannedStaff(bookingId!),
    enabled: !!bookingId
  });

  // Fetch time reports
  const { data: timeReports = [], isLoading: isLoadingTimeReports } = useQuery({
    queryKey: ['project-time-reports', bookingId, largeProjectId],
    queryFn: () => fetchTimeReports({ booking_id: bookingId, large_project_id: largeProjectId }),
    enabled: !!bookingId || !!largeProjectId
  });

  // Fetch labor costs
  const { data: laborCosts = [], isLoading: isLoadingLaborCosts } = useQuery({
    queryKey: ['project-labor-costs', projectId],
    queryFn: () => fetchLaborCosts(projectId!),
    enabled: !!projectId
  });

  // Calculate summary
  const summary: ProjectStaffSummary = {
    plannedStaffCount: plannedStaff.length,
    workDays: new Set(plannedStaff.flatMap(s => s.assignment_dates.map(d => d.date))).size,
    reportedHours: timeReports.reduce((sum, r) => sum + r.hours_worked, 0),
    reportedOvertimeHours: timeReports.reduce((sum, r) => sum + (r.overtime_hours || 0), 0),
    manualHours: laborCosts.reduce((sum, c) => sum + c.hours, 0),
    totalLaborCost: laborCosts.reduce((sum, c) => sum + (c.hours * c.hourly_rate), 0)
  };

  // Mutations
  const addLaborCostMutation = useMutation({
    mutationFn: createLaborCost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-labor-costs', projectId] });
      toast.success('Arbetskostnad tillagd');
    },
    onError: () => {
      toast.error('Kunde inte lägga till arbetskostnad');
    }
  });

  const updateLaborCostMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectLaborCost> }) =>
      updateLaborCost(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-labor-costs', projectId] });
      toast.success('Arbetskostnad uppdaterad');
    },
    onError: () => {
      toast.error('Kunde inte uppdatera arbetskostnad');
    }
  });

  const deleteLaborCostMutation = useMutation({
    mutationFn: deleteLaborCost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-labor-costs', projectId] });
      toast.success('Arbetskostnad borttagen');
    },
    onError: () => {
      toast.error('Kunde inte ta bort arbetskostnad');
    }
  });

  const addTimeReportMutation = useMutation({
    mutationFn: createTimeReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-time-reports', bookingId, largeProjectId] });
      toast.success('Tidrapport registrerad');
    },
    onError: () => {
      toast.error('Kunde inte registrera tidrapport');
    }
  });

  const deleteTimeReportMutation = useMutation({
    mutationFn: deleteTimeReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-time-reports', bookingId, largeProjectId] });
      toast.success('Tidrapport borttagen');
    },
    onError: () => {
      toast.error('Kunde inte ta bort tidrapport');
    }
  });

  return {
    plannedStaff,
    timeReports,
    laborCosts,
    summary,
    isLoading: isLoadingStaff || isLoadingTimeReports || isLoadingLaborCosts,
    addLaborCost: addLaborCostMutation.mutate,
    updateLaborCost: updateLaborCostMutation.mutate,
    removeLaborCost: deleteLaborCostMutation.mutate,
    addTimeReport: addTimeReportMutation.mutate,
    removeTimeReport: deleteTimeReportMutation.mutate
  };
};

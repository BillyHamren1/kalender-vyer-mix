import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchLargeProject,
  updateLargeProject,
  addBookingToLargeProject,
  removeBookingFromLargeProject,
  fetchAvailableBookingsForLargeProject,
  fetchLargeProjectTasks,
  createLargeProjectTask,
  updateLargeProjectTask,
  deleteLargeProjectTask,
  fetchLargeProjectFiles,
  uploadLargeProjectFile,
  deleteLargeProjectFile,
  fetchLargeProjectGanttSteps,
  saveLargeProjectGanttSteps,
} from "@/services/largeProjectService";
import { LargeProject, LargeProjectStatus, LARGE_PROJECT_STATUS_LABELS } from "@/types/largeProject";
import { ProjectTask, ProjectFile } from "@/types/project";
import { toast } from "sonner";
import { GanttStep } from "@/components/project/LargeProjectGanttChart";
import { bridgeProjectTaskToExecution, ensureBridgeAndSync } from "@/services/projectTaskBridgeService";
import { expandPeriodToDates, DateType } from "@/services/largeProjectScheduleSync";
import { writeProjectDates } from "@/services/projectDateAuthority";
import { supabase } from "@/integrations/supabase/client";

export const useLargeProjectDetail = (projectId: string) => {
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ['large-project', projectId],
    queryFn: () => fetchLargeProject(projectId),
    enabled: !!projectId,
  });

  const tasksQuery = useQuery({
    queryKey: ['large-project-tasks', projectId],
    queryFn: () => fetchLargeProjectTasks(projectId),
    enabled: !!projectId,
  });

  const filesQuery = useQuery({
    queryKey: ['large-project-files', projectId],
    queryFn: () => fetchLargeProjectFiles(projectId),
    enabled: !!projectId,
  });

  const ganttQuery = useQuery({
    queryKey: ['large-project-gantt', projectId],
    queryFn: () => fetchLargeProjectGanttSteps(projectId),
    enabled: !!projectId,
  });

  // Map large project types to standard project types for component compatibility
  const tasks: ProjectTask[] = (tasksQuery.data || []).map(t => ({
    id: t.id,
    project_id: t.large_project_id,
    title: t.title,
    description: t.description,
    assigned_to: t.assigned_to,
    deadline: t.deadline,
    completed: t.completed,
    sort_order: t.sort_order,
    is_info_only: t.is_info_only,
    start_date: null,
    end_date: null,
    phase: null,
    dependency_task_id: null,
    execution_task_id: (t as any).execution_task_id ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));

  const files: ProjectFile[] = (filesQuery.data || []).map(f => ({
    id: f.id,
    project_id: f.large_project_id,
    file_name: f.file_name,
    file_type: f.file_type,
    url: f.url,
    uploaded_by: f.uploaded_by,
    uploaded_at: f.uploaded_at,
  }));

  const ganttSteps: GanttStep[] = (ganttQuery.data || []).map(s => ({
    id: s.id,
    key: s.step_key,
    name: s.step_name,
    start_date: s.start_date || '',
    end_date: s.end_date || '',
    is_milestone: s.is_milestone,
    sort_order: s.sort_order,
  }));

  // Status mutation — sync to Booking first if completing
  const updateStatusMutation = useMutation({
    mutationFn: async (status: LargeProjectStatus) => {
      if (status === 'completed') {
        const { syncBookingsForInvoicing, getLargeProjectBookingIds } = await import('@/services/bookingCloseSyncService');
        const bookingIds = await getLargeProjectBookingIds(projectId);
        if (bookingIds.length > 0) {
          const result = await syncBookingsForInvoicing(bookingIds);
          if (result.failedIds.length > 0) {
            throw new Error(`Kunde inte synka ${result.failedIds.length} bokningar till Booking-systemet. Projektet stängdes inte.`);
          }
        }
      }
      return updateLargeProject(projectId, { status });
    },
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['large-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      toast.success(`Status ändrad till "${LARGE_PROJECT_STATUS_LABELS[status]}"`);
    },
    onError: (err: Error) => toast.error(err.message || 'Kunde inte uppdatera status'),
  });

  // General project update mutation
  const updateProjectMutation = useMutation({
    mutationFn: (updates: Partial<LargeProject>) => updateLargeProject(projectId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      toast.success('Projektet uppdaterat');
    },
    onError: () => toast.error('Kunde inte uppdatera projektet'),
  });

  // Task mutations
  const addTaskMutation = useMutation({
    mutationFn: async (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => {
      const created = await createLargeProjectTask({ ...task, large_project_id: projectId });
      // BRIDGE: mirror to execution layer (fire-and-forget)
      bridgeProjectTaskToExecution(
        created.id,
        { title: task.title, description: task.description, assigned_to: task.assigned_to, deadline: task.deadline },
        { largeProjectId: projectId },
        'large_project_tasks'
      ).then(() => {
        queryClient.invalidateQueries({ queryKey: ['large-project-tasks', projectId] });
      });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-tasks', projectId] });
      toast.success('Uppgift tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till uppgift'),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ProjectTask> }) => {
      await updateLargeProjectTask(id, updates);
      // BRIDGE SYNC: propagate changes to linked execution task, or create bridge if missing
      const task = tasks.find(t => t.id === id);
      ensureBridgeAndSync(
        id,
        task?.execution_task_id ?? null,
        {
          title: updates.title,
          description: updates.description,
          deadline: updates.deadline,
          completed: updates.completed,
          assigned_to: updates.assigned_to,
        },
        { largeProjectId: projectId },
        'large_project_tasks'
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-tasks', projectId] });
    },
    onError: () => toast.error('Kunde inte uppdatera uppgift'),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => deleteLargeProjectTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-tasks', projectId] });
      toast.success('Uppgift borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort uppgift'),
  });

  // File mutations
  const uploadFileMutation = useMutation({
    mutationFn: ({ file, uploadedBy }: { file: File; uploadedBy?: string }) =>
      uploadLargeProjectFile(projectId, file, uploadedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-files', projectId] });
      toast.success('Fil uppladdad');
    },
    onError: () => toast.error('Kunde inte ladda upp fil'),
  });

  const deleteFileMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => deleteLargeProjectFile(id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-files', projectId] });
      toast.success('Fil borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort fil'),
  });

  // Booking mutations
  const addBookingMutation = useMutation({
    mutationFn: (bookingId: string) => addBookingToLargeProject(projectId, bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['available-bookings-for-large-project'] });
      toast.success('Bokning tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till bokning'),
  });

  const removeBookingMutation = useMutation({
    mutationFn: (bookingId: string) => removeBookingFromLargeProject(projectId, bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['available-bookings-for-large-project'] });
      toast.success('Bokning borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort bokning'),
  });

  // Gantt mutation — also syncs project date arrays + propagates to all sub-bookings
  const saveGanttMutation = useMutation({
    mutationFn: async (steps: GanttStep[]) => {
      // 1. Save Gantt steps (period model: one start + one end per phase)
      await saveLargeProjectGanttSteps(
        projectId,
        steps.map(s => ({
          key: s.key,
          name: s.name,
          start_date: s.start_date,
          end_date: s.end_date,
          is_milestone: s.is_milestone,
        }))
      );

      // 2. Expand each phase period → full date array on the project
      // 3. Propagate full arrays to every linked sub-booking + regenerate calendar events
      const ganttToProjectField: Record<string, { proj: 'start_date' | 'event_date' | 'end_date'; type: DateType }> = {
        establishment: { proj: 'start_date', type: 'rig' },
        event: { proj: 'event_date', type: 'event' },
        deestablishment: { proj: 'end_date', type: 'rigDown' },
      };

      const projectUpdates: Record<string, string[]> = {};
      const propagations: Array<Promise<void>> = [];

      // Fetch linked booking ids once
      const { data: linkedBookings } = await supabase
        .from('large_project_bookings')
        .select('booking_id')
        .eq('large_project_id', projectId);
      const bookingIds = (linkedBookings || []).map(b => b.booking_id);

      for (const step of steps) {
        const map = ganttToProjectField[step.key];
        if (!map) continue;
        const dates = expandPeriodToDates(step.start_date, step.end_date);
        if (dates.length === 0) continue;
        projectUpdates[map.proj] = dates;
        if (bookingIds.length > 0) {
          propagations.push(
            propagateProjectDatesToBookings({
              bookingIds,
              dateType: map.type,
              dates,
            })
          );
        }
      }

      if (Object.keys(projectUpdates).length > 0) {
        await updateLargeProject(projectId, projectUpdates as any);
      }
      await Promise.all(propagations);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-gantt', projectId] });
      queryClient.invalidateQueries({ queryKey: ['large-project', projectId] });
      toast.success('Schema sparat och synkat till bokningar');
    },
    onError: (err: Error) => {
      console.error('Save Gantt error:', err);
      toast.error('Kunde inte spara schema');
    },
  });

  return {
    project: projectQuery.data,
    tasks,
    files,
    ganttSteps,
    isLoading: projectQuery.isLoading,
    updateProject: updateProjectMutation.mutateAsync,
    updateStatus: updateStatusMutation.mutate,
    addTask: addTaskMutation.mutate,
    updateTask: updateTaskMutation.mutate,
    deleteTask: deleteTaskMutation.mutate,
    uploadFile: uploadFileMutation.mutate,
    deleteFile: deleteFileMutation.mutate,
    isUploadingFile: uploadFileMutation.isPending,
    addBooking: addBookingMutation.mutate,
    removeBooking: removeBookingMutation.mutate,
    isAddingBooking: addBookingMutation.isPending,
    saveGantt: saveGanttMutation.mutate,
    availableBookingsQuery: {
      enabled: false, // controlled externally
    },
  };
};

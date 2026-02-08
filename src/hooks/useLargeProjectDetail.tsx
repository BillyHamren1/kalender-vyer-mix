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
  fetchLargeProjectComments,
  createLargeProjectComment,
  fetchLargeProjectGanttSteps,
  saveLargeProjectGanttSteps,
} from "@/services/largeProjectService";
import { LargeProjectStatus, LARGE_PROJECT_STATUS_LABELS } from "@/types/largeProject";
import { ProjectTask, ProjectFile, ProjectComment } from "@/types/project";
import { toast } from "sonner";
import { GanttStep } from "@/components/project/LargeProjectGanttChart";

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

  const commentsQuery = useQuery({
    queryKey: ['large-project-comments', projectId],
    queryFn: () => fetchLargeProjectComments(projectId),
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

  const comments: ProjectComment[] = (commentsQuery.data || []).map(c => ({
    id: c.id,
    project_id: c.large_project_id,
    author_name: c.author_name,
    content: c.content,
    created_at: c.created_at,
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

  // Status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (status: LargeProjectStatus) => updateLargeProject(projectId, { status }),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['large-project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      toast.success(`Status ändrad till "${LARGE_PROJECT_STATUS_LABELS[status]}"`);
    },
    onError: () => toast.error('Kunde inte uppdatera status'),
  });

  // Task mutations
  const addTaskMutation = useMutation({
    mutationFn: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) =>
      createLargeProjectTask({ ...task, large_project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-tasks', projectId] });
      toast.success('Uppgift tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till uppgift'),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectTask> }) =>
      updateLargeProjectTask(id, updates),
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

  // Comment mutation
  const addCommentMutation = useMutation({
    mutationFn: (data: { author_name: string; content: string }) =>
      createLargeProjectComment({ ...data, large_project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-comments', projectId] });
    },
    onError: () => toast.error('Kunde inte lägga till kommentar'),
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

  // Gantt mutation
  const saveGanttMutation = useMutation({
    mutationFn: (steps: GanttStep[]) =>
      saveLargeProjectGanttSteps(
        projectId,
        steps.map(s => ({
          key: s.key,
          name: s.name,
          start_date: s.start_date,
          end_date: s.end_date,
          is_milestone: s.is_milestone,
        }))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['large-project-gantt', projectId] });
      toast.success('Schema sparat');
    },
    onError: () => toast.error('Kunde inte spara schema'),
  });

  return {
    project: projectQuery.data,
    tasks,
    files,
    comments,
    ganttSteps,
    isLoading: projectQuery.isLoading,
    updateStatus: updateStatusMutation.mutate,
    addTask: addTaskMutation.mutate,
    updateTask: updateTaskMutation.mutate,
    deleteTask: deleteTaskMutation.mutate,
    addComment: addCommentMutation.mutate,
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

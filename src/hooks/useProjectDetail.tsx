import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchProject, 
  fetchProjectTasks, 
  fetchProjectComments, 
  fetchProjectFiles,
  updateProjectStatus,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  createProjectComment,
  uploadProjectFile,
  deleteProjectFile
} from "@/services/projectService";
import { fetchProjectActivities, logProjectActivity } from "@/services/projectActivityService";
import { ProjectStatus, ProjectTask, PROJECT_STATUS_LABELS } from "@/types/project";
import { toast } from "sonner";

export const useProjectDetail = (projectId: string) => {
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    enabled: !!projectId
  });

  const tasksQuery = useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: () => fetchProjectTasks(projectId),
    enabled: !!projectId
  });

  const commentsQuery = useQuery({
    queryKey: ['project-comments', projectId],
    queryFn: () => fetchProjectComments(projectId),
    enabled: !!projectId
  });

  const filesQuery = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: () => fetchProjectFiles(projectId),
    enabled: !!projectId
  });

  const activitiesQuery = useQuery({
    queryKey: ['project-activities', projectId],
    queryFn: () => fetchProjectActivities(projectId),
    enabled: !!projectId
  });

  const logActivity = (action: string, description: string, metadata?: Record<string, unknown>) => {
    logProjectActivity({
      project_id: projectId,
      action,
      description,
      metadata,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] });
    });
  };

  const updateStatusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProjectStatus(projectId, status),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      const oldStatus = projectQuery.data?.status;
      logActivity('status_changed', `Status ändrad till "${PROJECT_STATUS_LABELS[status]}"`, {
        old_status: oldStatus,
        new_status: status,
      });
      toast.success('Status uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera status')
  });

  const addTaskMutation = useMutation({
    mutationFn: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => 
      createProjectTask({ ...task, project_id: projectId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      logActivity('task_added', `Uppgift tillagd: "${variables.title}"`);
      toast.success('Uppgift tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till uppgift')
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectTask> }) => 
      updateProjectTask(id, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      if (variables.updates.completed !== undefined) {
        const task = tasksQuery.data?.find(t => t.id === variables.id);
        const taskName = task?.title || 'Uppgift';
        if (variables.updates.completed) {
          logActivity('task_completed', `Uppgift avslutad: "${taskName}"`);
        }
      }
    },
    onError: () => toast.error('Kunde inte uppdatera uppgift')
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => {
      const task = tasksQuery.data?.find(t => t.id === id);
      return deleteProjectTask(id).then(() => task?.title || 'Uppgift');
    },
    onSuccess: (taskTitle) => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      logActivity('task_deleted', `Uppgift borttagen: "${taskTitle}"`);
      toast.success('Uppgift borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort uppgift')
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { author_name: string; content: string }) => 
      createProjectComment({ ...data, project_id: projectId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-comments', projectId] });
      logActivity('comment_added', `Kommentar av ${variables.author_name}`, {
        preview: variables.content.substring(0, 100),
      });
    },
    onError: () => toast.error('Kunde inte lägga till kommentar')
  });

  const uploadFileMutation = useMutation({
    mutationFn: ({ file, uploadedBy }: { file: File; uploadedBy?: string }) => 
      uploadProjectFile(projectId, file, uploadedBy),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      logActivity('file_uploaded', `Fil uppladdad: "${variables.file.name}"`);
      toast.success('Fil uppladdad');
    },
    onError: () => toast.error('Kunde inte ladda upp fil')
  });

  const deleteFileMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => deleteProjectFile(id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      logActivity('file_deleted', 'Fil borttagen');
      toast.success('Fil borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort fil')
  });

  return {
    project: projectQuery.data,
    tasks: tasksQuery.data || [],
    comments: commentsQuery.data || [],
    files: filesQuery.data || [],
    activities: activitiesQuery.data || [],
    isLoading: projectQuery.isLoading,
    updateStatus: updateStatusMutation.mutate,
    addTask: addTaskMutation.mutate,
    updateTask: updateTaskMutation.mutate,
    deleteTask: deleteTaskMutation.mutate,
    addComment: addCommentMutation.mutate,
    uploadFile: uploadFileMutation.mutate,
    deleteFile: deleteFileMutation.mutate,
    isUploadingFile: uploadFileMutation.isPending
  };
};

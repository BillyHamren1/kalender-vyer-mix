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
import { ProjectStatus, ProjectTask } from "@/types/project";
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

  const updateStatusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProjectStatus(projectId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Status uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera status')
  });

  const addTaskMutation = useMutation({
    mutationFn: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => 
      createProjectTask({ ...task, project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      toast.success('Uppgift tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till uppgift')
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectTask> }) => 
      updateProjectTask(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
    },
    onError: () => toast.error('Kunde inte uppdatera uppgift')
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => deleteProjectTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      toast.success('Uppgift borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort uppgift')
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { author_name: string; content: string }) => 
      createProjectComment({ ...data, project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-comments', projectId] });
    },
    onError: () => toast.error('Kunde inte lägga till kommentar')
  });

  const uploadFileMutation = useMutation({
    mutationFn: ({ file, uploadedBy }: { file: File; uploadedBy?: string }) => 
      uploadProjectFile(projectId, file, uploadedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      toast.success('Fil uppladdad');
    },
    onError: () => toast.error('Kunde inte ladda upp fil')
  });

  const deleteFileMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => deleteProjectFile(id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      toast.success('Fil borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort fil')
  });

  return {
    project: projectQuery.data,
    tasks: tasksQuery.data || [],
    comments: commentsQuery.data || [],
    files: filesQuery.data || [],
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

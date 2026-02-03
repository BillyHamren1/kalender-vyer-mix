import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchPacking,
  fetchPackingTasks,
  fetchPackingComments,
  fetchPackingFiles,
  updatePackingStatus,
  createPackingTask,
  updatePackingTask,
  deletePackingTask,
  createPackingComment,
  uploadPackingFile,
  deletePackingFile
} from "@/services/packingService";
import { PackingStatus, PackingTask } from "@/types/packing";

export const usePackingDetail = (packingId: string) => {
  const queryClient = useQueryClient();

  // Fetch packing details
  const { data: packing, isLoading: isLoadingPacking } = useQuery({
    queryKey: ['packing', packingId],
    queryFn: () => fetchPacking(packingId),
    enabled: !!packingId
  });

  // Fetch tasks
  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['packing-tasks', packingId],
    queryFn: () => fetchPackingTasks(packingId),
    enabled: !!packingId
  });

  // Fetch comments
  const { data: comments = [] } = useQuery({
    queryKey: ['packing-comments', packingId],
    queryFn: () => fetchPackingComments(packingId),
    enabled: !!packingId
  });

  // Fetch files
  const { data: files = [] } = useQuery({
    queryKey: ['packing-files', packingId],
    queryFn: () => fetchPackingFiles(packingId),
    enabled: !!packingId
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (status: PackingStatus) => updatePackingStatus(packingId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing', packingId] });
      toast.success('Status uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera status')
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) =>
      createPackingTask({ ...task, packing_id: packingId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-tasks', packingId] });
      toast.success('Uppgift tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till uppgift')
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<PackingTask> }) =>
      updatePackingTask(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-tasks', packingId] });
    },
    onError: () => toast.error('Kunde inte uppdatera uppgift')
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: deletePackingTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-tasks', packingId] });
      toast.success('Uppgift borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort uppgift')
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: (data: { author_name: string; content: string }) =>
      createPackingComment({ ...data, packing_id: packingId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-comments', packingId] });
      toast.success('Kommentar tillagd');
    },
    onError: () => toast.error('Kunde inte lägga till kommentar')
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: ({ file, uploadedBy }: { file: File; uploadedBy?: string }) =>
      uploadPackingFile(packingId, file, uploadedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-files', packingId] });
      toast.success('Fil uppladdad');
    },
    onError: () => toast.error('Kunde inte ladda upp fil')
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      deletePackingFile(id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-files', packingId] });
      toast.success('Fil borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort fil')
  });

  // Refetch all data
  const refetchAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['packing', packingId] }),
      queryClient.invalidateQueries({ queryKey: ['packing-tasks', packingId] }),
      queryClient.invalidateQueries({ queryKey: ['packing-comments', packingId] }),
      queryClient.invalidateQueries({ queryKey: ['packing-files', packingId] }),
      queryClient.invalidateQueries({ queryKey: ['packing-list-items', packingId] }),
      queryClient.invalidateQueries({ queryKey: ['packing-for-list', packingId] })
    ]);
  };

  return {
    packing,
    tasks,
    comments,
    files,
    isLoading: isLoadingPacking || isLoadingTasks,
    updateStatus: updateStatusMutation.mutate,
    addTask: addTaskMutation.mutate,
    updateTask: updateTaskMutation.mutate,
    deleteTask: deleteTaskMutation.mutate,
    addComment: addCommentMutation.mutate,
    uploadFile: uploadFileMutation.mutate,
    deleteFile: deleteFileMutation.mutate,
    isUploadingFile: uploadFileMutation.isPending,
    refetchAll
  };
};

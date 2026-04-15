import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  fetchPacking,
  fetchPackingTasks,
  fetchPackingComments,
  fetchPackingFiles,
  createPackingTask,
  updatePackingTask,
  deletePackingTask,
  createPackingComment,
  uploadPackingFile,
  deletePackingFile
} from "@/services/packingService";
import { PackingTask } from "@/types/packing";
import { createOptimisticCallbacks } from "./useOptimisticMutation";

export const usePackingDetail = (packingId: string) => {
  const queryClient = useQueryClient();

  const { data: packing, isLoading: isLoadingPacking } = useQuery({
    queryKey: ['packing', packingId],
    queryFn: () => fetchPacking(packingId),
    enabled: !!packingId
  });

  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['packing-tasks', packingId],
    queryFn: () => fetchPackingTasks(packingId),
    enabled: !!packingId
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['packing-comments', packingId],
    queryFn: () => fetchPackingComments(packingId),
    enabled: !!packingId
  });

  const { data: files = [] } = useQuery({
    queryKey: ['packing-files', packingId],
    queryFn: () => fetchPackingFiles(packingId),
    enabled: !!packingId
  });

  const bookingId = packing?.booking_id || null;

  const { data: bookingAttachments = [] } = useQuery({
    queryKey: ['booking-attachments', bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from('booking_attachments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!bookingId
  });

  // --- Optimistic mutations (no status mutation - status is backend-driven) ---

  const addTaskOptimistic = createOptimisticCallbacks<any, { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }>({
    queryClient,
    queryKey: ['packing-tasks', packingId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      title: vars.title,
      description: vars.description || null,
      assigned_to: vars.assigned_to || null,
      deadline: vars.deadline || null,
      completed: false,
      packing_id: packingId,
      sort_order: 0,
      is_info_only: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    errorMessage: 'Kunde inte lägga till uppgift',
  });

  const addTaskMutation = useMutation({
    mutationFn: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) =>
      createPackingTask({ ...task, packing_id: packingId }),
    ...addTaskOptimistic,
    onSuccess: () => { toast.success('Uppgift tillagd'); },
    onError: addTaskOptimistic.onError,
    onSettled: addTaskOptimistic.onSettled,
  });

  const updateTaskOptimistic = createOptimisticCallbacks<any, { id: string; updates: Partial<PackingTask> }>({
    queryClient,
    queryKey: ['packing-tasks', packingId],
    type: 'update',
    getId: (vars) => vars.id,
    optimisticData: (vars, old) => {
      const existing = old.find(t => t.id === vars.id);
      return existing ? { ...existing, ...vars.updates } : existing;
    },
    errorMessage: 'Kunde inte uppdatera uppgift',
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<PackingTask> }) =>
      updatePackingTask(id, updates),
    ...updateTaskOptimistic,
  });

  const deleteTaskOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['packing-tasks', packingId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort uppgift',
  });

  const deleteTaskMutation = useMutation({
    mutationFn: deletePackingTask,
    ...deleteTaskOptimistic,
    onSuccess: () => { toast.success('Uppgift borttagen'); },
    onError: deleteTaskOptimistic.onError,
    onSettled: deleteTaskOptimistic.onSettled,
  });

  const addCommentOptimistic = createOptimisticCallbacks<any, { author_name: string; content: string }>({
    queryClient,
    queryKey: ['packing-comments', packingId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      author_name: vars.author_name,
      content: vars.content,
      packing_id: packingId,
      created_at: new Date().toISOString(),
    }),
    errorMessage: 'Kunde inte lägga till kommentar',
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { author_name: string; content: string }) =>
      createPackingComment({ ...data, packing_id: packingId }),
    ...addCommentOptimistic,
    onSuccess: () => { toast.success('Kommentar tillagd'); },
    onError: addCommentOptimistic.onError,
    onSettled: addCommentOptimistic.onSettled,
  });

  const uploadFileMutation = useMutation({
    mutationFn: ({ file, uploadedBy }: { file: File; uploadedBy?: string }) =>
      uploadPackingFile(packingId, file, uploadedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-files', packingId] });
      toast.success('Fil uppladdad');
    },
    onError: () => toast.error('Kunde inte ladda upp fil')
  });

  const deleteFileMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      deletePackingFile(id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing-files', packingId] });
      toast.success('Fil borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort fil')
  });

  const updatePackingDatesMutation = useMutation({
    mutationFn: async (updates: { start_date?: string | null; end_date?: string | null }) => {
      const { error } = await supabase
        .from('packing_projects')
        .update(updates)
        .eq('id', packingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing', packingId] });
      toast.success('Datum uppdaterat');
    },
    onError: () => toast.error('Kunde inte uppdatera datum'),
  });

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
    bookingAttachments,
    isLoading: isLoadingPacking || isLoadingTasks,
    addTask: addTaskMutation.mutate,
    updateTask: updateTaskMutation.mutate,
    deleteTask: deleteTaskMutation.mutate,
    addComment: addCommentMutation.mutate,
    uploadFile: uploadFileMutation.mutate,
    deleteFile: deleteFileMutation.mutate,
    isUploadingFile: uploadFileMutation.isPending,
    updatePackingDates: updatePackingDatesMutation.mutate,
    refetchAll
  };
};

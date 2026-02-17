import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  fetchProject, 
  fetchProjectTasks, 
  fetchProjectComments, 
  fetchProjectFiles,
  fetchBookingAttachments,
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
import { createOptimisticCallbacks } from "./useOptimisticMutation";

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

  const bookingId = projectQuery.data?.booking_id || (projectQuery.data as any)?.booking?.id || null;

  const bookingAttachmentsQuery = useQuery({
    queryKey: ['booking-attachments', bookingId],
    queryFn: () => fetchBookingAttachments(bookingId!),
    enabled: !!bookingId
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

  // Subscribe to activity log changes for real-time updates
  useEffect(() => {
    if (!projectId) return;

    const activityChannel = supabase
      .channel(`project-activity-log-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_activity_log',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['project-activities', projectId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(activityChannel);
    };
  }, [projectId, queryClient]);

  // Subscribe to transport changes and log them automatically
  useEffect(() => {
    if (!bookingId) return;

    const channel = supabase
      .channel(`project-transport-activity-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transport_assignments',
          filter: `booking_id=eq.${bookingId}`,
        },
        async (payload) => {
          const newRow = payload.new as any;
          const { data: vehicle } = await supabase
            .from('vehicles')
            .select('name')
            .eq('id', newRow.vehicle_id)
            .single();
          const vehicleName = vehicle?.name || 'Okänt fordon';
          logActivity('transport_added', `Transport bokad: ${vehicleName} (${newRow.transport_date})`, {
            vehicle_name: vehicleName,
            vehicle_id: newRow.vehicle_id,
            transport_date: newRow.transport_date,
            transport_time: newRow.transport_time || null,
            pickup_address: newRow.pickup_address || null,
            status: newRow.status || 'pending',
            assignment_id: newRow.id,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transport_assignments',
          filter: `booking_id=eq.${bookingId}`,
        },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          
          const { data: vehicle } = await supabase
            .from('vehicles')
            .select('name')
            .eq('id', newRow.vehicle_id)
            .single();
          const vehicleName = vehicle?.name || 'Okänt fordon';

          if (oldRow.partner_response !== newRow.partner_response && newRow.partner_response) {
            const responseMeta = {
              vehicle_name: vehicleName,
              vehicle_id: newRow.vehicle_id,
              response_type: newRow.partner_response,
              partner_name: newRow.partner_name || null,
              responded_at: newRow.partner_responded_at || new Date().toISOString(),
              assignment_id: newRow.id,
            };
            if (newRow.partner_response === 'accepted') {
              logActivity('transport_response', `Partnersvar: Accepterad — ${vehicleName}`, responseMeta);
            } else if (newRow.partner_response === 'declined') {
              logActivity('transport_declined', `Partnersvar: Nekad — ${vehicleName}`, responseMeta);
            }
          } else {
            logActivity('transport_updated', `Transport uppdaterad: ${vehicleName}`, {
              vehicle_name: vehicleName,
              vehicle_id: newRow.vehicle_id,
              transport_date: newRow.transport_date,
              transport_time: newRow.transport_time || null,
              pickup_address: newRow.pickup_address || null,
              status: newRow.status || newRow.partner_response || 'pending',
              assignment_id: newRow.id,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transport_email_log',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          const recipientName = newRow.recipient_name || newRow.recipient_email || 'partner';
          logActivity('email_sent', `Mejl skickat till ${recipientName}`, {
            recipient_name: newRow.recipient_name || null,
            recipient_email: newRow.recipient_email || null,
            subject: newRow.subject || null,
            assignment_id: newRow.assignment_id || null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookingId, projectId]);

  // --- Optimistic mutations ---

  const statusOptimistic = createOptimisticCallbacks<any, ProjectStatus>({
    queryClient,
    queryKey: ['project', projectId],
    type: 'single',
    optimisticData: (status, old) => old ? { ...old, status } : old,
    errorMessage: 'Kunde inte uppdatera status',
    invalidateKeys: [['projects']],
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProjectStatus(projectId, status),
    ...statusOptimistic,
    onSuccess: (_data, status) => {
      const oldStatus = projectQuery.data?.status;
      logActivity('status_changed', `Status ändrad till "${PROJECT_STATUS_LABELS[status]}"`, {
        old_status: oldStatus,
        new_status: status,
      });
      toast.success('Status uppdaterad');
    },
    onError: statusOptimistic.onError,
    onSettled: statusOptimistic.onSettled,
  });

  const addTaskOptimistic = createOptimisticCallbacks<any, { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }>({
    queryClient,
    queryKey: ['project-tasks', projectId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      title: vars.title,
      description: vars.description || null,
      assigned_to: vars.assigned_to || null,
      deadline: vars.deadline || null,
      completed: false,
      project_id: projectId,
      sort_order: 0,
      is_info_only: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    errorMessage: 'Kunde inte lägga till uppgift',
  });

  const addTaskMutation = useMutation({
    mutationFn: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => 
      createProjectTask({ ...task, project_id: projectId }),
    ...addTaskOptimistic,
    onSuccess: (_data, variables) => {
      logActivity('task_added', `Uppgift tillagd: "${variables.title}"`);
      toast.success('Uppgift tillagd');
    },
    onError: addTaskOptimistic.onError,
    onSettled: addTaskOptimistic.onSettled,
  });

  const updateTaskOptimistic = createOptimisticCallbacks<any, { id: string; updates: Partial<ProjectTask> }>({
    queryClient,
    queryKey: ['project-tasks', projectId],
    type: 'update',
    getId: (vars) => vars.id,
    optimisticData: (vars, old) => {
      const existing = old.find(t => t.id === vars.id);
      return existing ? { ...existing, ...vars.updates } : existing;
    },
    errorMessage: 'Kunde inte uppdatera uppgift',
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectTask> }) => 
      updateProjectTask(id, updates),
    ...updateTaskOptimistic,
    onSuccess: (_data, variables) => {
      if (variables.updates.completed !== undefined) {
        const task = tasksQuery.data?.find(t => t.id === variables.id);
        const taskName = task?.title || 'Uppgift';
        if (variables.updates.completed) {
          logActivity('task_completed', `Uppgift avslutad: "${taskName}"`);
        }
      }
    },
    onError: updateTaskOptimistic.onError,
    onSettled: updateTaskOptimistic.onSettled,
  });

  const deleteTaskOptimistic = createOptimisticCallbacks<any, string>({
    queryClient,
    queryKey: ['project-tasks', projectId],
    type: 'delete',
    getId: (id) => id,
    errorMessage: 'Kunde inte ta bort uppgift',
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => {
      const task = tasksQuery.data?.find(t => t.id === id);
      return deleteProjectTask(id).then(() => task?.title || 'Uppgift');
    },
    ...deleteTaskOptimistic,
    onSuccess: (taskTitle) => {
      logActivity('task_deleted', `Uppgift borttagen: "${taskTitle}"`);
      toast.success('Uppgift borttagen');
    },
    onError: deleteTaskOptimistic.onError,
    onSettled: deleteTaskOptimistic.onSettled,
  });

  const addCommentOptimistic = createOptimisticCallbacks<any, { author_name: string; content: string }>({
    queryClient,
    queryKey: ['project-comments', projectId],
    type: 'add',
    optimisticData: (vars) => ({
      id: `temp-${Date.now()}`,
      author_name: vars.author_name,
      content: vars.content,
      project_id: projectId,
      created_at: new Date().toISOString(),
    }),
    errorMessage: 'Kunde inte lägga till kommentar',
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { author_name: string; content: string }) => 
      createProjectComment({ ...data, project_id: projectId }),
    ...addCommentOptimistic,
    onSuccess: (_data, variables) => {
      logActivity('comment_added', `Kommentar av ${variables.author_name}`, {
        preview: variables.content.substring(0, 100),
      });
    },
    onError: addCommentOptimistic.onError,
    onSettled: addCommentOptimistic.onSettled,
  });

  // File mutations remain non-optimistic (server generates URL)
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
    bookingAttachments: bookingAttachmentsQuery.data || [],
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

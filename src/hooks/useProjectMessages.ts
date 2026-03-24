import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProjectMessages, sendProjectMessage, deleteProjectMessage } from "@/services/projectMessageService";
import type { ProjectMessageType } from "@/types/projectMessage";
import { useRealtimeInvalidation } from "./useRealtimeInvalidation";
import { toast } from "sonner";

export const useProjectMessages = (
  projectId: string | undefined,
  type?: ProjectMessageType,
  supplierId?: string
) => {
  const queryClient = useQueryClient();
  const queryKey = ['project-messages', projectId, type, supplierId];

  useRealtimeInvalidation({
    channelName: `project-messages-${projectId || 'none'}`,
    tables: ['project_messages'],
    queryKeys: [queryKey],
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchProjectMessages(projectId!, type, supplierId),
    enabled: !!projectId,
  });

  const sendMutation = useMutation({
    mutationFn: sendProjectMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] });
    },
    onError: () => toast.error('Kunde inte skicka meddelande'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProjectMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] });
    },
  });

  return {
    messages,
    isLoading,
    sendMessage: sendMutation.mutate,
    deleteMessage: deleteMutation.mutate,
    isSending: sendMutation.isPending,
  };
};

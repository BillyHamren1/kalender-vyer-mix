import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJobMessages, fetchJobParticipants, JobMessage, JobChatParticipant } from '@/services/jobChatService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';
import { format } from 'date-fns';

export const useJobChat = (bookingId: string | null) => {
  const today = format(new Date(), 'yyyy-MM-dd');

  useRealtimeInvalidation({
    channelName: `job-chat-${bookingId || 'none'}`,
    tables: ['job_messages', 'booking_staff_assignments'],
    queryKeys: [['job-chat', bookingId || '']],
  });

  const messagesQuery = useQuery<JobMessage[]>({
    queryKey: ['job-chat', bookingId, 'messages'],
    queryFn: () => fetchJobMessages(bookingId!),
    enabled: !!bookingId,
    refetchInterval: 15000,
  });

  const participantsQuery = useQuery<JobChatParticipant[]>({
    queryKey: ['job-chat', bookingId, 'participants'],
    queryFn: () => fetchJobParticipants(bookingId!, today),
    enabled: !!bookingId,
    refetchInterval: 60000,
  });

  return {
    messages: messagesQuery.data || [],
    isLoadingMessages: messagesQuery.isLoading,
    participants: participantsQuery.data || [],
    isLoadingParticipants: participantsQuery.isLoading,
  };
};

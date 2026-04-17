import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJobMessages, fetchJobParticipants, JobMessage, JobChatParticipant } from '@/services/jobChatService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';
import { format } from 'date-fns';

export const useJobChat = (bookingId: string | null) => {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Server-side filter on booking_id keeps the channel quiet — we won't
  // wake up for messages on other jobs. Only INSERT triggers a refetch;
  // read-receipt UPDATEs are handled in JobChatView via local state.
  useRealtimeInvalidation({
    channelName: `job-chat-${bookingId || 'none'}`,
    tables: bookingId
      ? [
          { table: 'job_messages', events: ['INSERT'], filter: `booking_id=eq.${bookingId}` },
          { table: 'booking_staff_assignments', events: ['INSERT', 'DELETE'], filter: `booking_id=eq.${bookingId}` },
        ]
      : [],
    queryKeys: [['job-chat', bookingId || '']],
    debounceMs: 200,
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

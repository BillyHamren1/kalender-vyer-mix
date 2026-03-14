import { useQuery } from '@tanstack/react-query';
import { fetchDirectMessages, DirectMessage } from '@/services/directMessageService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

export const useDirectMessages = (myId: string | null, staffId: string | null) => {
  useRealtimeInvalidation({
    channelName: `dm-${myId}-${staffId}`,
    tables: ['direct_messages'],
    queryKeys: [['direct-messages', myId || '', staffId || '']],
  });

  const messagesQuery = useQuery<DirectMessage[]>({
    queryKey: ['direct-messages', myId, staffId, 'messages'],
    queryFn: () => fetchDirectMessages(myId!, staffId!),
    enabled: !!myId && !!staffId,
    refetchInterval: 10000,
  });

  return {
    messages: messagesQuery.data || [],
    isLoading: messagesQuery.isLoading,
  };
};

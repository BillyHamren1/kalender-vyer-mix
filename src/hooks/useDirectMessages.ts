import { useQuery } from '@tanstack/react-query';
import { fetchDirectMessages, DirectMessage } from '@/services/directMessageService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

/**
 * Hook for fetching direct messages between two participants.
 * Supports dual-identity: allMyIds and allPartnerIds can contain
 * both staff_members.id and auth.users.id for the same person.
 */
export const useDirectMessages = (allMyIds: string[], allPartnerIds: string[]) => {
  const channelKey = `dm-${allMyIds.join('-')}-${allPartnerIds.join('-')}`;

  useRealtimeInvalidation({
    channelName: channelKey,
    tables: ['direct_messages'],
    queryKeys: [['direct-messages', ...allMyIds, ...allPartnerIds]],
  });

  const messagesQuery = useQuery<DirectMessage[]>({
    queryKey: ['direct-messages', ...allMyIds, ...allPartnerIds, 'messages'],
    queryFn: () => fetchDirectMessages(allMyIds, allPartnerIds),
    enabled: allMyIds.length > 0 && allPartnerIds.length > 0,
    refetchInterval: 10000,
  });

  return {
    messages: messagesQuery.data || [],
    isLoading: messagesQuery.isLoading,
  };
};

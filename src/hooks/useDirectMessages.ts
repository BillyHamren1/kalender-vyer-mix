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

  // Only react to INSERT — UPDATE (read receipts) is handled inside the chat view
  // via local state; refetching the whole thread on every read flag would thrash.
  // We can't filter server-side on multi-id pairs, so the queryFn already scopes.
  useRealtimeInvalidation({
    channelName: channelKey,
    tables: [{ table: 'direct_messages', events: ['INSERT'] }],
    queryKeys: [['direct-messages', ...allMyIds, ...allPartnerIds]],
    debounceMs: 200,
  });

  const messagesQuery = useQuery<DirectMessage[]>({
    queryKey: ['direct-messages', ...allMyIds, ...allPartnerIds, 'messages'],
    queryFn: () => fetchDirectMessages(allMyIds, allPartnerIds),
    enabled: allMyIds.length > 0 && allPartnerIds.length > 0,
    refetchInterval: 30000,
  });

  return {
    messages: messagesQuery.data || [],
    isLoading: messagesQuery.isLoading,
  };
};

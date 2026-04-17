import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

interface DMConversation {
  partner_id: string;
  partner_name: string;
  last_message: any;
  unread_count: number;
  messages: any[];
  archived?: boolean;
}

interface BroadcastItem {
  id: string;
  sender_name: string;
  content: string;
  category: string;
  audience: string;
  is_read: boolean;
  created_at: string;
}

interface JobConversation {
  bookingId: string;
  client: string;
  lastMessage: string;
  lastTime: string;
  unreadCount: number;
  status: string;
  lastDate: string | null;
}

interface InboxAllData {
  conversations: DMConversation[];
  broadcasts: BroadcastItem[];
  jobs: JobConversation[];
}

const STALE_TIME = 30_000;
const GC_TIME = 5 * 60_000;
const REFETCH_INTERVAL = 60_000; // Backup polling — realtime handles immediate updates

export function useMobileInbox() {
  const { staff } = useMobileAuth();
  const queryClient = useQueryClient();

  // Realtime: invalidate inbox cache on new DMs, broadcasts OR job messages
  useRealtimeInvalidation({
    channelName: 'mobile-inbox-realtime',
    tables: ['direct_messages', 'broadcast_messages', 'job_messages'],
    queryKeys: [['mobile-inbox-all']],
  });

  const inboxQuery = useQuery({
    queryKey: ['mobile-inbox-all'],
    queryFn: async (): Promise<InboxAllData> => {
      const res = await mobileApi.getInboxAll();
      const conversations: DMConversation[] = res.conversations || [];
      const broadcasts: BroadcastItem[] = (res.broadcasts || []).map((b: any) => ({
        ...b,
        is_read: b.is_read ?? false,
      }));
      const jobs: JobConversation[] = (res.bookings || []).slice(0, 50).map((b: any) => ({
        bookingId: b.id,
        client: b.client,
        lastMessage: b.last_message_content || '',
        lastTime: b.last_message_at || '',
        unreadCount: b.unread_count || 0,
        status: b.status || 'CONFIRMED',
        lastDate: b.rigdowndate || b.eventdate || b.rigdaydate || null,
      }));
      return { conversations, broadcasts, jobs };
    },
    enabled: !!staff,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchInterval: REFETCH_INTERVAL,
  });

  const data = inboxQuery.data;

  const refetchAll = () => {
    inboxQuery.refetch();
  };

  // Optimistic: mark DM conversation as read
  const markDMReadOptimistic = (partnerId: string) => {
    queryClient.setQueryData<InboxAllData>(['mobile-inbox-all'], (old) => {
      if (!old) return old;
      return {
        ...old,
        conversations: old.conversations.map(c =>
          c.partner_id === partnerId ? { ...c, unread_count: 0 } : c
        ),
      };
    });
  };

  // Optimistic: append a sent DM message
  const appendDMMessage = (partnerId: string, message: any) => {
    queryClient.setQueryData<InboxAllData>(['mobile-inbox-all'], (old) => {
      if (!old) return old;
      return {
        ...old,
        conversations: old.conversations.map(c =>
          c.partner_id === partnerId ? { ...c, messages: [...c.messages, message] } : c
        ),
      };
    });
  };

  // Optimistic: mark broadcast as read
  const markBroadcastReadOptimistic = (broadcastId: string) => {
    queryClient.setQueryData<InboxAllData>(['mobile-inbox-all'], (old) => {
      if (!old) return old;
      return {
        ...old,
        broadcasts: old.broadcasts.map(b =>
          b.id === broadcastId ? { ...b, is_read: true } : b
        ),
      };
    });
  };

  // Optimistic: mark job conversation as read
  const markJobReadOptimistic = (bookingId: string) => {
    queryClient.setQueryData<InboxAllData>(['mobile-inbox-all'], (old) => {
      if (!old) return old;
      return {
        ...old,
        jobs: old.jobs.map(j =>
          j.bookingId === bookingId ? { ...j, unreadCount: 0 } : j
        ),
      };
    });
  };

  return {
    dmConversations: data?.conversations || [],
    broadcasts: data?.broadcasts || [],
    jobConversations: data?.jobs || [],
    isLoading: inboxQuery.isLoading,
    refetchAll,
    markDMReadOptimistic,
    appendDMMessage,
    markBroadcastReadOptimistic,
    markJobReadOptimistic,
  };
}

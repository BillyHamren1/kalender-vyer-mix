import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';

interface DMConversation {
  partner_id: string;
  partner_name: string;
  last_message: any;
  unread_count: number;
  messages: any[];
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
  unread: boolean;
  status: string;
  lastDate: string | null; // rigdowndate || eventdate || rigdaydate
}

const STALE_TIME = 30_000;
const GC_TIME = 5 * 60_000;
const REFETCH_INTERVAL = 30_000;

export function useMobileInbox() {
  const { staff } = useMobileAuth();
  const queryClient = useQueryClient();

  const dmQuery = useQuery({
    queryKey: ['mobile-inbox-dms'],
    queryFn: async (): Promise<DMConversation[]> => {
      const res = await mobileApi.getDirectMessages();
      return res.conversations || [];
    },
    enabled: !!staff,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchInterval: REFETCH_INTERVAL,
  });

  const broadcastQuery = useQuery({
    queryKey: ['mobile-inbox-broadcasts'],
    queryFn: async (): Promise<BroadcastItem[]> => {
      const res = await mobileApi.getBroadcasts();
      return (res.broadcasts || []).map((b: any) => ({
        ...b,
        is_read: b.is_read ?? false,
      }));
    },
    enabled: !!staff,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchInterval: REFETCH_INTERVAL,
  });

  const jobQuery = useQuery({
    queryKey: ['mobile-inbox-jobs'],
    queryFn: async (): Promise<JobConversation[]> => {
      const res = await mobileApi.getBookings();
      return (res.bookings || []).slice(0, 50).map((b: any) => ({
        bookingId: b.id,
        client: b.client,
        lastMessage: '',
        lastTime: '',
        unread: false,
        status: b.status || 'CONFIRMED',
        lastDate: b.rigdowndate || b.eventdate || b.rigdaydate || null,
      }));
    },
    enabled: !!staff,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchInterval: REFETCH_INTERVAL,
  });

  const isLoading = dmQuery.isLoading || broadcastQuery.isLoading || jobQuery.isLoading;

  const refetchAll = () => {
    dmQuery.refetch();
    broadcastQuery.refetch();
    jobQuery.refetch();
  };

  // Optimistic: mark DM conversation as read
  const markDMReadOptimistic = (partnerId: string) => {
    queryClient.setQueryData<DMConversation[]>(['mobile-inbox-dms'], (old) =>
      old?.map(c => c.partner_id === partnerId ? { ...c, unread_count: 0 } : c)
    );
  };

  // Optimistic: append a sent DM message
  const appendDMMessage = (partnerId: string, message: any) => {
    queryClient.setQueryData<DMConversation[]>(['mobile-inbox-dms'], (old) =>
      old?.map(c => c.partner_id === partnerId ? { ...c, messages: [...c.messages, message] } : c)
    );
  };

  // Optimistic: mark broadcast as read
  const markBroadcastReadOptimistic = (broadcastId: string) => {
    queryClient.setQueryData<BroadcastItem[]>(['mobile-inbox-broadcasts'], (old) =>
      old?.map(b => b.id === broadcastId ? { ...b, is_read: true } : b)
    );
  };

  return {
    dmConversations: dmQuery.data || [],
    broadcasts: broadcastQuery.data || [],
    jobConversations: jobQuery.data || [],
    isLoading,
    refetchAll,
    markDMReadOptimistic,
    appendDMMessage,
    markBroadcastReadOptimistic,
  };
}

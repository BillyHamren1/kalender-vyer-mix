import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns total unread message count (DMs + broadcasts) for the current mobile staff user.
 * Reads from React Query cache when available (shared with useMobileInbox),
 * falls back to direct API calls, and subscribes to realtime for instant updates.
 */
export function useUnreadMessageCount() {
  const { staff } = useMobileAuth();
  const queryClient = useQueryClient();
  const [count, setCount] = useState(0);

  const computeFromCache = useCallback(() => {
    const allData = queryClient.getQueryData<any>(['mobile-inbox-all']);

    if (allData) {
      const unreadDM = (allData.conversations || []).reduce(
        (sum: number, c: any) => sum + (c.unread_count || 0),
        0
      );
      const unreadBroadcast = (allData.broadcasts || []).filter(
        (b: any) => !b.is_read
      ).length;
      const unreadJobs = (allData.jobs || []).reduce(
        (sum: number, j: any) => sum + (j.unreadCount || 0),
        0
      );
      setCount(unreadDM + unreadBroadcast + unreadJobs);
      return true;
    }
    return false;
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (!staff) { setCount(0); return; }
    // Try cache first
    if (computeFromCache()) return;
    // Fallback to API
    try {
      const res = await mobileApi.getInboxAll();
      const unreadDM = (res.conversations || []).reduce(
        (sum: number, c: any) => sum + (c.unread_count || 0),
        0
      );
      const unreadBroadcast = (res.broadcasts || []).filter(
        (b: any) => !(b.is_read_by || []).includes(staff.id) && !b.is_read
      ).length;
      const unreadJobs = (res.bookings || []).reduce(
        (sum: number, b: any) => sum + (b.unread_count || 0),
        0
      );
      setCount(unreadDM + unreadBroadcast + unreadJobs);
    } catch {
      // silently ignore
    }
  }, [staff, computeFromCache]);

  // Subscribe to React Query cache changes so optimistic updates reflect immediately
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (staff) {
        computeFromCache();
      }
    });
    return () => unsubscribe();
  }, [queryClient, staff, computeFromCache]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for in-app push events
  useEffect(() => {
    const handler = () => { refresh(); };
    window.addEventListener('push-notification-received', handler);
    return () => window.removeEventListener('push-notification-received', handler);
  }, [refresh]);

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!staff) return;

    const channel = supabase
      .channel('unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => {
        refresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcast_messages' }, () => {
        refresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_messages' }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff, refresh]);

  return { count, refresh };
}

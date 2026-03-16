import { useState, useEffect, useCallback } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns total unread message count (DMs + broadcasts) for the current mobile staff user.
 * Subscribes to realtime changes on direct_messages and broadcast_messages for instant badge updates.
 */
export function useUnreadMessageCount() {
  const { staff } = useMobileAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!staff) { setCount(0); return; }
    try {
      const [dmRes, broadcastRes] = await Promise.all([
        mobileApi.getDirectMessages(),
        mobileApi.getBroadcasts(),
      ]);
      const unreadDM = (dmRes.conversations || []).reduce(
        (sum: number, c: any) => sum + (c.unread_count || 0),
        0
      );
      const unreadBroadcast = (broadcastRes.broadcasts || []).filter(
        (b: any) => !b.is_read
      ).length;
      setCount(unreadDM + unreadBroadcast);
    } catch {
      // silently ignore
    }
  }, [staff]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for in-app push events (custom event dispatched from pushNotificationService)
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff, refresh]);

  return { count, refresh };
}

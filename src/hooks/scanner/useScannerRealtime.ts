import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ScannerRealtimeConfig {
  /** Tables to subscribe to */
  tables: string[];
  /** Called when any subscribed table changes */
  onChanged: () => void;
  /** Polling interval in ms (default 30000) */
  pollingInterval?: number;
  /** Whether the subscription is active */
  enabled?: boolean;
}

/**
 * Realtime sync hook for Scanner app.
 * Subscribes to Supabase Realtime on specified tables and
 * triggers a callback on any change. Includes a polling fallback.
 */
export const useScannerRealtime = ({
  tables,
  onChanged,
  pollingInterval = 30000,
  enabled = true,
}: ScannerRealtimeConfig) => {
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // Realtime subscription
  useEffect(() => {
    if (!enabled) return;

    const channelName = `scanner-rt-${tables.join('-')}`;
    let channel = supabase.channel(channelName);

    tables.forEach(table => {
      channel = channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        () => {
          console.log(`[ScannerRealtime] Change detected on ${table}`);
          onChangedRef.current();
        }
      );
    });

    channel.subscribe((status) => {
      console.log(`[ScannerRealtime] Channel ${channelName}: ${status}`);
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tables.join(','), enabled]);

  // Polling fallback
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      console.log('[ScannerRealtime] Polling fallback tick');
      onChangedRef.current();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [pollingInterval, enabled]);
};

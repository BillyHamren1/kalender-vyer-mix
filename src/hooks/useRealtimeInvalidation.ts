import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RealtimeConfig {
  channelName: string;
  tables: string[];
  queryKeys: string[][];
}

/**
 * Subscribe to Supabase Realtime changes on specified tables
 * and invalidate the given React Query keys when changes occur.
 */
export const useRealtimeInvalidation = ({ channelName, tables, queryKeys }: RealtimeConfig) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let channel = supabase.channel(channelName);

    tables.forEach(table => {
      channel = channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        () => {
          queryKeys.forEach(key => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, queryClient]);
};

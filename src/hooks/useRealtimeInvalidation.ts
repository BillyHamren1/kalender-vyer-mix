import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type PgEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface TableConfig {
  table: string;
  /** Postgres changes events to react to. Default: ['INSERT'] (UPDATE/DELETE are usually noise for inboxes) */
  events?: PgEvent[];
  /** Optional postgres-changes filter, e.g. `booking_id=eq.${id}` */
  filter?: string;
  /**
   * Optional local cache mutator. If it returns true, no invalidation is performed
   * (we already updated the cache locally → React Query will not refetch).
   * Return false/void to fall back to invalidating `queryKeys`.
   */
  onEvent?: (payload: any, qc: QueryClient) => boolean | void;
}

interface RealtimeConfig {
  channelName: string;
  /** Either simple table list (legacy) OR full per-table config */
  tables: (string | TableConfig)[];
  queryKeys: string[][];
  /** Coalesce burst events within this many ms before invalidating. Default 150 */
  debounceMs?: number;
  /** Skip invalidation entirely while this returns true (e.g. screen not visible) */
  pause?: () => boolean;
}

/**
 * Subscribe to Supabase Realtime changes with fine-grained control:
 *  - per-table event types and filters (server-side)
 *  - optional local cache mutator to avoid refetches
 *  - debounced invalidation so bursts collapse into a single refetch
 */
export const useRealtimeInvalidation = ({
  channelName,
  tables,
  queryKeys,
  debounceMs = 150,
  pause,
}: RealtimeConfig) => {
  const queryClient = useQueryClient();
  // Stable refs so we don't re-subscribe on every render
  const queryKeysRef = useRef(queryKeys);
  const pauseRef = useRef(pause);
  queryKeysRef.current = queryKeys;
  pauseRef.current = pause;

  useEffect(() => {
    let channel = supabase.channel(channelName);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleInvalidate = () => {
      if (pauseRef.current?.()) return;
      if (timer) return; // already scheduled within window
      timer = setTimeout(() => {
        timer = null;
        queryKeysRef.current.forEach(key => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }, debounceMs);
    };

    tables.forEach(entry => {
      const cfg: TableConfig = typeof entry === 'string'
        ? { table: entry, events: ['INSERT'] }
        : { events: ['INSERT'], ...entry };

      cfg.events!.forEach(event => {
        const opts: any = { event, schema: 'public', table: cfg.table };
        if (cfg.filter) opts.filter = cfg.filter;

        channel = channel.on('postgres_changes' as any, opts, (payload: any) => {
          // Local mutator first — if it handles the event, skip invalidation.
          const handled = cfg.onEvent?.(payload, queryClient);
          if (handled === true) return;
          scheduleInvalidate();
        });
      });
    });

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, queryClient, debounceMs]);
};

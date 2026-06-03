import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchLivePackingProjects,
  fetchActivityCounts,
  LivePackingItem,
  LivePackingActivityCounts,
} from '@/services/livePackingFeedService';

const SEEN_KEY_PREFIX = 'opsLivePackingSeen.';

const readSeen = (id: string): number | undefined => {
  try {
    const v = localStorage.getItem(SEEN_KEY_PREFIX + id);
    return v ? Number(v) : undefined;
  } catch {
    return undefined;
  }
};
const writeSeen = (id: string, ts: number) => {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + id, String(ts));
  } catch {
    /* ignore */
  }
};

export interface UseLivePackingFeedReturn {
  items: LivePackingItem[];
  counts: Record<string, LivePackingActivityCounts>;
  isLoading: boolean;
  markSeen: (packingId: string) => void;
  pulseIds: Set<string>;
}

export interface UseLivePackingFeedOptions {
  enabled?: boolean;
}

export function useLivePackingFeed(options?: UseLivePackingFeedOptions): UseLivePackingFeedReturn {
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();
  const [seenVersion, setSeenVersion] = useState(0);
  const [pulseIds, setPulseIds] = useState<Set<string>>(new Set());

  const itemsQuery = useQuery<LivePackingItem[]>({
    queryKey: ['ops-live-packing'],
    queryFn: fetchLivePackingProjects,
    refetchInterval: 60_000,
    enabled,
  });

  const items = enabled ? (itemsQuery.data || []) : [];
  const ids = useMemo(() => items.map(i => i.id), [items]);

  const seenMap = useMemo(() => {
    const m: Record<string, number | undefined> = {};
    ids.forEach(id => {
      m[id] = readSeen(id);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|'), seenVersion]);

  const countsQuery = useQuery<Record<string, LivePackingActivityCounts>>({
    queryKey: ['ops-live-packing-counts', ids.join('|'), seenVersion],
    queryFn: () => fetchActivityCounts(ids, seenMap),
    enabled: enabled && ids.length > 0,
    refetchInterval: 120_000,
  });

  // Realtime subscription — only when enabled
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel('ops-live-packing-realtime');

    const tables = [
      'packing_projects',
      'packing_files',
      'packing_purchases',
      'packing_comments',
      'packing_invoices',
    ];

    tables.forEach(table => {
      const events: Array<'INSERT' | 'UPDATE'> = table === 'packing_projects' ? ['UPDATE', 'INSERT'] : ['INSERT'];
      events.forEach(event => {
        channel.on(
          'postgres_changes' as any,
          { event, schema: 'public', table },
          (payload: any) => {
            const row = payload.new || payload.old;
            const pid: string | undefined = row?.packing_id || row?.id;
            if (pid) {
              setPulseIds(prev => {
                const next = new Set(prev);
                next.add(pid);
                return next;
              });
              setTimeout(() => {
                setPulseIds(prev => {
                  const next = new Set(prev);
                  next.delete(pid);
                  return next;
                });
              }, 4000);
            }
            queryClient.invalidateQueries({ queryKey: ['ops-live-packing'] });
            queryClient.invalidateQueries({ queryKey: ['ops-live-packing-counts'] });
          }
        );
      });
    });

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, enabled]);

  const markSeen = useCallback((packingId: string) => {
    writeSeen(packingId, Date.now());
    setSeenVersion(v => v + 1);
  }, []);

  if (!enabled) {
    return {
      items: [],
      counts: {},
      isLoading: false,
      markSeen,
      pulseIds: new Set<string>(),
    };
  }

  return {
    items,
    counts: countsQuery.data || {},
    isLoading: itemsQuery.isLoading,
    markSeen,
    pulseIds,
  };
}

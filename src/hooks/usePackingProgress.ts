import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PackingProgress {
  packingId: string;
  bookingId: string;
  status: string;
  totalItems: number;
  scannedItems: number;
  remainingItems: number;
  lastActivity: string | null;
}

/**
 * Batch-fetch packing progress for a list of booking IDs.
 * Returns a Map<bookingId, PackingProgress>.
 * Includes realtime subscriptions + 30s polling fallback.
 */
export function usePackingProgressBatch(bookingIds: string[]) {
  const queryClient = useQueryClient();
  const dedupedIds = [...new Set(bookingIds.filter(Boolean))];

  const query = useQuery({
    queryKey: ['packing-progress-batch', dedupedIds.sort().join(',')],
    queryFn: async (): Promise<Map<string, PackingProgress>> => {
      if (dedupedIds.length === 0) return new Map();

      // Fetch packing projects for these bookings
      const { data: packings, error: pErr } = await supabase
        .from('packing_projects')
        .select('id, booking_id, status')
        .in('booking_id', dedupedIds);

      if (pErr || !packings?.length) return new Map();

      const packingIds = packings.map(p => p.id);

      // Fetch packing list items for all packing projects
      const { data: items, error: iErr } = await supabase
        .from('packing_list_items')
        .select('packing_id, quantity_to_pack, quantity_packed, packed_at')
        .in('packing_id', packingIds);

      // Aggregate per packing
      const itemsByPacking = new Map<string, { total: number; scanned: number; lastUpdated: string | null }>();
      (items || []).forEach(item => {
        const existing = itemsByPacking.get(item.packing_id) || { total: 0, scanned: 0, lastUpdated: null };
        existing.total += (item.quantity_to_pack || 0);
        existing.scanned += (item.quantity_packed || 0);
        if (item.packed_at && (!existing.lastUpdated || item.packed_at > existing.lastUpdated)) {
          existing.lastUpdated = item.packed_at;
        }
        itemsByPacking.set(item.packing_id, existing);
      });

      const result = new Map<string, PackingProgress>();
      packings.forEach(p => {
        const agg = itemsByPacking.get(p.id) || { total: 0, scanned: 0, lastUpdated: null };
        result.set(p.booking_id, {
          packingId: p.id,
          bookingId: p.booking_id,
          status: p.status,
          totalItems: agg.total,
          scannedItems: agg.scanned,
          remainingItems: Math.max(0, agg.total - agg.scanned),
          lastActivity: agg.lastUpdated,
        });
      });

      return result;
    },
    enabled: dedupedIds.length > 0,
    refetchInterval: 30000, // 30s polling fallback
    staleTime: 5000,
  });

  // Realtime subscriptions
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (dedupedIds.length === 0) return;

    const channel = supabase
      .channel('packing-progress-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'packing_projects',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['packing-progress-batch'] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'packing_list_items',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['packing-progress-batch'] });
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [dedupedIds.length > 0, queryClient]);

  return {
    progressMap: query.data || new Map<string, PackingProgress>(),
    isLoading: query.isLoading,
  };
}

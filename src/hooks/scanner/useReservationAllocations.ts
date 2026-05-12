import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getReservationAllocations,
  type WmsAllocation,
} from '@/services/scannerService';

/**
 * Hydrerar WMS-allokeringar för en packlista och håller dem i synk via
 * Realtime-subscription på `wms_reservation_allocations` filtrerad på
 * packing_id (== reservation_id-spegling lokalt).
 */
export const useReservationAllocations = (packingId: string | null | undefined) => {
  const [allocations, setAllocations] = useState<WmsAllocation[]>([]);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  const refetch = useCallback(async () => {
    if (!packingId) return;
    // Throttle: undvik storm under burst av realtime-events
    const now = Date.now();
    if (now - lastFetchRef.current < 500) return;
    lastFetchRef.current = now;

    setIsLoading(true);
    try {
      const res = await getReservationAllocations(packingId);
      if (res.success) {
        setAllocations(res.allocations || []);
        setReservationId(res.reservation_id ?? null);
        setError(null);
      } else {
        setError(res.error || 'Kunde inte hämta WMS-allokeringar');
      }
    } catch (err: any) {
      setError(err?.message || 'Nätverksfel');
    } finally {
      setIsLoading(false);
    }
  }, [packingId]);

  // Initial hydrate
  useEffect(() => {
    if (!packingId) return;
    void refetch();
  }, [packingId, refetch]);

  // Realtime subscription on the local mirror table, filtered by packing_id
  useEffect(() => {
    if (!packingId) return;
    const channel = supabase
      .channel(`wms-alloc-${packingId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'wms_reservation_allocations',
          filter: `packing_id=eq.${packingId}`,
        },
        () => {
          console.log('[useReservationAllocations] mirror change → refetch');
          void refetch();
        },
      )
      .subscribe((status) => {
        console.log(`[useReservationAllocations] channel status: ${status}`);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [packingId, refetch]);

  // Set of normalised serial numbers for snabb O(1) UI-lookup
  const allocatedSerials = new Set(
    allocations.map((a) => a.serial_number.trim().toUpperCase()).filter(Boolean),
  );
  const allocatedSkus = new Set(
    allocations.map((a) => (a.sku || '').trim().toUpperCase()).filter(Boolean),
  );
  const allocatedItemTypeIds = new Set(
    allocations.map((a) => (a.item_type_id || '').trim().toLowerCase()).filter(Boolean),
  );

  return {
    allocations,
    reservationId,
    isLoading,
    error,
    refetch,
    allocatedSerials,
    allocatedSkus,
    allocatedItemTypeIds,
    isAlreadyAllocated: (serial: string) =>
      allocatedSerials.has((serial || '').trim().toUpperCase()),
  };
};

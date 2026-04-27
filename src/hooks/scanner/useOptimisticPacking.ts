import { useState, useCallback, useRef } from 'react';
import {
  fetchPackingListItems,
  fetchPackingForScanner,
  type PackingListNotReady,
} from '@/services/scannerService';
import { PackingWithBooking } from '@/types/packing';
import { scanLog } from './scanLog';
import { computePackingProgress } from '@/lib/packing/progress';

export interface PackingItem {
  id: string;
  quantity_to_pack: number;
  quantity_packed: number;
  verified_at: string | null;
  verified_by: string | null;
  parcel_id: string | null;
  booking_products: {
    id: string;
    name: string;
    quantity: number;
    sku: string | null;
    notes: string | null;
    parent_product_id: string | null;
    parent_package_id: string | null;
    is_package_component: boolean | null;
  } | null;
}

export interface PackingProgress {
  total: number;
  verified: number;
  percentage: number;
}

export const useOptimisticPacking = (packingId: string) => {
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState<PackingProgress>({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  /**
   * When the server reports the packing list is empty but the source booking
   * has products, we expose this envelope so the UI can render a clear
   * "not ready / regenerate" state instead of mounting the scanner with an
   * empty list. `null` = normal/loaded.
   */
  const [notReady, setNotReady] = useState<PackingListNotReady | null>(null);
  const itemOrderRef = useRef<Record<string, number>>({});

  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    // Single source of truth — see src/lib/packing/progress.ts.
    const { total, verified, percentage } = computePackingProgress(updatedItems);
    setProgress({ total, verified, percentage });
  }, []);

  const applyOptimisticIncrement = useCallback((itemId: string) => {
    setItems(prev => {
      const updated = prev.map(item =>
        item.id === itemId
          ? { ...item, quantity_packed: (item.quantity_packed || 0) + 1 }
          : item
      );
      recalcProgress(updated);
      return updated;
    });
    scanLog('quantity_updated', { itemId, direction: '+1' });
  }, [recalcProgress]);

  const applyOptimisticSet = useCallback((itemId: string, quantity: number) => {
    setItems(prev => {
      const updated = prev.map(item =>
        item.id === itemId
          ? { ...item, quantity_packed: Math.max(0, quantity) }
          : item
      );
      recalcProgress(updated);
      return updated;
    });
    scanLog('quantity_set', { itemId, quantity });
  }, [recalcProgress]);

  const applyOptimisticDecrement = useCallback((itemId: string) => {
    setItems(prev => {
      const updated = prev.map(item =>
        item.id === itemId
          ? { ...item, quantity_packed: Math.max(0, (item.quantity_packed || 0) - 1) }
          : item
      );
      recalcProgress(updated);
      return updated;
    });
    scanLog('quantity_updated', { itemId, direction: '-1' });
  }, [recalcProgress]);

  const mergeServerData = useCallback((serverItems: PackingItem[]) => {
    const stableSorted = [...serverItems].sort(
      (a, b) => (itemOrderRef.current[a.id] ?? 9999) - (itemOrderRef.current[b.id] ?? 9999)
    );

    setItems(prev => {
      const prevMap = new Map(prev.map(i => [i.id, i]));
      return stableSorted.map(serverItem => {
        const localItem = prevMap.get(serverItem.id);
        if (localItem && localItem.quantity_packed > serverItem.quantity_packed) {
          return { ...serverItem, quantity_packed: localItem.quantity_packed };
        }
        return serverItem;
      });
    });
    scanLog('sync_response', { itemCount: serverItems.length });
  }, []);

  const loadData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setIsLoading(true);

      // READ-ONLY fetch — server never mutates on get_packing_items.
      const [packingData, itemsResult] = await Promise.all([
        fetchPackingForScanner(packingId),
        fetchPackingListItems(packingId),
      ]);

      setPacking(packingData);

      // Not-ready envelope: stop and surface to UI.
      if (itemsResult && !Array.isArray(itemsResult) && (itemsResult as any).__packingListNotReady) {
        setNotReady(itemsResult as PackingListNotReady);
        if (!isBackground) {
          setItems([]);
          recalcProgress([]);
        }
        return;
      }

      // Healthy load — clear any stale not-ready flag.
      setNotReady(null);

      const typedItems = itemsResult as PackingItem[];
      if (Object.keys(itemOrderRef.current).length === 0) {
        const order: Record<string, number> = {};
        typedItems.forEach((item, idx) => { order[item.id] = idx; });
        itemOrderRef.current = order;
        setItems(typedItems);
        recalcProgress(typedItems);
      } else if (isBackground) {
        mergeServerData(typedItems);
      } else {
        const stableSorted = [...typedItems].sort(
          (a, b) => (itemOrderRef.current[a.id] ?? 9999) - (itemOrderRef.current[b.id] ?? 9999)
        );
        setItems(stableSorted);
        recalcProgress(stableSorted);
      }
    } catch (err) {
      console.error('Error loading packing data:', err);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [packingId, mergeServerData, recalcProgress]);

  return {
    packing,
    items,
    setItems,
    progress,
    isLoading,
    notReady,
    loadData,
    recalcProgress,
    applyOptimisticIncrement,
    applyOptimisticSet,
    applyOptimisticDecrement,
    mergeServerData,
  };
};

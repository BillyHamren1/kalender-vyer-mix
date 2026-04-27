import { useState, useCallback, useRef } from 'react';
import {
  fetchPackingListItems,
  fetchPackingForScanner,
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
  const itemOrderRef = useRef<Record<string, number>>({});

  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    const parentProductIds = new Set<string>();
    updatedItems.forEach(item => {
      const pid = item.booking_products?.parent_product_id;
      if (pid) parentProductIds.add(pid);
    });
    const countable = updatedItems.filter(item => {
      const productId = item.booking_products?.id;
      return !productId || !parentProductIds.has(productId);
    });
    const total = countable.reduce((sum, i) => sum + i.quantity_to_pack, 0);
    const verified = countable.reduce((sum, i) => sum + Math.min(i.quantity_packed || 0, i.quantity_to_pack), 0);
    const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;
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

  // Set the exact quantity_packed for an item (used when backend reports an authoritative value,
  // e.g. after over-scan where the server count is the source of truth).
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
    // Sort according to saved order
    const stableSorted = [...serverItems].sort(
      (a, b) => (itemOrderRef.current[a.id] ?? 9999) - (itemOrderRef.current[b.id] ?? 9999)
    );
    
    setItems(prev => {
      const prevMap = new Map(prev.map(i => [i.id, i]));
      return stableSorted.map(serverItem => {
        const localItem = prevMap.get(serverItem.id);
        if (localItem && localItem.quantity_packed > serverItem.quantity_packed) {
          // NEVER decrease local quantity
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

      // Fetch packing metadata and items first (items auto-generates packing_list_items)
      const [packingData, itemsData] = await Promise.all([
        fetchPackingForScanner(packingId),
        fetchPackingListItems(packingId),
      ]);

      setPacking(packingData);

      const typedItems = itemsData as PackingItem[];
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
    loadData,
    recalcProgress,
    applyOptimisticIncrement,
    applyOptimisticSet,
    applyOptimisticDecrement,
    mergeServerData,
  };
};

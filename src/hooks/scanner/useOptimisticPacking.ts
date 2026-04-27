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

/**
 * Reconciliation policy
 * ---------------------
 * Server is the source of truth. Optimistic local increments are allowed only
 * for a short pending window (PENDING_TTL_MS) to bridge the round-trip while a
 * scan is in flight. After that window expires, server values always win — even
 * when the server reports a LOWER quantity than the local optimistic state.
 *
 * Reasons the server may report less than local:
 *   - backend rejected the scan
 *   - another device decremented / reset the item
 *   - over-scan capped at quantity_to_pack
 *
 * Any downward correction is logged via scanLog('reconcile_drift', ...).
 */
const PENDING_TTL_MS = 4000;

export const useOptimisticPacking = (packingId: string) => {
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState<PackingProgress>({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const itemOrderRef = useRef<Record<string, number>>({});
  // itemId -> { qty, expiresAt } for in-flight optimistic increments only
  const pendingRef = useRef<Record<string, { qty: number; expiresAt: number }>>({});

  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    // Single source of truth — see src/lib/packing/progress.ts.
    // Server-side checkIfAllPacked uses the same rule via the Deno mirror.
    const { total, verified, percentage } = computePackingProgress(updatedItems);
    setProgress({ total, verified, percentage });
  }, []);

  const markPending = useCallback((itemId: string, qty: number) => {
    pendingRef.current[itemId] = { qty, expiresAt: Date.now() + PENDING_TTL_MS };
  }, []);

  const clearPending = useCallback((itemId: string) => {
    delete pendingRef.current[itemId];
  }, []);

  const applyOptimisticIncrement = useCallback((itemId: string) => {
    setItems(prev => {
      const updated = prev.map(item => {
        if (item.id !== itemId) return item;
        const next = (item.quantity_packed || 0) + 1;
        markPending(itemId, next);
        return { ...item, quantity_packed: next };
      });
      recalcProgress(updated);
      return updated;
    });
    scanLog('quantity_updated', { itemId, direction: '+1' });
  }, [recalcProgress, markPending]);

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
    // Authoritative value — drop any pending optimistic flag
    clearPending(itemId);
    scanLog('quantity_set', { itemId, quantity });
  }, [recalcProgress, clearPending]);

  const applyOptimisticDecrement = useCallback((itemId: string) => {
    setItems(prev => {
      const updated = prev.map(item => {
        if (item.id !== itemId) return item;
        const next = Math.max(0, (item.quantity_packed || 0) - 1);
        markPending(itemId, next);
        return { ...item, quantity_packed: next };
      });
      recalcProgress(updated);
      return updated;
    });
    scanLog('quantity_updated', { itemId, direction: '-1' });
  }, [recalcProgress, markPending]);

  const mergeServerData = useCallback((serverItems: PackingItem[]) => {
    // Sort according to saved order
    const stableSorted = [...serverItems].sort(
      (a, b) => (itemOrderRef.current[a.id] ?? 9999) - (itemOrderRef.current[b.id] ?? 9999)
    );

    const now = Date.now();
    let drifts = 0;

    setItems(prev => {
      const prevMap = new Map(prev.map(i => [i.id, i]));
      const merged = stableSorted.map(serverItem => {
        const localItem = prevMap.get(serverItem.id);
        const pending = pendingRef.current[serverItem.id];
        const pendingActive = pending && pending.expiresAt > now;

        if (localItem && pendingActive && localItem.quantity_packed > serverItem.quantity_packed) {
          // In-flight optimistic write — keep local value briefly, server hasn't caught up yet.
          return { ...serverItem, quantity_packed: localItem.quantity_packed };
        }

        // Pending expired or never existed → server wins, even if it's lower.
        if (localItem && localItem.quantity_packed !== serverItem.quantity_packed) {
          drifts++;
          scanLog('reconcile_drift', {
            itemId: serverItem.id,
            local: localItem.quantity_packed,
            server: serverItem.quantity_packed,
            hadPending: !!pending,
            pendingExpired: !!pending && !pendingActive,
          });
        }

        // Reconciled — drop any stale pending marker
        if (pending && !pendingActive) delete pendingRef.current[serverItem.id];

        return serverItem;
      });

      recalcProgress(merged);
      return merged;
    });

    scanLog('sync_response', { itemCount: serverItems.length, drifts });
  }, [recalcProgress]);

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
        // Foreground reload — server is authoritative, clear all pending flags.
        pendingRef.current = {};
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

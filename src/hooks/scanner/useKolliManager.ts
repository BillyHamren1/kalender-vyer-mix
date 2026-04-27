import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  createParcel,
  assignItemToParcel,
  getItemParcels,
  getItemAllocations,
  type ItemAllocation,
} from '@/services/scannerService';
import { PackingParcel } from '@/types/packing';

/**
 * Parcel ("kolli") manager.
 *
 * NEW MODEL: A single packing item can be split across multiple parcels through
 * `packing_list_item_allocations`. The legacy `parcel_id` column on
 * `packing_list_items` is kept in sync (most-recent parcel) for back-compat,
 * but `itemAllocations` is the source of truth for split breakdowns.
 *
 * - `itemParcelMap` (legacy):  itemId -> single parcel number (highest)
 * - `itemAllocations` (new):   itemId -> [{ parcelId, parcelNumber, quantity }]
 */
export const useKolliManager = (packingId: string) => {
  const [isKolliMode, setIsKolliMode] = useState(false);
  const [activeParcel, setActiveParcel] = useState<PackingParcel | null>(null);
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});
  const [itemAllocations, setItemAllocations] = useState<Record<string, ItemAllocation[]>>({});

  const loadParcels = useCallback(async () => {
    try {
      const [parcels, allocs] = await Promise.all([
        getItemParcels(packingId),
        getItemAllocations(packingId),
      ]);
      setItemParcelMap(parcels);
      setItemAllocations(allocs);
    } catch { /* silent */ }
  }, [packingId]);

  const startKolli = useCallback(async (verifierName: string) => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      setIsKolliMode(true);
      toast.success(`Parcel #${parcel.parcel_number} started`);
    } catch (err) {
      console.error('Error creating parcel:', err);
      toast.error('Could not create parcel');
    }
  }, [packingId]);

  const nextKolli = useCallback(async (verifierName: string) => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      toast.success(`Parcel #${parcel.parcel_number} started`);
      await loadParcels();
    } catch (err) {
      console.error('Error creating next parcel:', err);
      toast.error('Could not create next parcel');
    }
  }, [packingId, loadParcels]);

  const exitKolli = useCallback(() => {
    setIsKolliMode(false);
    setActiveParcel(null);
    toast.info('Parcel mode ended');
  }, []);

  /**
   * Manually allocate `quantity` units of an item to the active parcel.
   * Server caps so total allocations never exceed quantity_to_pack.
   */
  const assignToKolli = useCallback(async (itemId: string, quantity: number = 1, scannedBy?: string) => {
    if (!activeParcel) return;
    await assignItemToParcel(itemId, activeParcel.id, { quantity, scannedBy });

    // Optimistic local update
    setItemAllocations(prev => {
      const list = [...(prev[itemId] || [])];
      const existing = list.find(a => a.parcelId === activeParcel.id);
      if (existing) existing.quantity += quantity;
      else list.push({ parcelId: activeParcel.id, parcelNumber: activeParcel.parcel_number, quantity });
      return { ...prev, [itemId]: list };
    });
    setItemParcelMap(prev => ({
      ...prev,
      [itemId]: Math.max(prev[itemId] || 0, activeParcel.parcel_number),
    }));
  }, [activeParcel]);

  const setParcelMap = useCallback((map: Record<string, number>) => {
    setItemParcelMap(map);
  }, []);

  return {
    isKolliMode,
    activeParcel,
    itemParcelMap,
    itemAllocations,
    startKolli,
    nextKolli,
    exitKolli,
    assignToKolli,
    loadParcels,
    setParcelMap,
  };
};

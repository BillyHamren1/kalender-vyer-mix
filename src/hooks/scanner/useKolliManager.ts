import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { createParcel, assignItemToParcel, getItemParcels } from '@/services/scannerService';
import { PackingParcel } from '@/types/packing';

export const useKolliManager = (packingId: string) => {
  const [isKolliMode, setIsKolliMode] = useState(false);
  const [activeParcel, setActiveParcel] = useState<PackingParcel | null>(null);
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});

  const loadParcels = useCallback(async () => {
    try {
      const parcels = await getItemParcels(packingId);
      setItemParcelMap(parcels);
    } catch { /* silent */ }
  }, [packingId]);

  const startKolli = useCallback(async (verifierName: string) => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      setIsKolliMode(true);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
    } catch (err) {
      console.error('Error creating parcel:', err);
      toast.error('Kunde inte skapa kolli');
    }
  }, [packingId]);

  const nextKolli = useCallback(async (verifierName: string) => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
      const parcelsData = await getItemParcels(packingId);
      setItemParcelMap(parcelsData);
    } catch (err) {
      console.error('Error creating next parcel:', err);
      toast.error('Kunde inte skapa nästa kolli');
    }
  }, [packingId]);

  const exitKolli = useCallback(() => {
    setIsKolliMode(false);
    setActiveParcel(null);
    toast.info('Kolli-läge avslutat');
  }, []);

  const assignToKolli = useCallback(async (itemId: string) => {
    if (!activeParcel) return;
    await assignItemToParcel(itemId, activeParcel.id);
    setItemParcelMap(prev => ({ ...prev, [itemId]: activeParcel.parcel_number }));
  }, [activeParcel]);

  const setParcelMap = useCallback((map: Record<string, number>) => {
    setItemParcelMap(map);
  }, []);

  return {
    isKolliMode,
    activeParcel,
    itemParcelMap,
    startKolli,
    nextKolli,
    exitKolli,
    assignToKolli,
    loadParcels,
    setParcelMap,
  };
};

import { useCallback, useRef, useEffect } from 'react';
import { getItemParcels } from '@/services/scannerService';
import { scanLog } from './scanLog';

interface UsePackingSyncOptions {
  packingId: string;
  loadData: (isBackground: boolean) => Promise<void>;
  onParcelsLoaded?: (parcels: Record<string, number>) => void;
}

export const usePackingSync = ({ packingId, loadData, onParcelsLoaded }: UsePackingSyncOptions) => {
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const triggerSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    scanLog('sync_triggered');
    syncTimerRef.current = setTimeout(async () => {
      await loadData(true);
      if (onParcelsLoaded) {
        try {
          const parcels = await getItemParcels(packingId);
          onParcelsLoaded(parcels);
        } catch { /* silent */ }
      }
    }, 2000);
  }, [loadData, packingId, onParcelsLoaded]);

  return { triggerSync };
};

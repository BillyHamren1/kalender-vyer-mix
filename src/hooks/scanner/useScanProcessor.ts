import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  verifyProductBySku,
  parseScanResult,
  decrementPackingItem,
  togglePackingItemManually,
} from '@/services/scannerService';
import { PackingItem } from './useOptimisticPacking';
import { ScanResult } from './useScanFeedback';
import { scanLog } from './scanLog';

interface UseScanProcessorOptions {
  packingId: string;
  verifierName: string;
  getItems: () => PackingItem[];
  getIsMinusMode: () => boolean;
  onScanResult: (result: ScanResult) => void;
  onHighlight: (itemId: string) => void;
  onOptimisticIncrement: (itemId: string) => void;
  onOptimisticDecrement: (itemId: string) => void;
  onAssignToKolli: (itemId: string) => Promise<void>;
  onTriggerSync: () => void;
}

export const useScanProcessor = ({
  packingId,
  verifierName,
  getItems,
  getIsMinusMode,
  onScanResult,
  onHighlight,
  onOptimisticIncrement,
  onOptimisticDecrement,
  onAssignToKolli,
  onTriggerSync,
}: UseScanProcessorOptions) => {
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  const processNext = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;
    isProcessingRef.current = true;

    const scannedValue = queueRef.current.shift()!;
    scanLog('scan_received', { value: scannedValue });

    try {
      const scanResult = parseScanResult(scannedValue);
      if (scanResult.type === 'packing_id') {
        // Silently ignore packing_id scans
        return;
      }

      if (getIsMinusMode()) {
        await processMinusScan(scannedValue);
      } else {
        await processNormalScan(scannedValue);
      }
    } catch (err: any) {
      onScanResult({
        value: scannedValue,
        result: err.message || 'Okänt fel vid scanning',
        success: false,
      });
    } finally {
      isProcessingRef.current = false;
      // Process next in queue
      if (queueRef.current.length > 0) {
        processNext();
      }
    }
  }, [packingId, verifierName]);

  const processMinusScan = async (scannedValue: string) => {
    const items = getItems();
    const matchingItem = items.find(
      item => item.booking_products?.sku?.toLowerCase() === scannedValue.toLowerCase() && (item.quantity_packed || 0) > 0
    );

    if (!matchingItem) {
      onScanResult({
        value: scannedValue,
        result: 'Ingen packad artikel hittades med denna SKU',
        success: false,
      });
      toast.error('Ingen packad artikel att ta bort');
      return;
    }

    try {
      await decrementPackingItem(matchingItem.id, verifierName);
      const productName = matchingItem.booking_products?.name || scannedValue;
      scanLog('item_matched', { itemId: matchingItem.id, productName, mode: 'minus' });

      onScanResult({
        value: scannedValue,
        result: `➖ Borttagen: ${productName}`,
        success: true,
        productName,
        isMinusScan: true,
      });

      onHighlight(matchingItem.id);
      onOptimisticDecrement(matchingItem.id);
      onTriggerSync();
    } catch (err: any) {
      onScanResult({
        value: scannedValue,
        result: err.message || 'Kunde inte ta bort artikel',
        success: false,
      });
      toast.error(err.message || 'Kunde inte ta bort artikel');
    }
  };

  const processNormalScan = async (scannedValue: string) => {
    const result = await verifyProductBySku(packingId, scannedValue, verifierName);

    onScanResult({
      value: scannedValue,
      result: result.success
        ? (result.overscan ? `⚠️ FÖR MÅNGA: ${result.productName}` : `✅ ${result.productName}`)
        : result.error || 'Okänt fel',
      success: result.success && !result.overscan,
      productName: result.productName || undefined,
    });

    if (result.success) {
      if (result.itemId) {
        scanLog('item_matched', { itemId: result.itemId, productName: result.productName, mode: 'normal' });
        onHighlight(result.itemId);
        onOptimisticIncrement(result.itemId);
        await onAssignToKolli(result.itemId);
      } else {
        // Fallback: find by SKU for older API responses
        const items = getItems();
        const fallback = items.find(i => i.booking_products?.sku?.toLowerCase() === scannedValue.toLowerCase());
        if (fallback) {
          onOptimisticIncrement(fallback.id);
        }
      }
      onTriggerSync();
    } else {
      toast.error(result.error);
    }
  };

  const enqueueScan = useCallback((value: string) => {
    queueRef.current.push(value);
    scanLog('scan_enqueued', { value, queueLength: queueRef.current.length });
    processNext();
  }, [processNext]);

  // Manual toggle (checkbox click) — not queued, but uses same lock pattern
  const handleManualToggle = useCallback(async (
    itemId: string,
    isCurrentlyPacked: boolean,
    quantityToPack: number,
    isParent: boolean,
  ) => {
    if (isParent) {
      toast.info('Huvudprodukter markeras automatiskt när alla delar är packade');
      return;
    }

    const items = getItems();

    if (getIsMinusMode()) {
      const item = items.find(i => i.id === itemId);
      if (!item || (item.quantity_packed || 0) <= 0) {
        toast.error('Inget att ta bort');
        return;
      }
      try {
        await decrementPackingItem(itemId, verifierName);
        onOptimisticDecrement(itemId);
        onTriggerSync();
      } catch (err: any) {
        toast.error(err.message || 'Kunde inte ta bort');
      }
      return;
    }

    const result = await togglePackingItemManually(itemId, isCurrentlyPacked, quantityToPack, verifierName);
    if (result.success) {
      if (isCurrentlyPacked) {
        // Unpacking — set to 0 handled by setItems directly
        // We'll use a custom approach for full unpack
      } else {
        onOptimisticIncrement(itemId);
      }
      
      if (!isCurrentlyPacked) {
        await onAssignToKolli(itemId);
      }
      onTriggerSync();
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
    }
  }, [verifierName, packingId]);

  return {
    enqueueScan,
    handleManualToggle,
  };
};

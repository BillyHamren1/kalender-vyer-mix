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

export const useScanProcessor = (options: UseScanProcessorOptions) => {
  // Keep all options in a ref so the queue processor always reads fresh values
  const optRef = useRef(options);
  optRef.current = options;

  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  const processNext = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;
    isProcessingRef.current = true;

    const scannedValue = queueRef.current.shift()!;
    scanLog('scan_received', { value: scannedValue });

    const {
      packingId, verifierName, getItems, getIsMinusMode,
      onScanResult, onHighlight, onOptimisticIncrement,
      onOptimisticDecrement, onAssignToKolli, onTriggerSync,
    } = optRef.current;

    try {
      const scanResult = parseScanResult(scannedValue);
      if (scanResult.type === 'packing_id') {
        scanLog('scan_ignored_packing_id', { value: scannedValue });
        return;
      }

      if (getIsMinusMode()) {
        // === MINUS MODE ===
        const items = getItems();
        const matchingItem = items.find(
          item => item.booking_products?.sku?.toLowerCase() === scannedValue.toLowerCase() && (item.quantity_packed || 0) > 0
        );

        if (!matchingItem) {
          onScanResult({ value: scannedValue, result: 'Ingen packad artikel hittades med denna SKU', success: false });
          toast.error('Ingen packad artikel att ta bort');
          return;
        }

        await decrementPackingItem(matchingItem.id, verifierName);
        const productName = matchingItem.booking_products?.name || scannedValue;
        scanLog('item_matched', { itemId: matchingItem.id, productName, mode: 'minus' });
        onScanResult({ value: scannedValue, result: `➖ Borttagen: ${productName}`, success: true, productName, isMinusScan: true });
        onHighlight(matchingItem.id);
        onOptimisticDecrement(matchingItem.id);
        onTriggerSync();
      } else {
        // === NORMAL MODE ===
        scanLog('verify_start', { packingId, sku: scannedValue });
        const result = await verifyProductBySku(packingId, scannedValue, verifierName);
        scanLog('verify_result', result);

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
            const items = getItems();
            const fallback = items.find(i => i.booking_products?.sku?.toLowerCase() === scannedValue.toLowerCase());
            if (fallback) onOptimisticIncrement(fallback.id);
          }
          onTriggerSync();
        } else {
          toast.error(result.error);
        }
      }
    } catch (err: any) {
      console.error('[SCAN] processNext error:', err);
      scanLog('process_error', { value: scannedValue, error: err.message });
      onScanResult({
        value: scannedValue,
        result: err.message || 'Okänt fel vid scanning',
        success: false,
      });
    } finally {
      isProcessingRef.current = false;
      if (queueRef.current.length > 0) {
        processNext();
      }
    }
  }, []); // No deps — reads everything from optRef

  const enqueueScan = useCallback((value: string) => {
    if (!value || !value.trim()) {
      scanLog('scan_ignored_empty');
      return;
    }
    queueRef.current.push(value.trim());
    scanLog('scan_enqueued', { value, queueLength: queueRef.current.length });
    processNext();
  }, [processNext]);

  const handleManualToggle = useCallback(async (
    itemId: string,
    isCurrentlyPacked: boolean,
    quantityToPack: number,
    isParent: boolean,
  ) => {
    const { getItems, getIsMinusMode, verifierName, onOptimisticIncrement, onOptimisticDecrement, onAssignToKolli, onTriggerSync } = optRef.current;

    if (isParent) {
      toast.info('Huvudprodukter markeras automatiskt när alla delar är packade');
      return;
    }

    if (getIsMinusMode()) {
      const items = getItems();
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
      if (!isCurrentlyPacked) {
        onOptimisticIncrement(itemId);
        await onAssignToKolli(itemId);
      }
      onTriggerSync();
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
    }
  }, []); // No deps — reads from optRef

  return { enqueueScan, handleManualToggle };
};

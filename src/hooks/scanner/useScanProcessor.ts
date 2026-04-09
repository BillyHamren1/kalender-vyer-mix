import { useCallback, useRef, useState } from 'react';
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

export interface RecentScanEntry {
  value: string;
  productName: string;
  success: boolean;
  timestamp: number;
}

interface UseScanProcessorOptions {
  packingId: string;
  verifierName: string;
  getItems: () => PackingItem[];
  getIsMinusMode: () => boolean;
  getIsKolliMode: () => boolean;
  onScanResult: (result: ScanResult) => void;
  onHighlight: (itemId: string) => void;
  onOptimisticIncrement: (itemId: string) => void;
  onOptimisticDecrement: (itemId: string) => void;
  onAssignToKolli: (itemId: string) => Promise<void>;
  onTriggerSync: () => void;
  onRfidTagResult?: (epc: string, matched: boolean, productName?: string, sku?: string) => void;
}

export const useScanProcessor = (options: UseScanProcessorOptions) => {
  // Keep all options in a ref so the queue processor always reads fresh values
  const optRef = useRef(options);
  optRef.current = options;

  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const scannedThisSessionRef = useRef<Set<string>>(new Set());
  const [recentScans, setRecentScans] = useState<RecentScanEntry[]>([]);

  const addRecentScan = useCallback((entry: RecentScanEntry) => {
    setRecentScans(prev => [entry, ...prev].slice(0, 100));
  }, []);

  const processNext = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;
    isProcessingRef.current = true;

    const scannedValue = queueRef.current.shift()!;

    // Session dedup: silently ignore repeated scans of the same value
    const normalised = scannedValue.toLowerCase();
    if (scannedThisSessionRef.current.has(normalised)) {
      scanLog('scan_ignored_duplicate_session', { value: scannedValue });
      isProcessingRef.current = false;
      if (queueRef.current.length > 0) processNext();
      return;
    }
    scannedThisSessionRef.current.add(normalised);

    scanLog('scan_received', { value: scannedValue });

    const {
      packingId, verifierName, getItems, getIsMinusMode, getIsKolliMode,
      onScanResult, onHighlight, onOptimisticIncrement,
      onOptimisticDecrement, onAssignToKolli, onTriggerSync,
    } = optRef.current;

    const notifyRfid = (value: string, matched: boolean, productName?: string, sku?: string) => {
      const isRfid = value.length >= 20 && /^[0-9a-fA-F]+$/.test(value);
      if (isRfid && optRef.current.onRfidTagResult) {
        optRef.current.onRfidTagResult(value, matched, productName, sku);
      }
    };

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
        addRecentScan({ value: scannedValue, productName, success: true, timestamp: Date.now() });
        notifyRfid(scannedValue, true, productName, matchingItem.booking_products?.sku || undefined);
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
          // Increment UI optimistically for both normal and overscan cases
          // (backend has already incremented quantity_packed)
          if (result.itemId) {
            scanLog('item_matched', { itemId: result.itemId, productName: result.productName, mode: 'normal', overscan: !!result.overscan });
            onHighlight(result.itemId);
            onOptimisticIncrement(result.itemId);
            if (getIsKolliMode()) {
              await onAssignToKolli(result.itemId);
            }
          } else {
            const items = getItems();
            const fallback = items.find(i => i.booking_products?.sku?.toLowerCase() === scannedValue.toLowerCase());
            if (fallback) onOptimisticIncrement(fallback.id);
          }
          onTriggerSync();
          addRecentScan({ value: scannedValue, productName: result.productName || scannedValue, success: true, timestamp: Date.now() });
          notifyRfid(scannedValue, true, result.productName || undefined, scannedValue);
        } else {
          if ((result as any).alreadyScanned) {
            // No toast — just show in feedback header
            onScanResult({
              value: scannedValue,
              result: result.error || `Nr ${scannedValue} är redan scannad`,
              success: false,
            });
          } else {
            toast.error(result.error);
          }
          notifyRfid(scannedValue, false, undefined, undefined);
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
    // Split on newlines in case RFID/scanner sends multiple values at once
    const values = value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    for (const v of values) {
      queueRef.current.push(v);
      scanLog('scan_enqueued', { value: v, queueLength: queueRef.current.length });
    }
    processNext();
  }, [processNext]);

  const handleManualToggle = useCallback(async (
    itemId: string,
    isCurrentlyPacked: boolean,
    quantityToPack: number,
    isParent: boolean,
  ) => {
    const { getItems, getIsMinusMode, getIsKolliMode, verifierName, onOptimisticIncrement, onOptimisticDecrement, onAssignToKolli, onTriggerSync } = optRef.current;

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
        if (getIsKolliMode()) {
          await onAssignToKolli(itemId);
        }
      }
      onTriggerSync();
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
    }
  }, []); // No deps — reads from optRef

  const clearSessionDedup = useCallback(() => {
    scannedThisSessionRef.current.clear();
    scanLog('session_dedup_cleared');
  }, []);

  return { enqueueScan, handleManualToggle, recentScans, clearSessionDedup };
};

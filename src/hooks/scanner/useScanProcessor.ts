import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  verifyProductBySku,
  parseScanResult,
  decrementPackingItem,
  togglePackingItemManually,
  addUnknownProduct,
} from '@/services/scannerService';
import { PackingItem } from './useOptimisticPacking';
import { ScanResult } from './useScanFeedback';
import { scanLog } from './scanLog';

export interface RecentScanEntry {
  value: string;
  productName: string;
  success: boolean;
  timestamp: number;
  /** Why this scan was ignored (if not successful) */
  reason?: 'duplicate' | 'packing_id' | 'error' | 'not_found' | 'overscan' | 'unknown_product';
}

export interface PendingUnknownProductState {
  scannedValue: string;
  scannedSku: string | null;
  scannedName: string | null;
}

interface UseScanProcessorOptions {
  packingId: string;
  verifierName: string;
  getItems: () => PackingItem[];
  getIsMinusMode: () => boolean;
  getIsKolliMode: () => boolean;
  /** Returns the currently active parcel id (or null) so allocations can be logged inside the API call. */
  getActiveParcelId?: () => string | null;
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

  // When a scan returns an unknown product, we PAUSE the queue and surface a
  // pending state to the UI. The processor will not advance until the user
  // confirms (confirmAddUnknown) or dismisses (dismissUnknown).
  const [pendingUnknownProduct, setPendingUnknownProduct] = useState<PendingUnknownProductState | null>(null);
  const isPausedRef = useRef(false);

  const addRecentScan = useCallback((entry: RecentScanEntry) => {
    setRecentScans(prev => [entry, ...prev].slice(0, 100));
  }, []);

  const processNext = useCallback(async () => {
    if (isProcessingRef.current || isPausedRef.current || queueRef.current.length === 0) return;
    isProcessingRef.current = true;

    const rawValue = queueRef.current.shift()!;
    // Normalize: trim whitespace/control chars that hardware scanners may append
    const scannedValue = rawValue.trim();

    if (!scannedValue) {
      scanLog('scan_ignored_empty_after_trim', { rawValue });
      isProcessingRef.current = false;
      if (queueRef.current.length > 0) processNext();
      return;
    }

    // Classify FIRST so dedup applies only to unique codes (RFID / serials).
    // Repeatable codes (SKU, article barcodes) may be scanned many times.
    const parsed = parseScanResult(scannedValue);
    const normalised = scannedValue.trim().toLowerCase();

    if (parsed.unique && scannedThisSessionRef.current.has(normalised)) {
      scanLog('scan_ignored_duplicate_session', { value: scannedValue, type: parsed.type });
      optRef.current.onScanResult({
        value: scannedValue,
        result: `Already scanned this session`,
        success: false,
      });
      addRecentScan({
        value: scannedValue,
        productName: scannedValue,
        success: false,
        timestamp: Date.now(),
        reason: 'duplicate',
      });
      isProcessingRef.current = false;
      if (queueRef.current.length > 0) processNext();
      return;
    }
    if (parsed.unique) {
      scannedThisSessionRef.current.add(normalised);
    }

    scanLog('scan_received', { value: scannedValue, type: parsed.type, unique: parsed.unique });

    const {
      packingId, verifierName, getItems, getIsMinusMode, getIsKolliMode,
      onScanResult, onHighlight, onOptimisticIncrement,
      onOptimisticDecrement, onAssignToKolli, onTriggerSync,
    } = optRef.current;

    const notifyRfid = (value: string, matched: boolean, productName?: string, sku?: string) => {
      if (parsed.type === 'rfid_tag' && optRef.current.onRfidTagResult) {
        optRef.current.onRfidTagResult(value, matched, productName, sku);
      }
    };

    try {
      if (parsed.type === 'packing_id') {
        scanLog('scan_ignored_packing_id', { value: scannedValue, packingId: parsed.packingId });
        onScanResult({
          value: scannedValue,
          result: 'Packing ID scanned — not a product code',
          success: false,
        });
        addRecentScan({
          value: scannedValue,
          productName: `Packing ID: ${parsed.packingId?.slice(0, 8) || scannedValue}`,
          success: false,
          timestamp: Date.now(),
          reason: 'packing_id',
        });
        return;
      }

      if (getIsMinusMode()) {
        // === MINUS MODE ===
        const items = getItems();
        const matchingItem = items.find(
          item => item.booking_products?.sku?.trim().toLowerCase() === normalised && (item.quantity_packed || 0) > 0
        );

        if (!matchingItem) {
          onScanResult({ value: scannedValue, result: 'No packed item found with this SKU', success: false });
          toast.error('No packed item to remove');
          return;
        }

        await decrementPackingItem(matchingItem.id, verifierName);
        const productName = matchingItem.booking_products?.name || scannedValue;
        scanLog('item_matched', { itemId: matchingItem.id, productName, mode: 'minus' });
        onScanResult({ value: scannedValue, result: `➖ Removed: ${productName}`, success: true, productName, isMinusScan: true });
        onHighlight(matchingItem.id);
        onOptimisticDecrement(matchingItem.id);
        onTriggerSync();
        addRecentScan({ value: scannedValue, productName, success: true, timestamp: Date.now() });
        notifyRfid(scannedValue, true, productName, matchingItem.booking_products?.sku || undefined);
      } else {
        // === NORMAL MODE ===
        scanLog('verify_start', { packingId, sku: scannedValue });
        const activeParcelId = optRef.current.getActiveParcelId?.() ?? null;
        const result = await verifyProductBySku(packingId, scannedValue, verifierName, activeParcelId);
        scanLog('verify_result', result);

        // === Special branch: product not in packing list — pause + prompt user ===
        if (!result.success && result.notInPackingList) {
          scanLog('unknown_product_prompt', {
            value: scannedValue,
            scannedSku: result.scannedSku,
            scannedName: result.scannedName,
          });
          isPausedRef.current = true;
          setPendingUnknownProduct({
            scannedValue,
            scannedSku: result.scannedSku ?? null,
            scannedName: result.scannedName ?? null,
          });
          onScanResult({
            value: scannedValue,
            result: `Okänd produkt – väntar på bekräftelse`,
            success: false,
          });
          // Allow user to re-scan same code after responding
          scannedThisSessionRef.current.delete(normalised);
          notifyRfid(scannedValue, false, undefined, undefined);
          return;
        }

        onScanResult({
          value: scannedValue,
          result: result.success
            ? (result.overscan ? `⚠️ FÖR MÅNGA: ${result.productName}` : `✅ ${result.productName}`)
            : result.error || 'Unknown error',
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
            const fallback = items.find(i => i.booking_products?.sku?.trim().toLowerCase() === normalised);
            if (fallback) onOptimisticIncrement(fallback.id);
          }
          onTriggerSync();
          addRecentScan({
            value: scannedValue,
            productName: result.productName || scannedValue,
            success: true,
            timestamp: Date.now(),
            reason: result.overscan ? 'overscan' : undefined,
          });
          notifyRfid(scannedValue, true, result.productName || undefined, scannedValue);
        } else {
          if ((result as any).alreadyScanned) {
            // No toast — just show in feedback header
            onScanResult({
              value: scannedValue,
              result: result.error || `#${scannedValue} already scanned`,
              success: false,
            });
          } else {
            toast.error(result.error);
          }
          addRecentScan({
            value: scannedValue,
            productName: scannedValue,
            success: false,
            timestamp: Date.now(),
            reason: 'not_found',
          });
          notifyRfid(scannedValue, false, undefined, undefined);
        }
      }
    } catch (err: any) {
      console.error('[SCAN] processNext error:', err);
      scanLog('process_error', { value: scannedValue, error: err.message });
      onScanResult({
        value: scannedValue,
        result: err.message || 'Unknown scan error',
        success: false,
      });
      addRecentScan({
        value: scannedValue,
        productName: scannedValue,
        success: false,
        timestamp: Date.now(),
        reason: 'error',
      });
    } finally {
      isProcessingRef.current = false;
      if (!isPausedRef.current && queueRef.current.length > 0) {
        processNext();
      }
    }
  }, [addRecentScan]); // No deps that change — reads everything from optRef

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
      toast.info('Parent products are marked automatically when all parts are packed');
      return;
    }

    if (getIsMinusMode()) {
      const items = getItems();
      const item = items.find(i => i.id === itemId);
      if (!item || (item.quantity_packed || 0) <= 0) {
        toast.error('Nothing to remove');
        return;
      }
      try {
        await decrementPackingItem(itemId, verifierName);
        onOptimisticDecrement(itemId);
        onTriggerSync();
      } catch (err: any) {
        toast.error(err.message || 'Could not remove');
      }
      return;
    }

    const activeParcelId = optRef.current.getActiveParcelId?.() ?? null;
    const result = await togglePackingItemManually(itemId, isCurrentlyPacked, quantityToPack, verifierName, activeParcelId);
    if (result.success) {
      if (!isCurrentlyPacked) {
        onOptimisticIncrement(itemId);
        if (getIsKolliMode()) {
          await onAssignToKolli(itemId);
        }
      }
      onTriggerSync();
    } else {
      toast.error(result.error || 'Could not update');
    }
  }, []); // No deps — reads from optRef

  const clearSessionDedup = useCallback(() => {
    scannedThisSessionRef.current.clear();
    scanLog('session_dedup_cleared');
  }, []);

  // === Unknown-product handlers ===
  const confirmAddUnknown = useCallback(async (productName: string, quantity: number): Promise<boolean> => {
    if (!pendingUnknownProduct) return false;
    const { packingId, verifierName, onHighlight, onTriggerSync } = optRef.current;
    try {
      const result = await addUnknownProduct(
        packingId,
        pendingUnknownProduct.scannedSku || pendingUnknownProduct.scannedValue,
        productName,
        quantity,
        verifierName,
      );
      if (!result.success) {
        toast.error(result.error || 'Kunde inte lägga till produkten');
        return false;
      }
      toast.success(`Lade till ${productName} (1/${quantity})`);
      addRecentScan({
        value: pendingUnknownProduct.scannedValue,
        productName: result.productName || productName,
        success: true,
        timestamp: Date.now(),
        reason: 'unknown_product',
      });
      if (result.itemId) onHighlight(result.itemId);
      onTriggerSync();
      setPendingUnknownProduct(null);
      isPausedRef.current = false;
      // Resume queue
      if (queueRef.current.length > 0) processNext();
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte lägga till produkten');
      return false;
    }
  }, [pendingUnknownProduct, addRecentScan, processNext]);

  const dismissUnknown = useCallback(() => {
    if (pendingUnknownProduct) {
      addRecentScan({
        value: pendingUnknownProduct.scannedValue,
        productName: pendingUnknownProduct.scannedName || pendingUnknownProduct.scannedValue,
        success: false,
        timestamp: Date.now(),
        reason: 'unknown_product',
      });
    }
    setPendingUnknownProduct(null);
    isPausedRef.current = false;
    if (queueRef.current.length > 0) processNext();
  }, [pendingUnknownProduct, addRecentScan, processNext]);

  return {
    enqueueScan,
    handleManualToggle,
    recentScans,
    clearSessionDedup,
    pendingUnknownProduct,
    confirmAddUnknown,
    dismissUnknown,
  };
};

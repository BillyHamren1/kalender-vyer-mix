import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  verifyProductBySku,
  parseScanResult,
  decrementPackingItem,
  decrementBySerial,
  togglePackingItemManually,
  addUnknownProduct,
} from '@/services/scannerService';
import { PackingItem } from './useOptimisticPacking';
import { ScanResult } from './useScanFeedback';
import { scanLog } from './scanLog';
import { recordReceived, recordApiStart, recordApiEnd, ScanStatus } from './scanTimeline';

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
  // WMS identity preserved so a WMS-known product that's missing from the
  // packing list keeps its inventory linkage when added locally.
  wmsItemTypeId?: string | null;
  wmsSku?: string | null;
  wmsInstanceId?: string | null;
  wmsSerialNumber?: string | null;
}

interface UseScanProcessorOptions {
  packingId: string;
  verifierName: string;
  verifierStaffId?: string | null;
  getItems: () => PackingItem[];
  getIsMinusMode: () => boolean;
  getIsKolliMode: () => boolean;
  /** Returns the currently active parcel id (or null) so allocations can be logged inside the API call. */
  getActiveParcelId?: () => string | null;
  /** Returns the active packing session id — required for all mutating scanner-api calls. */
  getActiveSessionId: () => string | null;
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
  // Removed: scannedThisSessionRef. Lagersystemet (WMS) is the single source of
  // truth for duplicate / minus / overscan detection. No local cache.
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

    // Mark "received by processor" timestamp for instrumentation.
    recordReceived(scannedValue);

    // No local session dedup — WMS (lagersystemet) is the single source of truth
    // for whether a code has already been scanned. This avoids blocking legitimate
    // minus scans / re-scans on the client.
    const parsed = parseScanResult(scannedValue);
    const normalised = scannedValue.trim().toLowerCase();

    scanLog('scan_received', { value: scannedValue, type: parsed.type, unique: parsed.unique });

    const {
      packingId, verifierName, verifierStaffId, getItems, getIsMinusMode, getIsKolliMode,
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

        // For unique codes (RFID / serials) we don't know the SKU locally.
        // Ask the backend to look it up via the WMS, then decrement.
        if (parsed.unique) {
          recordApiStart(scannedValue);
          const result = await decrementBySerial(packingId, scannedValue, optRef.current.getActiveSessionId());
          recordApiEnd(scannedValue, result.success ? 'success' : 'failed', result.productName);
          if (!result.success || !result.itemId) {
            scanLog('minus_serial_failed', { value: scannedValue, error: result.error });
            onScanResult({ value: scannedValue, result: result.error || 'Kunde inte ta bort koden', success: false });
            toast.error(result.error || 'Kunde inte ta bort koden');
            // Allow user to retry / re-scan
            addRecentScan({ value: scannedValue, productName: scannedValue, success: false, timestamp: Date.now(), reason: 'error' });
            return;
          }
          const matchingItem = items.find(i => i.id === result.itemId);
          const productName = result.productName || matchingItem?.booking_products?.name || scannedValue;
          scanLog('item_matched', { itemId: result.itemId, productName, mode: 'minus_serial' });
          onScanResult({ value: scannedValue, result: `➖ Removed: ${productName}`, success: true, productName, isMinusScan: true });
          onHighlight(result.itemId);
          onOptimisticDecrement(result.itemId);
          onTriggerSync();
          addRecentScan({ value: scannedValue, productName, success: true, timestamp: Date.now() });
          notifyRfid(scannedValue, true, productName, matchingItem?.booking_products?.sku || undefined);
          return;
        }

        // SKU / repeatable code — local match path
        const matchingItem = items.find(
          item => item.booking_products?.sku?.trim().toLowerCase() === normalised && (item.quantity_packed || 0) > 0
        );

        if (!matchingItem) {
          onScanResult({ value: scannedValue, result: 'No packed item found with this SKU', success: false });
          toast.error('No packed item to remove');
          return;
        }

        recordApiStart(scannedValue);
        await decrementPackingItem(matchingItem.id, verifierName, optRef.current.getActiveSessionId());
        recordApiEnd(scannedValue, 'success', matchingItem.booking_products?.name);
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
        recordApiStart(scannedValue);
        const result = await verifyProductBySku(packingId, scannedValue, verifierName, activeParcelId, verifierStaffId, optRef.current.getActiveSessionId());
        const apiStatus: ScanStatus = result.success
          ? ((result as any).alreadyScanned ? 'duplicate' : (result.overscan ? 'overscan' : 'success'))
          : (result.notInPackingList ? 'unknown_product' : 'failed');
        recordApiEnd(scannedValue, apiStatus, result.productName);
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
            wmsItemTypeId: (result as any).wmsItemTypeId ?? null,
            wmsSku: (result as any).wmsSku ?? null,
            wmsInstanceId: (result as any).wmsInstanceId ?? null,
            wmsSerialNumber: (result as any).wmsSerialNumber ?? null,
          });
          onScanResult({
            value: scannedValue,
            result: `Okänd produkt – väntar på bekräftelse`,
            success: false,
          });
          // Allow user to re-scan same code after responding
          notifyRfid(scannedValue, false, undefined, undefined);
          return;
        }

        const alreadyScanned = !!(result as any).alreadyScanned;

        onScanResult({
          value: scannedValue,
          result: result.success
            ? (alreadyScanned
                ? `↩️ Redan scannad: ${result.productName || scannedValue}`
                : (result.overscan ? `⚠️ FÖR MÅNGA: ${result.productName}` : `✅ ${result.productName}`))
            : result.error || 'Unknown error',
          success: result.success && !result.overscan && !alreadyScanned,
          productName: result.productName || undefined,
        });

        if (result.success && !alreadyScanned) {
          // Guard: don't bump UI optimistically if backend's newQuantity does
          // not exceed what we already show locally for this item. Protects
          // against duplicate/idempotent server replies sneaking past.
          if (result.itemId) {
            const items = getItems();
            const existing = items.find(i => i.id === result.itemId);
            const currentQty = existing?.quantity_packed ?? 0;
            const newQty = (result as any).newQuantity;
            const shouldIncrement = typeof newQty !== 'number' || newQty > currentQty;

            scanLog('item_matched', { itemId: result.itemId, productName: result.productName, mode: 'normal', overscan: !!result.overscan, currentQty, newQty, shouldIncrement });
            onHighlight(result.itemId);
            if (shouldIncrement) {
              onOptimisticIncrement(result.itemId);
              if (getIsKolliMode()) {
                await onAssignToKolli(result.itemId);
              }
            } else {
              scanLog('optimistic_increment_skipped_no_progress', { itemId: result.itemId, currentQty, newQty });
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
        } else if (alreadyScanned) {
          // Duplicate: no optimistic bump, no kolli assign, mark as duplicate
          // in recent scans so the user sees feedback but local quantity is
          // unchanged.
          scanLog('duplicate_scan_no_increment', { value: scannedValue, itemId: (result as any).itemId, newQuantity: (result as any).newQuantity });
          // still trigger a sync so any divergent state from server resolves
          onTriggerSync();
          addRecentScan({
            value: scannedValue,
            productName: result.productName || scannedValue,
            success: false,
            timestamp: Date.now(),
            reason: 'duplicate',
          });
          notifyRfid(scannedValue, false, result.productName || undefined, undefined);
        } else {
          toast.error(result.error);
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

    // Hard session guard — utan aktiv packing_work_session får INGA
    // muterande actions skickas (backend kräver activeSessionId).
    // Tystt fall är värre än felmeddelande → visa toast + console.warn.
    const activeSessionId = optRef.current.getActiveSessionId();
    if (!activeSessionId) {
      console.warn('PACKING_SESSION_REQUIRED: Ingen aktiv packningssession', { itemId });
      toast.error('Starta packningssession först');
      return;
    }

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
        await decrementPackingItem(itemId, verifierName, optRef.current.getActiveSessionId());
        onOptimisticDecrement(itemId);
        onTriggerSync();
      } catch (err: any) {
        toast.error(err.message || 'Could not remove');
      }
      return;
    }

    const activeParcelId = optRef.current.getActiveParcelId?.() ?? null;
    const items = getItems();
    const itemBefore = items.find(i => i.id === itemId);
    const productName = itemBefore?.booking_products?.name || 'Produkt';
    const result = await togglePackingItemManually(itemId, isCurrentlyPacked, quantityToPack, verifierName, activeParcelId, undefined, optRef.current.getActiveSessionId());
    if (result.success) {
      if (!isCurrentlyPacked) {
        onOptimisticIncrement(itemId);
        if (getIsKolliMode()) {
          await onAssignToKolli(itemId);
        }
        // Treat manual check-off as a successful scan in the recent log.
        if (result.manualScan) {
          const value = `MANUAL_CHECKOFF:${itemId}`;
          const displayName = result.productName || productName;
          if (result.bundleSynced) {
            optRef.current.onScanResult({
              value,
              result: `✅ Manuellt godkänd: ${displayName}`,
              success: true,
              productName: displayName,
            });
          } else {
            optRef.current.onScanResult({
              value,
              result: result.warning || '⚠️ Packad lokalt, men Bundle-sync misslyckades',
              success: true,
              productName: displayName,
            });
            toast.warning(result.warning || 'Packad lokalt, men Bundle-sync misslyckades');
          }
          addRecentScan({
            value,
            productName: displayName,
            success: true,
            timestamp: Date.now(),
          });
        }
      }
      onTriggerSync();
    } else {
      console.warn('[manual-checkoff] bundle_sync_failed', {
        itemId,
        bundleErrorCode: (result as any).bundleErrorCode,
        warning: result.warning,
        error: result.error,
      });
      toast.error(result.error || result.warning || 'WMS nekade manuell avbockning');
    }
  }, [addRecentScan]); // reads rest from optRef

  const clearSessionDedup = useCallback(() => {
    scanLog('session_dedup_cleared');
  }, []);

  // === Unknown-product handlers ===
  const confirmAddUnknown = useCallback(async (productName: string, quantity: number): Promise<boolean> => {
    if (!pendingUnknownProduct) return false;
    const { packingId, verifierName, onHighlight, onTriggerSync } = optRef.current;
    try {
      const result = await addUnknownProduct(
        packingId,
        pendingUnknownProduct.wmsSku || pendingUnknownProduct.scannedSku || pendingUnknownProduct.scannedValue,
        productName,
        quantity,
        verifierName,
        undefined,
        {
          wmsItemTypeId: pendingUnknownProduct.wmsItemTypeId ?? null,
          wmsSku: pendingUnknownProduct.wmsSku ?? null,
          wmsInstanceId: pendingUnknownProduct.wmsInstanceId ?? null,
          wmsSerialNumber: pendingUnknownProduct.wmsSerialNumber ?? null,
        },
        optRef.current.getActiveSessionId(),
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

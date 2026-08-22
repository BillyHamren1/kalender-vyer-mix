import { useCallback, useEffect, useRef, useState } from 'react';
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
import { isScannerTransactionV2Enabled } from '@/config/scannerFlags';
import {
  enqueueAndProcessScanOperation,
  enqueueScanOperation,
  nextOperationQueueSequence,
  processPersistedScanOperation,
  resumeAndDrain,
} from '@/services/scanner/operationQueueService';
import type { EnqueueScanOperationInput } from '@/services/scanner/operationQueueService';
import type { ScanEvent } from '@/services/scanner/types';
import { isAcceptedResult, type ScannerCommandResult, type ScannerOperationKind } from '@/lib/scanner/commandTypes';
import { RfidDedupeTracker } from '@/lib/scanner/rfidDedupe';

export interface RecentScanEntry {
  value: string;
  productName: string;
  success: boolean;
  timestamp: number;
  /** Why this scan was ignored (if not successful) */
  reason?: 'duplicate' | 'packing_id' | 'error' | 'not_found' | 'overscan' | 'unknown_product';
}

interface ProcessorQueueEntry {
  input: string | ScanEvent;
  /** V2 operations are persisted before they enter the in-memory processor. */
  persistedOperationId?: string;
  /** RFID hardware duplicate filtering already ran before durable enqueue. */
  v2DedupeChecked?: boolean;
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
  organizationId?: string | null;
  bookingNumber?: string | null;
  reservationId?: string | null;
  /** Fail-closed UI readiness gate. Returns null only when mutations are allowed. */
  getReadinessBlockReason?: () => string | null;
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
  /** V2: set exact WMS-authoritative quantity. Never arithmetic. */
  onAuthoritativeSet?: (itemId: string, quantity: number) => void;
  onAssignToKolli: (itemId: string) => Promise<void>;
  onTriggerSync: () => void;
  onRfidTagResult?: (epc: string, matched: boolean, productName?: string, sku?: string) => void;
}

export const useScanProcessor = (options: UseScanProcessorOptions) => {
  // Keep all options in a ref so the queue processor always reads fresh values
  const optRef = useRef(options);
  optRef.current = options;

  const queueRef = useRef<ProcessorQueueEntry[]>([]);
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());
  const isProcessingRef = useRef(false);
  const rfidDedupeRef = useRef(new RfidDedupeTracker(5000));
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

  const blockMutationIfNotReady = useCallback((value?: string): boolean => {
    const reason = optRef.current.getReadinessBlockReason?.() ?? null;
    if (!reason) return false;
    const message = `Scanning spärrad: ${reason}`;
    console.warn('[scanner-readiness] mutation blocked', { packingId: optRef.current.packingId, reason });
    optRef.current.onScanResult({ value: value || 'READINESS', result: message, success: false });
    toast.error(message);
    return true;
  }, []);

  const runV2ManualOperation = useCallback(async (input: EnqueueScanOperationInput) => {
    try {
      return await enqueueAndProcessScanOperation(input);
    } catch (err: any) {
      console.error('[scanner-v2] manual operation blocked before safe commit', err);
      const msg = String(err?.message || err).includes('SCANNER_DURABLE_QUEUE_UNAVAILABLE')
        ? 'Säker scannerlagring saknas – åtgärden genomfördes inte'
        : 'Åtgärden kunde inte sparas säkert – inget skickades till WMS';
      toast.error(msg);
      return null;
    }
  }, []);

  const processNext = useCallback(async () => {
    if (isProcessingRef.current || isPausedRef.current || queueRef.current.length === 0) return;
    isProcessingRef.current = true;

    const queueEntry = queueRef.current.shift()!;
    const rawInput = queueEntry.input;
    const scanEvent: ScanEvent | null = typeof rawInput === 'string' ? null : rawInput;
    const rawValue = typeof rawInput === 'string' ? rawInput : rawInput.value;
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
      packingId, verifierName, verifierStaffId, organizationId, bookingNumber, getItems, getIsMinusMode, getIsKolliMode,
      onScanResult, onHighlight, onOptimisticIncrement,
      onOptimisticDecrement, onAuthoritativeSet, onAssignToKolli, onTriggerSync,
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

      if (blockMutationIfNotReady(scannedValue)) return;

      // === TRANSACTIONAL V2 RUNTIME ===
      // When enabled, this branch owns the scan completely. Legacy API calls,
      // in-memory mutation arithmetic and the old ScanQueue are bypassed.
      if (isScannerTransactionV2Enabled()) {
        const activeSessionId = optRef.current.getActiveSessionId();
        if (!activeSessionId) {
          onScanResult({ value: scannedValue, result: 'Starta packningssession först', success: false });
          toast.error('Starta packningssession först');
          return;
        }

        const items = getItems();
        const matchingItem = parsed.unique
          ? undefined
          : items.find(i => i.booking_products?.sku?.trim().toLowerCase() === normalised);
        const minus = getIsMinusMode();
        const operation: ScannerOperationKind = parsed.unique
          ? (minus ? 'unpack_instance' : 'pack_instance')
          : (minus ? 'unpack_quantity' : 'pack_quantity');

        if (!queueEntry.v2DedupeChecked && scanEvent && (scanEvent.type === 'rfid' || scanEvent.source === 'zebra_rfid')) {
          const dedupe = rfidDedupeRef.current.evaluate({
            epc: scannedValue,
            action: operation,
            packingId,
            sessionId: activeSessionId,
            parcelId: optRef.current.getActiveParcelId?.() ?? null,
          }, scanEvent.timestamp);
          if (dedupe.isDuplicate) {
            scanLog('v2_rfid_duplicate_read_ignored', { value: scannedValue, operation, reason: dedupe.reason });
            onScanResult({ value: scannedValue, result: 'RFID-dubbelläsning ignorerad – inget ändrat', success: false, pending: true });
            addRecentScan({ value: scannedValue, productName: scannedValue, success: false, timestamp: Date.now(), reason: 'duplicate' });
            return;
          }
        }

        const processed = queueEntry.persistedOperationId
          ? await processPersistedScanOperation(queueEntry.persistedOperationId)
          : await enqueueAndProcessScanOperation({
              operation,
              packingId,
              packingSessionId: activeSessionId,
              organizationId: organizationId ?? null,
              reservationId: optRef.current.reservationId ?? null,
              itemId: matchingItem?.id ?? null,
              sku: parsed.unique ? null : scannedValue,
              bookingNumber: bookingNumber ?? null,
              parcelId: optRef.current.getActiveParcelId?.() ?? null,
              quantityDelta: parsed.unique ? null : (minus ? -1 : 1),
              performedBy: verifierStaffId ?? verifierName,
              deviceId: scanEvent?.deviceInfo ?? null,
              scanValue: scannedValue,
              scanSource: scanEvent ? undefined : 'manual',
              scanEvent,
            });

        if (!processed) {
          // Another safe replay/drain may have finalized the durable row between
          // persistence and UI processing. Never invent success; refresh from WMS.
          onScanResult({ value: scannedValue, result: 'Scannen har behandlats i bakgrunden – verifierar WMS-läget', success: false, pending: true });
          onTriggerSync();
          return;
        }

        const result = (processed.result ?? null) as ScannerCommandResult | null;

        if (processed.state === 'UNKNOWN' || processed.state === 'PENDING' || processed.state === 'SENDING') {
          scanLog('v2_scan_outcome_unknown', { operationId: processed.operation_id, value: scannedValue, state: processed.state });
          onScanResult({
            value: scannedValue,
            result: navigator.onLine === false ? 'Offline – väntar på säker synk' : 'Kontrollerar scan – inget nytt försök skapas',
            success: false,
            pending: true,
          });
          addRecentScan({ value: scannedValue, productName: result?.productName || scannedValue, success: false, timestamp: Date.now(), reason: 'error' });
          return;
        }

        if (processed.state === 'COMMITTED' && result && isAcceptedResult(result)) {
          const itemId = result.itemId ?? matchingItem?.id ?? null;
          const productName = result.productName || matchingItem?.booking_products?.name || scannedValue;
          if (itemId && typeof result.packedQuantity === 'number') {
            onAuthoritativeSet?.(itemId, result.packedQuantity);
            onHighlight(itemId);
          }
          if (!minus && itemId && getIsKolliMode()) await onAssignToKolli(itemId);
          onTriggerSync();
          const replayed = result.status === 'duplicate' || result.replayed;
          onScanResult({
            value: scannedValue,
            result: replayed
              ? `↩️ Redan registrerad: ${productName}`
              : minus ? `➖ Bekräftad: ${productName}` : `✅ Bekräftad: ${productName}`,
            success: true,
            productName,
            isMinusScan: minus,
          });
          addRecentScan({ value: scannedValue, productName, success: true, timestamp: Date.now(), reason: replayed ? 'duplicate' : undefined });
          notifyRfid(scannedValue, true, productName, matchingItem?.booking_products?.sku || undefined);
          return;
        }

        const message = result?.message || (
          result?.status === 'wrong_booking' ? 'Fel bokning – inget ändrat' :
          result?.status === 'over_capacity' ? 'Fullpackad – inget ändrat' :
          result?.status === 'not_found' ? 'Artikeln hittades inte – inget ändrat' :
          'Scannen avvisades – inget ändrat'
        );
        onScanResult({ value: scannedValue, result: message, success: false, productName: result?.productName || undefined });
        toast.error(message);
        addRecentScan({ value: scannedValue, productName: result?.productName || scannedValue, success: false, timestamp: Date.now(), reason: result?.status === 'over_capacity' ? 'overscan' : 'error' });
        notifyRfid(scannedValue, false, result?.productName || undefined, matchingItem?.booking_products?.sku || undefined);
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
  }, [addRecentScan, blockMutationIfNotReady]); // No changing option deps — reads from optRef

  const enqueueScan = useCallback((input: string | ScanEvent) => {
    const inputs: Array<string | ScanEvent> = typeof input === 'string'
      ? input.split(/\r?\n/).map(v => v.trim()).filter(Boolean)
      : [input];

    for (const entry of inputs) {
      const value = typeof entry === 'string' ? entry : entry.value;
      if (!value || !value.trim()) {
        scanLog('scan_ignored_empty');
        continue;
      }

      if (!isScannerTransactionV2Enabled()) {
        queueRef.current.push({ input: entry });
        scanLog('scan_enqueued', { value, queueLength: queueRef.current.length });
        processNext();
        continue;
      }

      const scannedValue = value.trim();
      const parsed = parseScanResult(scannedValue);

      // Non-mutating/navigation input and missing-session feedback can still use
      // the processor directly. Every mutation, however, is persisted FIRST.
      if (parsed.type === 'packing_id' || !optRef.current.getActiveSessionId()) {
        queueRef.current.push({ input: entry });
        processNext();
        continue;
      }
      if (blockMutationIfNotReady(scannedValue)) continue;

      const activeSessionId = optRef.current.getActiveSessionId()!;
      const normalised = scannedValue.toLowerCase();
      const minus = optRef.current.getIsMinusMode();
      const items = optRef.current.getItems();
      const matchingItem = parsed.unique
        ? undefined
        : items.find(i => i.booking_products?.sku?.trim().toLowerCase() === normalised);
      const operation: ScannerOperationKind = parsed.unique
        ? (minus ? 'unpack_instance' : 'pack_instance')
        : (minus ? 'unpack_quantity' : 'pack_quantity');
      const scanEvent = typeof entry === 'string' ? null : entry;

      if (scanEvent && (scanEvent.type === 'rfid' || scanEvent.source === 'zebra_rfid')) {
        const dedupe = rfidDedupeRef.current.evaluate({
          epc: scannedValue,
          action: operation,
          packingId: optRef.current.packingId,
          sessionId: activeSessionId,
          parcelId: optRef.current.getActiveParcelId?.() ?? null,
        }, scanEvent.timestamp);
        if (dedupe.isDuplicate) {
          scanLog('v2_rfid_duplicate_read_ignored_before_persist', { value: scannedValue, operation, reason: dedupe.reason });
          optRef.current.onScanResult({ value: scannedValue, result: 'RFID-dubbelläsning ignorerad – inget ändrat', success: false, pending: true });
          addRecentScan({ value: scannedValue, productName: scannedValue, success: false, timestamp: Date.now(), reason: 'duplicate' });
          if (parsed.type === 'rfid_tag') optRef.current.onRfidTagResult?.(scannedValue, false);
          continue;
        }
      }

      // Assign ordering synchronously at physical receipt, then persist operations
      // serially. Network processing is NOT part of this chain, so rapid scans are
      // durably stored without waiting for the previous WMS response.
      const queueSequence = nextOperationQueueSequence(scanEvent?.timestamp ?? Date.now());
      const persist = async () => {
        try {
          const persisted = await enqueueScanOperation({
            operation,
            packingId: optRef.current.packingId,
            packingSessionId: activeSessionId,
            organizationId: optRef.current.organizationId ?? null,
            reservationId: optRef.current.reservationId ?? null,
            itemId: matchingItem?.id ?? null,
            sku: parsed.unique ? null : scannedValue,
            bookingNumber: optRef.current.bookingNumber ?? null,
            parcelId: optRef.current.getActiveParcelId?.() ?? null,
            quantityDelta: parsed.unique ? null : (minus ? -1 : 1),
            performedBy: optRef.current.verifierStaffId ?? optRef.current.verifierName,
            deviceId: scanEvent?.deviceInfo ?? null,
            scanValue: scannedValue,
            scanSource: scanEvent ? undefined : 'manual',
            scanEvent,
            queueSequence,
          });
          queueRef.current.push({ input: entry, persistedOperationId: persisted.operation_id, v2DedupeChecked: true });
          scanLog('v2_operation_durably_enqueued', { value: scannedValue, operationId: persisted.operation_id, queueSequence });
          processNext();
        } catch (err: any) {
          const message = String(err?.message || err);
          console.error('[scanner-v2] durable enqueue failed; mutation blocked', err);
          const userMessage = message.includes('SCANNER_DURABLE_QUEUE_UNAVAILABLE')
            ? 'Säker scannerlagring saknas – scannen genomfördes inte'
            : 'Scannen kunde inte sparas säkert – ingen ändring skickades';
          optRef.current.onScanResult({ value: scannedValue, result: userMessage, success: false });
          toast.error(userMessage);
          addRecentScan({ value: scannedValue, productName: scannedValue, success: false, timestamp: Date.now(), reason: 'error' });
        }
      };
      persistChainRef.current = persistChainRef.current.then(persist, persist);
    }
  }, [addRecentScan, blockMutationIfNotReady, processNext]);

  // Durable replay on app start / reconnect. Same operation_id is always reused.
  useEffect(() => {
    if (!isScannerTransactionV2Enabled()) return;
    let cancelled = false;
    const drain = async () => {
      try {
        const processed = await resumeAndDrain();
        if (!cancelled && processed > 0) optRef.current.onTriggerSync();
      } catch (err) {
        console.warn('[scanner-v2] background queue drain failed', err);
      }
    };
    void drain();
    const onOnline = () => void drain();
    window.addEventListener('online', onOnline);
    // Online does not guarantee that WMS answered. Retry UNKNOWN/PENDING with
    // the SAME operation_id on a bounded cadence while this scanner is open.
    const recoveryTimer = window.setInterval(() => {
      if (navigator.onLine !== false) void drain();
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(recoveryTimer);
      window.removeEventListener('online', onOnline);
    };
  }, []);

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
    if (blockMutationIfNotReady(`MANUAL:${itemId}`)) return;

    if (isParent) {
      toast.info('Parent products are marked automatically when all parts are packed');
      return;
    }

    if (isScannerTransactionV2Enabled()) {
      const operation: ScannerOperationKind = getIsMinusMode() || isCurrentlyPacked ? 'unpack_quantity' : 'pack_quantity';
      const processed = await runV2ManualOperation({
        operation,
        packingId: optRef.current.packingId,
        packingSessionId: activeSessionId,
        organizationId: optRef.current.organizationId ?? null,
        reservationId: optRef.current.reservationId ?? null,
        itemId,
        bookingNumber: optRef.current.bookingNumber ?? null,
        parcelId: optRef.current.getActiveParcelId?.() ?? null,
        quantityDelta: operation === 'pack_quantity' ? 1 : -1,
        performedBy: optRef.current.verifierStaffId ?? verifierName,
        scanValue: `MANUAL:${itemId}`,
        scanSource: 'manual',
      });
      if (!processed) return;
      const result = processed.result as ScannerCommandResult | null;
      if (processed.state === 'COMMITTED' && result && isAcceptedResult(result)) {
        if (typeof result.packedQuantity === 'number') optRef.current.onAuthoritativeSet?.(itemId, result.packedQuantity);
        if (operation === 'pack_quantity' && getIsKolliMode()) await onAssignToKolli(itemId);
        onTriggerSync();
      } else if (processed.state === 'UNKNOWN' || processed.state === 'PENDING' || processed.state === 'SENDING') {
        toast.info('Åtgärden väntar på säker WMS-bekräftelse – tryck inte igen');
      } else {
        toast.error(result?.message || 'WMS nekade ändringen');
      }
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
  }, [addRecentScan, blockMutationIfNotReady, runV2ManualOperation]); // reads rest from optRef

  const clearSessionDedup = useCallback(() => {
    rfidDedupeRef.current.reset();
    scanLog('session_dedup_cleared');
  }, []);

  // === Unknown-product handlers ===
  const confirmAddUnknown = useCallback(async (productName: string, quantity: number): Promise<boolean> => {
    if (!pendingUnknownProduct) return false;
    if (blockMutationIfNotReady(pendingUnknownProduct.scannedValue)) return false;
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
  }, [pendingUnknownProduct, addRecentScan, blockMutationIfNotReady, processNext]);

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

  // Per-row manual +1 (alltid increment, oavsett minus-läge)
  const handleManualIncrement = useCallback(async (
    itemId: string,
    quantityToPack: number,
    isParent: boolean,
  ) => {
    const activeSessionId = optRef.current.getActiveSessionId();
    if (!activeSessionId) {
      console.warn('PACKING_SESSION_REQUIRED: Ingen aktiv packningssession', { itemId });
      toast.error('Starta packningssession först');
      return;
    }
    if (blockMutationIfNotReady(`MANUAL_PLUS:${itemId}`)) return;
    if (isParent) {
      toast.info('Parent products are marked automatically when all parts are packed');
      return;
    }
    if (isScannerTransactionV2Enabled()) {
      const processed = await runV2ManualOperation({
        operation: 'pack_quantity', packingId: optRef.current.packingId,
        packingSessionId: activeSessionId, organizationId: optRef.current.organizationId ?? null,
        reservationId: optRef.current.reservationId ?? null,
        itemId, bookingNumber: optRef.current.bookingNumber ?? null,
        parcelId: optRef.current.getActiveParcelId?.() ?? null, quantityDelta: 1,
        performedBy: optRef.current.verifierStaffId ?? optRef.current.verifierName,
        scanValue: `MANUAL_PLUS:${itemId}`, scanSource: 'manual',
      });
      if (!processed) return;
      const result = processed.result as ScannerCommandResult | null;
      if (processed.state === 'COMMITTED' && result && isAcceptedResult(result)) {
        if (typeof result.packedQuantity === 'number') optRef.current.onAuthoritativeSet?.(itemId, result.packedQuantity);
        if (optRef.current.getIsKolliMode()) await optRef.current.onAssignToKolli(itemId);
        optRef.current.onTriggerSync();
      } else if (processed.state === 'UNKNOWN') toast.info('Åtgärden kontrolleras – tryck inte igen');
      else toast.error(result?.message || 'Kunde inte öka');
      return;
    }
    const { verifierName, onOptimisticIncrement, onAssignToKolli, getIsKolliMode, onTriggerSync } = optRef.current;
    const activeParcelId = optRef.current.getActiveParcelId?.() ?? null;
    try {
      const result = await togglePackingItemManually(
        itemId, false, quantityToPack, verifierName, activeParcelId, undefined, activeSessionId,
      );
      if (result.success) {
        onOptimisticIncrement(itemId);
        if (getIsKolliMode()) await onAssignToKolli(itemId);
        onTriggerSync();
      } else {
        toast.error(result.error || 'Kunde inte öka');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte öka');
    }
  }, [blockMutationIfNotReady, runV2ManualOperation]);

  // Per-row manual -1 (alltid decrement, oavsett minus-läge)
  const handleManualDecrement = useCallback(async (itemId: string) => {
    const activeSessionId = optRef.current.getActiveSessionId();
    if (!activeSessionId) {
      console.warn('PACKING_SESSION_REQUIRED: Ingen aktiv packningssession', { itemId });
      toast.error('Starta packningssession först');
      return;
    }
    if (blockMutationIfNotReady(`MANUAL_MINUS:${itemId}`)) return;
    const { verifierName, onOptimisticDecrement, onTriggerSync, getItems } = optRef.current;
    const item = getItems().find(i => i.id === itemId);
    if (!item || (item.quantity_packed || 0) <= 0) {
      toast.error('Inget att ta bort');
      return;
    }
    if (isScannerTransactionV2Enabled()) {
      const processed = await runV2ManualOperation({
        operation: 'unpack_quantity', packingId: optRef.current.packingId,
        packingSessionId: activeSessionId, organizationId: optRef.current.organizationId ?? null,
        reservationId: optRef.current.reservationId ?? null,
        itemId, bookingNumber: optRef.current.bookingNumber ?? null, quantityDelta: -1,
        performedBy: optRef.current.verifierStaffId ?? optRef.current.verifierName,
        scanValue: `MANUAL_MINUS:${itemId}`, scanSource: 'manual',
      });
      if (!processed) return;
      const result = processed.result as ScannerCommandResult | null;
      if (processed.state === 'COMMITTED' && result && isAcceptedResult(result)) {
        if (typeof result.packedQuantity === 'number') optRef.current.onAuthoritativeSet?.(itemId, result.packedQuantity);
        optRef.current.onTriggerSync();
      } else if (processed.state === 'UNKNOWN') toast.info('Åtgärden kontrolleras – tryck inte igen');
      else toast.error(result?.message || 'Kunde inte ta bort');
      return;
    }
    try {
      await decrementPackingItem(itemId, verifierName, activeSessionId);
      onOptimisticDecrement(itemId);
      onTriggerSync();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte ta bort');
    }
  }, [blockMutationIfNotReady, runV2ManualOperation]);

  return {
    enqueueScan,
    handleManualToggle,
    handleManualIncrement,
    handleManualDecrement,
    recentScans,
    clearSessionDedup,
    pendingUnknownProduct,
    confirmAddUnknown,
    dismissUnknown,
  };
};

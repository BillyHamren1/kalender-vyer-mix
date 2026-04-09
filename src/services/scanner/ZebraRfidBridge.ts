/**
 * ZebraRfidBridge — RFID integration for Zebra RFD4030 (RFD40 series)
 * 
 * Connects to the native ZebraRfidPlugin (Capacitor) which wraps the
 * Zebra RFID SDK for Android. On web, falls back to window-event-based
 * simulation for development/testing.
 * 
 * === ARCHITECTURE ===
 * 
 * Native path (Android):
 *   ZebraRfidPlugin.java ←→ Zebra RFID SDK ←→ RFD4030 hardware
 *         │
 *         ▼  (Capacitor plugin events)
 *   ZebraRfidBridge.ts → ScannerService → React UI
 * 
 * Web fallback:
 *   simulateRfidTag() → window CustomEvent → ZebraRfidBridge listeners
 * 
 * === STATE MODEL ===
 * 
 * This bridge maintains authoritative RFID state derived from native events:
 *   - listenerActive: event listeners registered (bridge is initialized)
 *   - readerConnected: native reader hardware is connected
 *   - inventoryRunning: native inventory is actively scanning
 *   - readerModel: model string from native
 *   - lastError: last error from native
 *   - usingNativePlatform: true if running on Capacitor native (not web fallback)
 * 
 * ScannerService and UI should use getters from this bridge as source of truth.
 */

import { ScanEvent, RfidReadEvent, RfidReaderStatus, RfidTag } from './types';
import { Capacitor, registerPlugin } from '@capacitor/core';

// ── Native Plugin Interface ──────────────────────────────────────

interface ZebraRfidPluginInterface {
  connectReader(): Promise<{ connected: boolean; model: string }>;
  disconnectReader(): Promise<void>;
  startInventory(): Promise<void>;
  stopInventory(): Promise<void>;
  getStatus(): Promise<{
    connected: boolean;
    inventoryRunning: boolean;
    model: string;
    source: string;
  }>;
  addListener(
    eventName: 'rfid_tag',
    callback: (data: NativeTagPayload) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: 'rfid_status',
    callback: (data: NativeStatusPayload) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: 'rfid_error',
    callback: (data: { error: string; source: string; timestamp: number }) => void
  ): Promise<{ remove: () => void }>;
}

interface NativeTagPayload {
  epc: string;
  rssi: number;
  antennaId: number;
  source: string;
  timestamp: number;
  rawData?: string;
}

interface NativeStatusPayload {
  connected: boolean;
  inventoryRunning: boolean;
  model: string;
  source: string;
}

// Register the native Capacitor plugin
const ZebraRfid = registerPlugin<ZebraRfidPluginInterface>('ZebraRfid');

// ── Web Fallback Event Names ─────────────────────────────────────

const RFID_TAG_EVENT = 'zebra-rfid:tag-read';
const RFID_STATUS_EVENT = 'zebra-rfid:status';
const RFID_ERROR_EVENT = 'zebra-rfid:error';

// ── Authoritative Bridge State ───────────────────────────────────
// This is the single source of truth for RFID hardware state.

let listenerActive = false;
let usingNativePlatform = false;
let readerConnected = false;
let inventoryRunning = false;
let readerModel: string | null = null;
let lastError: string | null = null;

// ── Callback State ───────────────────────────────────────────────

type RfidScanCallback = (scan: ScanEvent) => void;
type RfidStatusCallback = (status: RfidReaderStatus) => void;
type RfidErrorCallback = (error: string) => void;

let scanCallback: RfidScanCallback | null = null;
let statusCallback: RfidStatusCallback | null = null;
let errorCallback: RfidErrorCallback | null = null;

let tagCounter = 0;

// Native plugin listener handles
let nativeTagListener: { remove: () => void } | null = null;
let nativeStatusListener: { remove: () => void } | null = null;
let nativeErrorListener: { remove: () => void } | null = null;

// Web fallback listener handles
let webTagListener: ((e: Event) => void) | null = null;
let webStatusListener: ((e: Event) => void) | null = null;
let webErrorListener: ((e: Event) => void) | null = null;

// Dedup map: EPC -> last seen timestamp
const tagDedupMap = new Map<string, number>();
let dedupWindowMs = 5000;

// Recent tags for inventory display
const recentTags = new Map<string, RfidTag>();

// ── Internal State Update ────────────────────────────────────────

/**
 * Update bridge state from a native status event.
 * This is the ONLY place readerConnected/inventoryRunning should be set
 * from external events (besides explicit connect/disconnect calls).
 */
function applyStatusUpdate(connected: boolean, running: boolean, model: string | null): void {
  const changed = readerConnected !== connected || inventoryRunning !== running || readerModel !== model;
  readerConnected = connected;
  inventoryRunning = running;
  if (model) readerModel = model;

  // Clear error on successful connection
  if (connected && lastError) {
    lastError = null;
  }

  if (changed) {
    console.log('[ZebraRFID] State updated: connected=' + connected + ', inventory=' + running + ', model=' + (model || 'n/a'));
  }

  // Forward to ScannerService status callback
  statusCallback?.({
    isConnected: connected,
    readerModel: model || undefined,
  });
}

function applyError(error: string): void {
  lastError = error;
  console.error('[ZebraRFID] Error state:', error);
  errorCallback?.(error);
}

// ── Core Tag Processing ──────────────────────────────────────────

function processTagRead(
  epc: string,
  rssi: number,
  antennaId: number | undefined,
  rawData: string | undefined
): void {
  if (!epc) return;

  const normalizedEpc = epc.toUpperCase().replace(/\s/g, '');
  const now = Date.now();

  // Dedup check
  const lastSeen = tagDedupMap.get(normalizedEpc);
  const isDuplicate = lastSeen !== undefined && (now - lastSeen) < dedupWindowMs;
  tagDedupMap.set(normalizedEpc, now);

  // Update recent tags map (always, even if duplicate)
  const existing = recentTags.get(normalizedEpc);
  if (existing) {
    existing.lastSeenAt = now;
    existing.readCount++;
    existing.rssi = rssi;
  } else {
    recentTags.set(normalizedEpc, {
      epc: normalizedEpc,
      rssi,
      antennaId,
      firstSeenAt: now,
      lastSeenAt: now,
      readCount: 1,
    });
  }

  tagCounter++;
  const scanEvent: ScanEvent = {
    id: `rfid_${now}_${tagCounter}`,
    type: 'rfid',
    source: 'zebra_rfid',
    value: normalizedEpc,
    timestamp: now,
    rawData: rawData || undefined,
    rssi,
    antennaId,
    deviceInfo: readerModel || 'Zebra RFID',
    isDuplicate,
  };

  scanCallback?.(scanEvent);
}

// ── Start / Stop Listeners ───────────────────────────────────────

export function startRfidListener(
  onTag: RfidScanCallback,
  onStatus?: RfidStatusCallback,
  onError?: RfidErrorCallback,
  dedupWindow?: number
): void {
  if (listenerActive) {
    console.warn('[ZebraRFID] Already listening, stopping first');
    stopRfidListener();
  }

  scanCallback = onTag;
  statusCallback = onStatus || null;
  errorCallback = onError || null;
  if (dedupWindow !== undefined) dedupWindowMs = dedupWindow;

  listenerActive = true;
  usingNativePlatform = Capacitor.isNativePlatform();

  if (usingNativePlatform) {
    startNativeListeners();
  } else {
    startWebFallbackListeners();
  }
}

async function startNativeListeners(): Promise<void> {
  try {
    nativeTagListener = await ZebraRfid.addListener('rfid_tag', (payload: NativeTagPayload) => {
      console.log('[ZebraRFID] Native tag:', payload.epc, 'RSSI:', payload.rssi);
      processTagRead(payload.epc, payload.rssi, payload.antennaId, payload.rawData);
    });

    nativeStatusListener = await ZebraRfid.addListener('rfid_status', (payload: NativeStatusPayload) => {
      console.log('[ZebraRFID] Native status event:', payload);
      applyStatusUpdate(payload.connected, payload.inventoryRunning, payload.model || null);
    });

    nativeErrorListener = await ZebraRfid.addListener('rfid_error', (payload) => {
      applyError(payload.error);
    });

    console.log('[ZebraRFID] Native Capacitor plugin listeners registered');
  } catch (error) {
    console.error('[ZebraRFID] Failed to register native listeners:', error);
    console.log('[ZebraRFID] Falling back to web event listeners');
    usingNativePlatform = false;
    startWebFallbackListeners();
  }
}

function startWebFallbackListeners(): void {
  webTagListener = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail) return;
    const reads: RfidReadEvent[] = Array.isArray(detail) ? detail : [detail];
    for (const read of reads) {
      if (!read.tagId) continue;
      processTagRead(read.tagId, read.rssi, read.antennaId, JSON.stringify(read));
    }
  };

  webStatusListener = (event: Event) => {
    const detail = (event as CustomEvent<RfidReaderStatus>).detail;
    if (detail) {
      // Web simulation status events
      applyStatusUpdate(detail.isConnected, inventoryRunning, detail.readerModel || null);
    }
  };

  webErrorListener = (event: Event) => {
    const detail = (event as CustomEvent<{ message: string }>).detail;
    if (detail?.message) applyError(detail.message);
  };

  window.addEventListener(RFID_TAG_EVENT, webTagListener);
  window.addEventListener(RFID_STATUS_EVENT, webStatusListener);
  window.addEventListener(RFID_ERROR_EVENT, webErrorListener);

  console.log('[ZebraRFID] Web fallback listeners registered (no hardware RFID available)');
}

export function stopRfidListener(): void {
  // Remove native listeners
  if (nativeTagListener) { nativeTagListener.remove(); nativeTagListener = null; }
  if (nativeStatusListener) { nativeStatusListener.remove(); nativeStatusListener = null; }
  if (nativeErrorListener) { nativeErrorListener.remove(); nativeErrorListener = null; }

  // Remove web fallback listeners
  if (webTagListener) { window.removeEventListener(RFID_TAG_EVENT, webTagListener); webTagListener = null; }
  if (webStatusListener) { window.removeEventListener(RFID_STATUS_EVENT, webStatusListener); webStatusListener = null; }
  if (webErrorListener) { window.removeEventListener(RFID_ERROR_EVENT, webErrorListener); webErrorListener = null; }

  scanCallback = null;
  statusCallback = null;
  errorCallback = null;

  // Reset all state
  listenerActive = false;
  usingNativePlatform = false;
  readerConnected = false;
  inventoryRunning = false;
  readerModel = null;
  lastError = null;

  console.log('[ZebraRFID] All listeners removed, state reset');
}

// ── State Getters (source of truth for ScannerService) ───────────

/** Whether RFID event listeners are registered */
export function isRfidListening(): boolean {
  return listenerActive;
}

/** Whether running on native platform with potential RFID hardware */
export function isNativeRfidPlatform(): boolean {
  return usingNativePlatform;
}

/** Whether the RFID reader hardware is actually connected (from native status) */
export function isReaderConnected(): boolean {
  return readerConnected;
}

/** Whether RFID inventory is actively running (from native status) */
export function isInventoryRunning(): boolean {
  return inventoryRunning;
}

/** Connected reader model name */
export function getReaderModel(): string | null {
  return readerModel;
}

/** Last error message from native bridge */
export function getLastRfidError(): string | null {
  return lastError;
}

// ── Inventory / Reader Commands ──────────────────────────────────

/**
 * Connect to the RFID reader via native plugin.
 */
export async function connectRfidReader(): Promise<{ connected: boolean; model?: string }> {
  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[ZebraRFID] Connecting to reader...');
      const result = await ZebraRfid.connectReader();
      console.log('[ZebraRFID] Connected:', result);
      // State will be updated via the rfid_status event from native,
      // but also set it here for immediate availability
      applyStatusUpdate(result.connected, false, result.model || null);
      return { connected: result.connected, model: result.model };
    } catch (error: any) {
      console.error('[ZebraRFID] Connect failed:', error);
      applyError(error.message || 'Connect failed');
      applyStatusUpdate(false, false, null);
      throw error;
    }
  }
  console.log('[ZebraRFID] connectReader (web no-op)');
  return { connected: false };
}

/**
 * Disconnect from the RFID reader.
 */
export async function disconnectRfidReader(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[ZebraRFID] Disconnecting reader...');
      await ZebraRfid.disconnectReader();
      console.log('[ZebraRFID] Disconnected');
      // State will also be updated via rfid_status event
      applyStatusUpdate(false, false, null);
    } catch (error: any) {
      console.error('[ZebraRFID] Disconnect failed:', error);
      applyError(error.message || 'Disconnect failed');
      throw error;
    }
  } else {
    console.log('[ZebraRFID] disconnectReader (web no-op)');
    applyStatusUpdate(false, false, null);
  }
}

/**
 * Start RFID inventory (continuous tag reading).
 */
/**
 * Start RFID inventory (continuous tag reading).
 * Does NOT set inventoryRunning — that is set only by native rfid_status events.
 */
export async function startRfidInventory(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[ZebraRFID] Requesting inventory start...');
      await ZebraRfid.startInventory();
      console.log('[ZebraRFID] Inventory start requested (awaiting native confirmation)');
      // Do NOT set inventoryRunning here — wait for rfid_status event from native
    } catch (error: any) {
      console.error('[ZebraRFID] Start inventory failed:', error);
      applyError(error.message || 'Start inventory failed');
      throw error;
    }
  } else {
    console.log('[ZebraRFID] startInventory (web no-op)');
  }
}

/**
 * Stop RFID inventory.
 */
/**
 * Stop RFID inventory.
 * Does NOT set inventoryRunning — that is set only by native rfid_status events.
 */
export async function stopRfidInventory(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[ZebraRFID] Requesting inventory stop...');
      await ZebraRfid.stopInventory();
      console.log('[ZebraRFID] Inventory stop requested (awaiting native confirmation)');
      // Do NOT set inventoryRunning here — wait for rfid_status event from native
    } catch (error: any) {
      console.error('[ZebraRFID] Stop inventory failed:', error);
      applyError(error.message || 'Stop inventory failed');
      throw error;
    }
  } else {
    console.log('[ZebraRFID] stopInventory (web no-op)');
  }
}

/**
 * Trigger a single RFID read (convenience, starts then immediately stops).
 */
export async function triggerRfidRead(): Promise<void> {
  console.log('[ZebraRFID] Single read triggered');
  await startRfidInventory();
  // Real trigger-mode is handled by the Zebra SDK trigger button config
}

/**
 * Get current reader status from native plugin.
 * Also refreshes bridge state from native.
 */
export async function getRfidReaderStatus(): Promise<RfidReaderStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await ZebraRfid.getStatus();
      // Update bridge state from native poll
      applyStatusUpdate(status.connected, status.inventoryRunning, status.model || null);
      return {
        isConnected: status.connected,
        readerModel: status.model || undefined,
      };
    } catch (error) {
      console.error('[ZebraRFID] getStatus failed:', error);
      return { isConnected: false };
    }
  }
  return { isConnected: false };
}

// ── Tag Management ───────────────────────────────────────────────

export function getRecentTags(): RfidTag[] {
  return Array.from(recentTags.values())
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function getUniqueTagCount(): number {
  return recentTags.size;
}

export function clearRecentTags(): void {
  recentTags.clear();
  tagDedupMap.clear();
}

export function getTagReadCount(): number {
  return tagCounter;
}

export function resetTagCounter(): void {
  tagCounter = 0;
}

// ── Dedup Management ─────────────────────────────────────────────

export function clearDedupForEpc(epc: string): void {
  tagDedupMap.delete(epc.toUpperCase().replace(/\s/g, ''));
}

export function clearAllDedup(): void {
  tagDedupMap.clear();
}

// ── Simulation (for testing without hardware) ────────────────────

export function simulateRfidTag(epc: string, rssi: number = -45): void {
  const event = new CustomEvent(RFID_TAG_EVENT, {
    detail: {
      tagId: epc,
      rssi,
      antennaId: 1,
      timestamp: Date.now(),
    } as RfidReadEvent
  });
  window.dispatchEvent(event);
  console.log(`[ZebraRFID] Simulated tag: ${epc} (RSSI: ${rssi})`);
}

export function simulateReaderStatus(connected: boolean, model?: string): void {
  const event = new CustomEvent(RFID_STATUS_EVENT, {
    detail: {
      isConnected: connected,
      readerModel: model || 'RFD4031 (simulated)',
    } as RfidReaderStatus
  });
  window.dispatchEvent(event);
}

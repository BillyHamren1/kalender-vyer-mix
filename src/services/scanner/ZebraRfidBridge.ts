/**
 * ZebraRfidBridge — RFID integration for Zebra RFD4030 (RFD40 series)
 * 
 * The RFD4030 sled connects to TC22 and communicates via the 
 * Zebra RFID SDK (Android). This bridge handles the WebView side.
 * 
 * === ANDROID NATIVE SETUP REQUIRED ===
 * 
 * 1. Add Zebra RFID SDK dependency to build.gradle:
 *    implementation 'com.zebra.rfid:rfidapi3:3.x.x'
 * 
 * 2. Create Capacitor plugin: ZebraRfidPlugin.java
 *    - Initialize RFIDReader from the SDK
 *    - Handle reader connection/disconnection events
 *    - Forward tag read events to WebView
 *    - Support inventory start/stop commands
 *    - Support single-read/trigger-read
 *    - Report reader status (battery, connected, model)
 * 
 * 3. Register plugin in MainActivity.java
 * 
 * 4. Add required Android permissions:
 *    - android.permission.BLUETOOTH
 *    - android.permission.BLUETOOTH_ADMIN
 *    - android.permission.BLUETOOTH_CONNECT (Android 12+)
 *    - android.permission.BLUETOOTH_SCAN (Android 12+)
 *    - android.permission.ACCESS_FINE_LOCATION
 * 
 * The native plugin dispatches events to window:
 *   'zebra-rfid:tag-read'     — individual or batch tag reads
 *   'zebra-rfid:status'       — reader connection/status changes
 *   'zebra-rfid:error'        — reader errors
 * 
 * This bridge handles deduplication, batching, and normalization.
 */

import { ScanEvent, RfidReadEvent, RfidReaderStatus, RfidTag } from './types';

// ── Event names from native plugin ──────────────────────────────

const RFID_TAG_EVENT = 'zebra-rfid:tag-read';
const RFID_STATUS_EVENT = 'zebra-rfid:status';
const RFID_ERROR_EVENT = 'zebra-rfid:error';

// ── State ────────────────────────────────────────────────────────

type RfidScanCallback = (scan: ScanEvent) => void;
type RfidStatusCallback = (status: RfidReaderStatus) => void;
type RfidErrorCallback = (error: string) => void;

let tagListener: ((e: Event) => void) | null = null;
let statusListener: ((e: Event) => void) | null = null;
let errorListener: ((e: Event) => void) | null = null;

let isListening = false;
let scanCallback: RfidScanCallback | null = null;
let statusCallback: RfidStatusCallback | null = null;
let errorCallback: RfidErrorCallback | null = null;

let tagCounter = 0;

// Dedup map: EPC -> last seen timestamp
const tagDedupMap = new Map<string, number>();
let dedupWindowMs = 5000;

// Recent tags for batch display
const recentTags = new Map<string, RfidTag>();

// ── Public API ───────────────────────────────────────────────────

export function startRfidListener(
  onTag: RfidScanCallback,
  onStatus?: RfidStatusCallback,
  onError?: RfidErrorCallback,
  dedupWindow?: number
): void {
  if (isListening) {
    console.warn('[ZebraRFID] Already listening, stopping first');
    stopRfidListener();
  }

  scanCallback = onTag;
  statusCallback = onStatus || null;
  errorCallback = onError || null;
  if (dedupWindow !== undefined) dedupWindowMs = dedupWindow;

  isListening = true;

  // Tag reads
  tagListener = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail) return;

    // Support both single and batch reads
    const reads: RfidReadEvent[] = Array.isArray(detail) ? detail : [detail];

    for (const read of reads) {
      if (!read.tagId) continue;

      const epc = read.tagId.toUpperCase().replace(/\s/g, '');
      const now = Date.now();

      // Dedup check
      const lastSeen = tagDedupMap.get(epc);
      const isDuplicate = lastSeen !== undefined && (now - lastSeen) < dedupWindowMs;
      tagDedupMap.set(epc, now);

      // Update recent tags map
      const existing = recentTags.get(epc);
      if (existing) {
        existing.lastSeenAt = now;
        existing.readCount++;
        existing.rssi = read.rssi;
      } else {
        recentTags.set(epc, {
          epc,
          rssi: read.rssi,
          antennaId: read.antennaId,
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
        value: epc,
        timestamp: now,
        rawData: JSON.stringify(read),
        rssi: read.rssi,
        antennaId: read.antennaId,
        deviceInfo: 'Zebra RFD4030',
        isDuplicate,
      };

      scanCallback?.(scanEvent);
    }
  };

  // Status changes
  statusListener = (event: Event) => {
    const detail = (event as CustomEvent<RfidReaderStatus>).detail;
    if (detail) {
      statusCallback?.(detail);
    }
  };

  // Errors
  errorListener = (event: Event) => {
    const detail = (event as CustomEvent<{ message: string }>).detail;
    if (detail?.message) {
      errorCallback?.(detail.message);
    }
  };

  window.addEventListener(RFID_TAG_EVENT, tagListener);
  window.addEventListener(RFID_STATUS_EVENT, statusListener);
  window.addEventListener(RFID_ERROR_EVENT, errorListener);

  console.log('[ZebraRFID] Listeners registered');
}

export function stopRfidListener(): void {
  if (tagListener) window.removeEventListener(RFID_TAG_EVENT, tagListener);
  if (statusListener) window.removeEventListener(RFID_STATUS_EVENT, statusListener);
  if (errorListener) window.removeEventListener(RFID_ERROR_EVENT, errorListener);

  tagListener = null;
  statusListener = null;
  errorListener = null;
  scanCallback = null;
  statusCallback = null;
  errorCallback = null;
  isListening = false;

  console.log('[ZebraRFID] Listeners removed');
}

export function isRfidListening(): boolean {
  return isListening;
}

// ── Inventory Session Commands ───────────────────────────────────
// These call the native Capacitor plugin

/**
 * Start RFID inventory session (continuous reading).
 * TODO: Implement native plugin call
 */
export async function startRfidInventory(): Promise<void> {
  // TODO: Capacitor plugin call
  // await ZebraRfidPlugin.startInventory();
  console.log('[ZebraRFID] Start inventory requested');
  window.dispatchEvent(new CustomEvent('zebra-rfid:command', {
    detail: { command: 'START_INVENTORY' }
  }));
}

/**
 * Stop RFID inventory session.
 * TODO: Implement native plugin call
 */
export async function stopRfidInventory(): Promise<void> {
  // TODO: Capacitor plugin call
  // await ZebraRfidPlugin.stopInventory();
  console.log('[ZebraRFID] Stop inventory requested');
  window.dispatchEvent(new CustomEvent('zebra-rfid:command', {
    detail: { command: 'STOP_INVENTORY' }
  }));
}

/**
 * Trigger a single RFID read.
 * TODO: Implement native plugin call
 */
export async function triggerRfidRead(): Promise<void> {
  console.log('[ZebraRFID] Single read triggered');
  window.dispatchEvent(new CustomEvent('zebra-rfid:command', {
    detail: { command: 'TRIGGER_READ' }
  }));
}

/**
 * Get current reader status.
 * TODO: Implement native plugin call
 */
export async function getRfidReaderStatus(): Promise<RfidReaderStatus> {
  // TODO: Capacitor plugin call
  // return await ZebraRfidPlugin.getReaderStatus();
  return {
    isConnected: false,
    readerModel: undefined,
  };
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

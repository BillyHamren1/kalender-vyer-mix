/**
 * ScannerService — Central scanner orchestrator
 * 
 * Manages all scan sources and provides a unified event stream.
 * Handles initialization, mode switching, deduplication, and cleanup.
 * 
 * === STATE MODEL ===
 * 
 * This service aggregates state from multiple bridges:
 * - DataWedgeBridge: barcode scanning
 * - ZebraRfidBridge: RFID scanning (source of truth for RFID hardware state)
 * - KeyboardFallbackBridge: web/dev keyboard input
 * 
 * RFID state (connected, inventory, model) comes from ZebraRfidBridge getters,
 * NOT from local variables in this file. This prevents double/conflicting state.
 */

import { ScanEvent, ScanMode, ScannerState, ScannerDebugInfo, ScannerConfig, DEFAULT_SCANNER_CONFIG } from './types';
import { detectPlatform } from './platform';
import {
  startDataWedgeListener, stopDataWedgeListener, isDataWedgeActive, getDataWedgeScanCount,
  wasInitCommandsSent, getInitErrors, getLastScanTimestamp, getLastScanValue,
  getInitCommandResults, profileSwitchSucceeded, scannerInputEnabledSucceeded,
} from './DataWedgeBridge';
import {
  startRfidListener, stopRfidListener, isRfidListening,
  isNativeRfidPlatform, isReaderConnected, isInventoryRunning,
  getReaderModel, getLastRfidError,
  connectRfidReader, getRecentTags,
} from './ZebraRfidBridge';
import { startKeyboardListener, stopKeyboardListener, isKeyboardListenerActive } from './KeyboardFallbackBridge';
import { enqueueScan } from './ScanQueue';

type ScanHandler = (scan: ScanEvent) => void;

// ── Singleton State ──────────────────────────────────────────────

let config: ScannerConfig = { ...DEFAULT_SCANNER_CONFIG };
let scanHandler: ScanHandler | null = null;
let initialized = false;
let currentMode: ScanMode = 'barcode';
let scanCount = 0;
let lastScan: ScanEvent | null = null;
const recentScans: ScanEvent[] = [];

// Dedup tracking (barcode only — RFID dedup is in ZebraRfidBridge)
const barcodeDedupMap = new Map<string, number>();

// ── Dedup Logic ──────────────────────────────────────────────────

function isDuplicate(scan: ScanEvent): boolean {
  if (scan.type === 'rfid') {
    return scan.isDuplicate;
  }

  const lastTime = barcodeDedupMap.get(scan.value);
  const now = Date.now();
  if (lastTime && (now - lastTime) < config.barcodeDedupWindowMs) {
    return true;
  }
  barcodeDedupMap.set(scan.value, now);
  return false;
}

// ── Unified Scan Handler ─────────────────────────────────────────

function handleIncomingScan(scan: ScanEvent): void {
  scan.isDuplicate = isDuplicate(scan);

  enqueueScan(scan, 'received');

  scanCount++;
  lastScan = scan;
  recentScans.unshift(scan);
  if (recentScans.length > config.maxRecentScans) {
    recentScans.pop();
  }

  scanHandler?.(scan);
}

// ── Public API ───────────────────────────────────────────────────

export function initScanner(
  onScan: ScanHandler,
  userConfig?: Partial<ScannerConfig>
): void {
  if (initialized) {
    console.warn('[ScannerService] Already initialized, reinitializing...');
    destroyScanner();
  }

  config = { ...DEFAULT_SCANNER_CONFIG, ...userConfig };
  scanHandler = onScan;
  initialized = true;

  const platform = detectPlatform();

  console.log('[ScannerService] Initializing...', {
    platform: platform.isCapacitor ? 'native' : 'web',
    isAndroid: platform.isAndroid,
    isZebra: platform.isZebraDevice,
  });

  if (platform.isCapacitor && platform.isAndroid) {
    if (config.autoStartDataWedge) {
      startDataWedgeListener(handleIncomingScan);
    }
  }

  if (platform.isCapacitor && platform.isAndroid) {
    startRfidListener(
      handleIncomingScan,
      (status) => {
        console.log('[ScannerService] RFID status update from bridge:', status);
      },
      (error) => {
        console.error('[ScannerService] RFID error from bridge:', error);
      },
      config.rfidDedupWindowMs
    );

    connectRfidReader()
      .then(result => {
        if (result.connected) {
          console.log('[ScannerService] RFID reader auto-connected:', result.model);
        }
      })
      .catch(err => {
        console.log('[ScannerService] RFID auto-connect skipped (no reader):', err.message);
      });
  }

  if (config.enableKeyboardFallback && (!platform.isZebraDevice || platform.isWeb)) {
    startKeyboardListener(handleIncomingScan);
  }

  console.log('[ScannerService] Initialized');
}

export function destroyScanner(): void {
  stopDataWedgeListener();
  stopRfidListener();
  stopKeyboardListener();
  scanHandler = null;
  initialized = false;
  scanCount = 0;
  lastScan = null;
  recentScans.length = 0;
  barcodeDedupMap.clear();
  console.log('[ScannerService] Destroyed');
}

export function setMode(mode: ScanMode): void {
  currentMode = mode;
  console.log('[ScannerService] Mode set to:', mode);
}

export function getState(): ScannerState {
  const platform = detectPlatform();

  const rfidListenerActive = isRfidListening();
  const rfidOnNative = isNativeRfidPlatform();
  const rfidReaderConnected = isReaderConnected();
  const rfidInventoryActive = isInventoryRunning();

  const isRfidReady = rfidListenerActive && rfidOnNative;

  return {
    isInitialized: initialized,
    isScannerReady: initialized,
    isBarcodeReady: isDataWedgeActive() || isKeyboardListenerActive(),
    isRfidReady,
    isReaderConnected: rfidReaderConnected,
    isInventoryRunning: rfidInventoryActive,
    currentMode,
    lastScan,
    scanCount,
    recentScans: [...recentScans],
    recentRfidTags: getRecentTags().map(tag => ({
      id: `rfid_tag_${tag.epc}`,
      type: 'rfid' as const,
      source: 'zebra_rfid' as const,
      value: tag.epc,
      timestamp: tag.lastSeenAt,
      rssi: tag.rssi,
      antennaId: tag.antennaId,
      isDuplicate: false,
    })),
    error: getLastRfidError(),
    warning: getWarning(platform),
    debugInfo: getDebugInfo(platform),
  };
}

function getWarning(platform: ReturnType<typeof detectPlatform>): string | null {
  if (platform.isWeb) {
    return 'Kör i webbläsare — Zebra DataWedge ej tillgängligt. Använd kamera eller manuell inmatning.';
  }
  if (platform.isCapacitor && !platform.isZebraDevice) {
    return 'Ej Zebra-enhet — DataWedge kanske inte fungerar. Keyboard-fallback aktivt.';
  }
  return null;
}

function getDebugInfo(platform: ReturnType<typeof detectPlatform>): ScannerDebugInfo {
  const rfidReaderConnected = isReaderConnected();

  return {
    platform: platform.isCapacitor && platform.isAndroid ? 'android_native' : platform.isWeb ? 'web' : 'unknown',
    isCapacitor: platform.isCapacitor,
    isZebraDevice: platform.isZebraDevice,
    dataWedgeListenerActive: isDataWedgeActive(),
    dataWedgeInitSent: wasInitCommandsSent(),
    dataWedgeInitErrors: getInitErrors(),
    dataWedgeLastScanTime: getLastScanTimestamp(),
    dataWedgeLastScanValue: getLastScanValue(),
    dataWedgeInitResults: getInitCommandResults(),
    dataWedgeProfileSwitchOk: profileSwitchSucceeded(),
    dataWedgeScannerInputOk: scannerInputEnabledSucceeded(),
    rfidListenerActive: isRfidListening(),
    cameraAvailable: 'mediaDevices' in navigator,
    lastDataWedgeEvent: null,
    lastRfidEvent: null,
    lastError: getLastRfidError(),
    lastNativePayload: lastScan?.rawData || null,
    sessionScanCount: scanCount,
    readerModel: getReaderModel(),
    readerConnectionStatus: rfidReaderConnected
      ? 'connected'
      : 'disconnected',
  };
}

export function getRecentScanList(): ScanEvent[] {
  return [...recentScans];
}

export function isInitialized(): boolean {
  return initialized;
}

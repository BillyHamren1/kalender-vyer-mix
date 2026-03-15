/**
 * ScannerService — Central scanner orchestrator
 * 
 * Manages all scan sources and provides a unified event stream.
 * Handles initialization, mode switching, deduplication, and cleanup.
 */

import { ScanEvent, ScanMode, ScannerState, ScannerDebugInfo, ScannerConfig, DEFAULT_SCANNER_CONFIG, RfidReaderStatus } from './types';
import { detectPlatform } from './platform';
import { startDataWedgeListener, stopDataWedgeListener, isDataWedgeActive, getDataWedgeScanCount } from './DataWedgeBridge';
import { startRfidListener, stopRfidListener, isRfidListening, getRecentTags, getUniqueTagCount, getTagReadCount } from './ZebraRfidBridge';
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

// Dedup tracking
const barcodeDedupMap = new Map<string, number>();

// Reader status
let readerStatus: RfidReaderStatus = { isConnected: false };

// ── Dedup Logic ──────────────────────────────────────────────────

function isDuplicate(scan: ScanEvent): boolean {
  if (scan.type === 'rfid') {
    // RFID dedup handled in ZebraRfidBridge
    return scan.isDuplicate;
  }

  // Barcode dedup
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

  // Always queue for offline resilience
  enqueueScan(scan, 'received');

  // Track
  scanCount++;
  lastScan = scan;
  recentScans.unshift(scan);
  if (recentScans.length > config.maxRecentScans) {
    recentScans.pop();
  }

  // Forward to consumer
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

  // Priority 1: Zebra DataWedge (on Android/Capacitor)
  if (platform.isCapacitor && platform.isAndroid) {
    if (config.autoStartDataWedge) {
      startDataWedgeListener(handleIncomingScan);
    }
  }

  // Priority 2: RFID listener (always register on Android, no-op without hardware)
  if (platform.isCapacitor && platform.isAndroid) {
    startRfidListener(
      handleIncomingScan,
      (status) => {
        readerStatus = status;
        console.log('[ScannerService] Reader status:', status);
      },
      (error) => {
        console.error('[ScannerService] RFID error:', error);
      },
      config.rfidDedupWindowMs
    );
  }

  // Priority 3: Keyboard fallback (web or non-Zebra Android)
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
  
  return {
    isInitialized: initialized,
    isScannerReady: initialized,
    isBarcodeReady: isDataWedgeActive() || isKeyboardListenerActive(),
    isRfidReady: isRfidListening(),
    isReaderConnected: readerStatus.isConnected,
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
    error: null,
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
  return {
    platform: platform.isCapacitor && platform.isAndroid ? 'android_native' : platform.isWeb ? 'web' : 'unknown',
    isCapacitor: platform.isCapacitor,
    isZebraDevice: platform.isZebraDevice,
    dataWedgeListenerActive: isDataWedgeActive(),
    rfidListenerActive: isRfidListening(),
    cameraAvailable: 'mediaDevices' in navigator,
    lastDataWedgeEvent: null, // TODO: track from bridge
    lastRfidEvent: null,
    lastError: null,
    lastNativePayload: lastScan?.rawData || null,
    sessionScanCount: scanCount,
    readerModel: readerStatus.readerModel || null,
    readerConnectionStatus: readerStatus.isConnected ? 'connected' : 'disconnected',
  };
}

export function getRecentScanList(): ScanEvent[] {
  return [...recentScans];
}

export function isInitialized(): boolean {
  return initialized;
}

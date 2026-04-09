/**
 * Scanner Domain Types
 * 
 * Unified type system for all scan sources:
 * - Zebra DataWedge (barcode on TC22)
 * - Zebra RFID (RFD4030/RFD40 series)
 * - Camera (BarcodeDetector API)
 * - Keyboard/HID fallback
 */

// ── Scan Event Types ─────────────────────────────────────────────

export type ScanType = 'barcode' | 'rfid';

export type ScanSource =
  | 'zebra_datawedge'
  | 'zebra_rfid'
  | 'camera'
  | 'keyboard_fallback'
  | 'manual_input';

export interface ScanEvent {
  id: string;
  type: ScanType;
  source: ScanSource;
  value: string;              // barcode string or EPC/tag ID
  timestamp: number;
  rawData?: string;           // raw intent/event payload
  deviceInfo?: string;        // device model or reader name
  symbology?: string;         // barcode symbology (EAN-13, Code128, etc.)
  rssi?: number;              // RFID signal strength
  antennaId?: number;         // RFID antenna port
  isDuplicate: boolean;
  // Context (set by consumer, not scanner bridge)
  jobContext?: string;
  packingContext?: string;
  parcelContext?: string;
}

// ── Scanner Modes ────────────────────────────────────────────────

export type ScanMode =
  | 'barcode'           // Single barcode scanning
  | 'rfid_inventory'    // Continuous RFID tag reading
  | 'rfid_locate'       // RFID locate mode (future)
  | 'mixed';            // Both barcode + RFID active

// ── Scanner State ────────────────────────────────────────────────

export interface ScannerState {
  isInitialized: boolean;
  isScannerReady: boolean;
  isBarcodeReady: boolean;
  /** RFID subsystem available (native platform + listeners registered). NOT "reader connected". */
  isRfidReady: boolean;
  /** RFID reader hardware is physically connected */
  isReaderConnected: boolean;
  /** RFID inventory is actively scanning tags */
  isInventoryRunning: boolean;
  currentMode: ScanMode;
  lastScan: ScanEvent | null;
  scanCount: number;
  recentScans: ScanEvent[];
  recentRfidTags: ScanEvent[];
  error: string | null;
  warning: string | null;
  debugInfo: ScannerDebugInfo;
}

export interface ScannerDebugInfo {
  platform: 'android_native' | 'web' | 'unknown';
  isCapacitor: boolean;
  isZebraDevice: boolean;
  dataWedgeListenerActive: boolean;
  dataWedgeInitSent: boolean;
  dataWedgeInitErrors: string[];
  dataWedgeLastScanTime: number | null;
  dataWedgeLastScanValue: string | null;
  rfidListenerActive: boolean;
  cameraAvailable: boolean;
  lastDataWedgeEvent: string | null;
  lastRfidEvent: string | null;
  lastError: string | null;
  lastNativePayload: string | null;
  sessionScanCount: number;
  readerModel: string | null;
  readerConnectionStatus: 'connected' | 'disconnected' | 'connecting' | 'unknown';
}

// ── RFID Specific ────────────────────────────────────────────────

export interface RfidInventorySession {
  isActive: boolean;
  startedAt: number | null;
  tagsRead: number;
  uniqueTags: number;
}

export interface RfidTag {
  epc: string;
  rssi: number;
  antennaId?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  readCount: number;
}

// ── Offline Queue ────────────────────────────────────────────────

export type ScanSyncStatus =
  | 'received'           // Scan captured locally
  | 'processed_locally'  // Processed against local state
  | 'synced'             // Successfully sent to backend
  | 'failed';            // Sync failed (will retry)

export interface QueuedScan {
  scan: ScanEvent;
  syncStatus: ScanSyncStatus;
  retryCount: number;
  lastAttempt: number | null;
  error?: string;
}

// ── Bridge / Plugin Types ────────────────────────────────────────

/** Intent data from DataWedge broadcast */
export interface DataWedgeIntentData {
  action?: string;
  data?: string;
  labelType?: string;   // symbology
  source?: string;
  extras?: Record<string, unknown>;
}

/** RFID read event from native bridge */
export interface RfidReadEvent {
  tagId: string;          // EPC hex string
  rssi: number;
  antennaId?: number;
  peakRssi?: number;
  phase?: number;
  frequency?: number;
  timestamp: number;
}

/** RFID reader status from native bridge */
export interface RfidReaderStatus {
  isConnected: boolean;
  readerModel?: string;
  firmwareVersion?: string;
  batteryLevel?: number;
  temperature?: number;
}

// ── Scanner Controller Config ────────────────────────────────────

export interface ScannerConfig {
  /** Dedup window in ms for same barcode */
  barcodeDedupWindowMs: number;
  /** Dedup window in ms for same RFID tag */
  rfidDedupWindowMs: number;
  /** Max recent scans to keep */
  maxRecentScans: number;
  /** Max recent RFID tags to keep */
  maxRecentRfidTags: number;
  /** Enable keyboard/HID fallback */
  enableKeyboardFallback: boolean;
  /** Enable camera scanner */
  enableCameraScanner: boolean;
  /** Auto-start DataWedge on init */
  autoStartDataWedge: boolean;
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  barcodeDedupWindowMs: 3000,
  rfidDedupWindowMs: 5000,
  maxRecentScans: 50,
  maxRecentRfidTags: 200,
  enableKeyboardFallback: true,
  enableCameraScanner: true,
  autoStartDataWedge: true,
};

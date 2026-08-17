/**
 * Scanner Domain — barrel export
 */

// Types
export * from './types';

// Platform
export { detectPlatform } from './platform';

// Bridges
export {
  startDataWedgeListener,
  stopDataWedgeListener,
  isDataWedgeActive,
  simulateDataWedgeScan,
  sendDataWedgeCommand,
} from './DataWedgeBridge';

export {
  startRfidListener,
  stopRfidListener,
  isRfidListening,
  connectRfidReader,
  disconnectRfidReader,
  startRfidInventory,
  stopRfidInventory,
  triggerRfidRead,
  getRfidReaderStatus,
  getRecentTags,
  getUniqueTagCount,
  clearRecentTags,
  getTagReadCount,
  resetTagCounter,
  simulateRfidTag,
  simulateReaderStatus,
} from './ZebraRfidBridge';

export {
  startKeyboardListener,
  stopKeyboardListener,
  isKeyboardListenerActive,
} from './KeyboardFallbackBridge';

// Central service
export {
  initScanner,
  destroyScanner,
  setMode,
  getState,
  getRecentScanList,
  isInitialized,
  getHardwareHealth,
} from './ScannerService';

// STEG 11: hardware readiness + event fidelity + kontextmedveten RFID-dedupe
export { deriveHardwareHealth, canClaimScannerReady } from '@/lib/scanner/hardwareHealth';
export type { HardwareHealth, ScannerHealthState, BarcodeInputMode } from '@/lib/scanner/hardwareHealth';
export { toScanEventMeta, hasFullFidelity, queueScanSource } from '@/lib/scanner/scanEventFidelity';
export type { ScanEventMeta } from '@/lib/scanner/scanEventFidelity';
export { RfidDedupeTracker, rfidDedupeKey } from '@/lib/scanner/rfidDedupe';

// Queue
export {
  enqueueScan,
  updateScanStatus,
  getPendingScans,
  getQueueStats,
  clearSyncedScans,
  clearQueue,
  registerSyncHandler,
  startAutoSync,
  stopAutoSync,
  processQueue,
} from './ScanQueue';

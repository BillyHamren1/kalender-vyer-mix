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
} from './ScannerService';

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

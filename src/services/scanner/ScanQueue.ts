/**
 * ScanQueue — Offline queue for scan events
 * 
 * Stores scans locally when offline and syncs them when connectivity returns.
 * Works for both barcode and RFID scans.
 */

import { ScanEvent, QueuedScan, ScanSyncStatus } from './types';

const STORAGE_KEY = 'eventflow_scan_queue';
const MAX_QUEUE_SIZE = 500;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

type SyncHandler = (scan: ScanEvent) => Promise<boolean>;

let syncHandler: SyncHandler | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

// ── Queue Storage ────────────────────────────────────────────────

function loadQueue(): QueuedScan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedScan[]): void {
  try {
    // Trim to max size, keeping newest
    const trimmed = queue.slice(-MAX_QUEUE_SIZE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[ScanQueue] Failed to save queue:', e);
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Add a scan to the offline queue.
 */
export function enqueueScan(scan: ScanEvent, initialStatus: ScanSyncStatus = 'received'): void {
  const queue = loadQueue();
  queue.push({
    scan,
    syncStatus: initialStatus,
    retryCount: 0,
    lastAttempt: null,
  });
  saveQueue(queue);
}

/**
 * Update status of a queued scan.
 */
export function updateScanStatus(scanId: string, status: ScanSyncStatus, error?: string): void {
  const queue = loadQueue();
  const item = queue.find(q => q.scan.id === scanId);
  if (item) {
    item.syncStatus = status;
    if (error) item.error = error;
    saveQueue(queue);
  }
}

/**
 * Get all pending (unsynced) scans.
 */
export function getPendingScans(): QueuedScan[] {
  return loadQueue().filter(q => 
    q.syncStatus === 'received' || 
    q.syncStatus === 'processed_locally' ||
    q.syncStatus === 'failed'
  );
}

/**
 * Get queue stats.
 */
export function getQueueStats(): { total: number; pending: number; synced: number; failed: number } {
  const queue = loadQueue();
  return {
    total: queue.length,
    pending: queue.filter(q => q.syncStatus === 'received' || q.syncStatus === 'processed_locally').length,
    synced: queue.filter(q => q.syncStatus === 'synced').length,
    failed: queue.filter(q => q.syncStatus === 'failed').length,
  };
}

/**
 * Clear synced scans from queue (housekeeping).
 */
export function clearSyncedScans(): void {
  const queue = loadQueue().filter(q => q.syncStatus !== 'synced');
  saveQueue(queue);
}

/**
 * Clear entire queue.
 */
export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Sync Engine ──────────────────────────────────────────────────

/**
 * Register a sync handler that processes queued scans.
 */
export function registerSyncHandler(handler: SyncHandler): void {
  syncHandler = handler;
}

/**
 * Start automatic sync interval.
 */
export function startAutoSync(intervalMs: number = RETRY_DELAY_MS): void {
  if (syncInterval) return;
  syncInterval = setInterval(() => processQueue(), intervalMs);
  console.log(`[ScanQueue] Auto-sync started (${intervalMs}ms interval)`);
}

/**
 * Stop automatic sync.
 */
export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Process pending items in the queue.
 */
export async function processQueue(): Promise<number> {
  if (isSyncing || !syncHandler) return 0;
  if (!navigator.onLine) return 0;

  isSyncing = true;
  let synced = 0;

  try {
    const queue = loadQueue();
    const pending = queue.filter(q => 
      (q.syncStatus === 'received' || q.syncStatus === 'processed_locally' || q.syncStatus === 'failed') &&
      q.retryCount < MAX_RETRIES
    );

    for (const item of pending) {
      try {
        item.lastAttempt = Date.now();
        const success = await syncHandler(item.scan);
        if (success) {
          item.syncStatus = 'synced';
          synced++;
        } else {
          item.syncStatus = 'failed';
          item.retryCount++;
        }
      } catch (err: any) {
        item.syncStatus = 'failed';
        item.retryCount++;
        item.error = err.message || 'Sync error';
      }
    }

    saveQueue(queue);
  } finally {
    isSyncing = false;
  }

  return synced;
}

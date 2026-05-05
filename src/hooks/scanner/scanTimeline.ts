/**
 * Scan timeline — captures fine-grained timing for every scan so we can
 * see where the latency lives (camera, processor queue, API roundtrip,
 * UI update). Pure module state + tiny pub/sub so any component can read
 * the latest entries.
 *
 * NOTE: This is feedback/instrumentation only. It must not alter
 * business logic or scan results.
 */

export type ScanSource = 'camera' | 'datawedge' | 'rfid' | 'manual' | 'unknown';
export type ScanStatus =
  | 'detected'
  | 'queued'
  | 'sent_to_backend'
  | 'success'
  | 'failed'
  | 'duplicate'
  | 'unknown_product'
  | 'overscan'
  | 'error';

export interface ScanTimelineEntry {
  id: string;
  value: string;
  source: ScanSource;
  status: ScanStatus;
  productName?: string;
  detectedAt?: number;        // performance.now() in ms
  receivedAt?: number;
  apiStartAt?: number;
  apiEndAt?: number;
  // Derived (filled when apiEndAt is set or read on the fly)
  cameraToProcessorMs?: number;
  processorToApiStartMs?: number;
  apiRoundtripMs?: number;
  totalScanMs?: number;
  createdAt: number;          // Date.now() for display
}

const MAX_ENTRIES = 50;
const MATCH_WINDOW_MS = 8000;

let entries: ScanTimelineEntry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

const emit = () => {
  entries = entries.slice(0, MAX_ENTRIES);
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
};

const findActive = (value: string): ScanTimelineEntry | undefined => {
  const now = performance.now();
  return entries.find(
    (e) =>
      e.value === value &&
      (e.detectedAt ?? e.receivedAt ?? 0) > now - MATCH_WINDOW_MS &&
      !e.apiEndAt,
  );
};

const devLog = (event: string, data: Record<string, unknown>) => {
  // Always log — visible in production helps debug perceived slowness.
  console.log(`[SCAN_TIMING] ${event}`, data);
};

export const recordDetected = (params: {
  value: string;
  source: ScanSource;
}): ScanTimelineEntry => {
  const detectedAt = performance.now();
  const entry: ScanTimelineEntry = {
    id: `s${nextId++}`,
    value: params.value,
    source: params.source,
    status: 'detected',
    detectedAt,
    createdAt: Date.now(),
  };
  entries = [entry, ...entries];
  devLog('scan_detected', { id: entry.id, value: entry.value, source: entry.source, detectedAt });
  emit();
  return entry;
};

export const recordReceived = (value: string, sourceHint: ScanSource = 'unknown'): ScanTimelineEntry => {
  const receivedAt = performance.now();
  let entry = findActive(value);
  if (!entry) {
    entry = {
      id: `s${nextId++}`,
      value,
      source: sourceHint,
      status: 'queued',
      receivedAt,
      createdAt: Date.now(),
    };
    entries = [entry, ...entries];
  } else {
    entry.receivedAt = receivedAt;
    entry.status = 'queued';
    if (entry.detectedAt) {
      entry.cameraToProcessorMs = +(receivedAt - entry.detectedAt).toFixed(1);
    }
  }
  devLog('scan_received_by_processor', {
    id: entry.id,
    value,
    source: entry.source,
    cameraToProcessorMs: entry.cameraToProcessorMs,
  });
  emit();
  return entry;
};

export const recordApiStart = (value: string): ScanTimelineEntry | undefined => {
  const apiStartAt = performance.now();
  const entry = findActive(value);
  if (!entry) return undefined;
  entry.apiStartAt = apiStartAt;
  entry.status = 'sent_to_backend';
  if (entry.receivedAt) {
    entry.processorToApiStartMs = +(apiStartAt - entry.receivedAt).toFixed(1);
  }
  devLog('scan_api_started', {
    id: entry.id,
    value,
    processorToApiStartMs: entry.processorToApiStartMs,
  });
  emit();
  return entry;
};

export const recordApiEnd = (
  value: string,
  status: ScanStatus,
  productName?: string,
): ScanTimelineEntry | undefined => {
  const apiEndAt = performance.now();
  const entry = findActive(value);
  if (!entry) return undefined;
  entry.apiEndAt = apiEndAt;
  entry.status = status;
  entry.productName = productName;
  if (entry.apiStartAt) {
    entry.apiRoundtripMs = +(apiEndAt - entry.apiStartAt).toFixed(1);
  }
  const anchor = entry.detectedAt ?? entry.receivedAt;
  if (anchor) {
    entry.totalScanMs = +(apiEndAt - anchor).toFixed(1);
  }
  devLog('scan_api_finished', {
    id: entry.id,
    value,
    status,
    productName,
    apiRoundtripMs: entry.apiRoundtripMs,
    totalScanMs: entry.totalScanMs,
  });
  devLog('scan_timing_summary', {
    id: entry.id,
    value,
    source: entry.source,
    status,
    cameraToProcessorMs: entry.cameraToProcessorMs,
    processorToApiStartMs: entry.processorToApiStartMs,
    apiRoundtripMs: entry.apiRoundtripMs,
    totalScanMs: entry.totalScanMs,
  });
  emit();
  return entry;
};

export const getScanTimeline = (): ScanTimelineEntry[] => entries;

export const subscribeScanTimeline = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const clearScanTimeline = () => {
  entries = [];
  emit();
};

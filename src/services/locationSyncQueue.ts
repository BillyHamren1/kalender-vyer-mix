// Location (GPS) sync queue
// ------------------------------------------------------------------
// Architectural decision: GPS points must NEVER be fired off in a
// "best-effort, hope-the-network-is-up" way. They are the raw signal
// behind:
//   - presence detection (geofence enter/exit)
//   - travel detection
//   - workday backtracking & disputes
//
// To keep that signal intact we mirror the timer queue pattern:
//   1. Every captured point is persisted to localStorage first.
//   2. A background flush pushes points to the server with retry +
//      exponential backoff and survives reloads / offline periods.
//   3. Stable ids prevent duplicate uploads when flush runs twice
//      (focus + online + interval can all fire near-simultaneously).
//   4. Auto-flush triggers on `online` and `focus` events plus a
//      timer wake-up scheduled from the soonest `nextAttemptAt`.
//
// Same constraints as the timer queue: no external deps, tiny surface,
// resilient to JSON corruption, and never throws to callers.
// ------------------------------------------------------------------

import { mobileApi } from './mobileApiService';

const QUEUE_KEY = 'eventflow-location-sync-queue';

// Hard cap so a multi-day offline session can't grow the queue
// unboundedly and blow past the localStorage quota. Oldest points are
// dropped first because newer GPS data is always more actionable.
const MAX_QUEUE_SIZE = 2000;

export type LocationPointSource =
  | 'background'
  | 'foreground'
  | 'geofence'
  | 'manual'
  | 'heartbeat';

export type LocationPointStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export type BatterySource = 'capacitor_device' | 'unavailable' | 'error';

export interface PendingLocationPoint {
  id: string;
  recordedAt: string;       // ISO timestamp from the device clock
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  source: LocationPointSource;
  status: LocationPointStatus;
  attempts: number;
  nextAttemptAt: number;    // epoch ms
  createdAt: number;        // epoch ms — when enqueued locally
  // ── Battery diagnostics (optional; older queued points won't have these) ──
  batteryLevel?: number | null;          // 0–1
  batteryPercent?: number | null;        // 0–100
  isCharging?: boolean | null;
  batteryCapturedAt?: string | null;     // ISO
  batterySource?: BatterySource | null;
}

type Listener = (queue: PendingLocationPoint[]) => void;
const listeners = new Set<Listener>();

const BACKOFF_MS = [0, 2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000];

function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

// ── DEBUG STATUS ──
// Lightweight observability for the internal debug panel. Persisted so a
// hot reload / navigation doesn't wipe it.
const STATUS_KEY = 'eventflow-location-sync-status';

export interface LocationSyncStatus {
  isFlushing: boolean;
  lastEnqueuedAt: number | null;
  lastEnqueuedSource: LocationPointSource | null;
  lastUploadAt: number | null;
  lastUploadAccepted: number;
  lastUploadRejected: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
}

const DEFAULT_STATUS: LocationSyncStatus = {
  isFlushing: false,
  lastEnqueuedAt: null,
  lastEnqueuedSource: null,
  lastUploadAt: null,
  lastUploadAccepted: 0,
  lastUploadRejected: 0,
  lastErrorAt: null,
  lastErrorMessage: null,
};

type StatusListener = (status: LocationSyncStatus) => void;
const statusListeners = new Set<StatusListener>();

function loadStatus(): LocationSyncStatus {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return { ...DEFAULT_STATUS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATUS, ...parsed, isFlushing: false };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

let statusCache: LocationSyncStatus = loadStatus();

function patchStatus(patch: Partial<LocationSyncStatus>) {
  statusCache = { ...statusCache, ...patch };
  try {
    const { isFlushing: _drop, ...persisted } = statusCache;
    localStorage.setItem(STATUS_KEY, JSON.stringify(persisted));
  } catch { /* ignore */ }
  for (const l of statusListeners) {
    try { l(statusCache); } catch { /* ignore */ }
  }
}

export function getLocationSyncStatus(): LocationSyncStatus {
  return statusCache;
}

export function subscribeLocationSyncStatus(l: StatusListener): () => void {
  statusListeners.add(l);
  l(statusCache);
  return () => { statusListeners.delete(l); };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `loc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadQueue(): PendingLocationPoint[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (p): p is PendingLocationPoint =>
        p &&
        typeof p.id === 'string' &&
        typeof p.latitude === 'number' &&
        typeof p.longitude === 'number',
    );
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingLocationPoint[]) {
  // Enforce upper bound — drop oldest first
  const trimmed =
    queue.length > MAX_QUEUE_SIZE
      ? queue.slice(queue.length - MAX_QUEUE_SIZE)
      : queue;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // Quota exceeded — aggressively trim and retry once
    try {
      const half = trimmed.slice(Math.floor(trimmed.length / 2));
      localStorage.setItem(QUEUE_KEY, JSON.stringify(half));
    } catch {
      // Give up silently — losing GPS history is preferable to crashing
      console.warn('[LocationSync] saveQueue failed:', (err as any)?.message || err);
    }
  }
  for (const l of listeners) {
    try { l(trimmed); } catch { /* ignore */ }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('location-sync-queue-changed'));
  }
}

export function subscribeLocationQueue(l: Listener): () => void {
  listeners.add(l);
  l(loadQueue());
  return () => {
    listeners.delete(l);
  };
}

export function getPendingLocationPoints(): PendingLocationPoint[] {
  return loadQueue().filter(p => p.status !== 'uploaded');
}

/**
 * Wipe the entire queue. Used on logout / user switch so one user's
 * pending GPS points never get attributed to another session.
 */
export function clearLocationQueue() {
  saveQueue([]);
}

export interface EnqueueLocationPointInput {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  source: LocationPointSource;
  recordedAt?: string;
  /** Optional caller-supplied id for idempotency across hot reloads */
  id?: string;
  // ── Battery diagnostics (optional) ──
  batteryLevel?: number | null;
  batteryPercent?: number | null;
  isCharging?: boolean | null;
  batteryCapturedAt?: string | null;
  batterySource?: BatterySource | null;
}

/**
 * Persist a GPS point and trigger a flush. Always returns the id of
 * the stored point. Duplicate ids (or same lat/lng/recordedAt within
 * the same second) are coalesced.
 */
export function enqueueLocationPoint(input: EnqueueLocationPointInput): string {
  const queue = loadQueue();
  const recordedAt = input.recordedAt || new Date().toISOString();
  const id = input.id || generateId();

  // De-dup #1: explicit id collision
  const existingById = queue.find(p => p.id === id);
  if (existingById) return existingById.id;

  // De-dup #2: identical sample within the same second from the same source
  const recordedSecond = recordedAt.slice(0, 19);
  const dup = queue.find(
    p =>
      p.source === input.source &&
      p.latitude === input.latitude &&
      p.longitude === input.longitude &&
      p.recordedAt.slice(0, 19) === recordedSecond,
  );
  if (dup) return dup.id;

  const point: PendingLocationPoint = {
    id,
    recordedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy ?? null,
    speed: input.speed ?? null,
    source: input.source,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Date.now(),
    createdAt: Date.now(),
    batteryLevel: input.batteryLevel ?? null,
    batteryPercent: input.batteryPercent ?? null,
    isCharging: input.isCharging ?? null,
    batteryCapturedAt: input.batteryCapturedAt ?? null,
    batterySource: input.batterySource ?? null,
  };

  queue.push(point);
  saveQueue(queue);
  patchStatus({
    lastEnqueuedAt: Date.now(),
    lastEnqueuedSource: input.source,
  });
  void flushLocationQueue();
  return id;
}

let flushing = false;
let flushTimeoutId: number | null = null;

function scheduleNextFlush() {
  const remaining = loadQueue().filter(p => p.status !== 'uploaded');
  if (remaining.length === 0) return;
  const soonest = Math.min(
    ...remaining.map(p => Math.max(0, p.nextAttemptAt - Date.now())),
  );
  if (flushTimeoutId !== null) {
    window.clearTimeout(flushTimeoutId);
  }
  flushTimeoutId = window.setTimeout(() => {
    flushTimeoutId = null;
    void flushLocationQueue();
  }, Math.max(1_000, soonest)) as unknown as number;
}

/**
 * Flush all due GPS points to the server. Safe to call concurrently —
 * a single in-flight flush is enforced via the `flushing` guard so
 * `online`, `focus`, and the wake-up timer can all fire freely.
 */
export async function flushLocationQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Offline — schedule a re-check when the network returns.
    return;
  }
  flushing = true;
  patchStatus({ isFlushing: true });
  try {
    const queue = loadQueue();
    const now = Date.now();
    const due = queue.filter(
      p => p.status !== 'uploaded' && p.nextAttemptAt <= now,
    );
    if (due.length === 0) return;

    // Mark as uploading first so concurrent enqueues don't reset attempts.
    {
      const map = new Map(due.map(p => [p.id, p]));
      const updated = loadQueue().map(p =>
        map.has(p.id) ? { ...p, status: 'uploading' as LocationPointStatus } : p,
      );
      saveQueue(updated);
    }

    // Process oldest-first so timeline ordering on the server is stable.
    due.sort((a, b) => a.createdAt - b.createdAt);

    // Chunk to keep the request payload reasonable and to bound retry blast
    // radius if the server rejects a single batch.
    const CHUNK = 100;
    for (let i = 0; i < due.length; i += CHUNK) {
      const chunk = due.slice(i, i + CHUNK);
      try {
        const res = await mobileApi.uploadLocationBatch(
          chunk.map(p => ({
            id: p.id,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
            speed: p.speed,
            source: p.source,
            recordedAt: p.recordedAt,
            batteryLevel: p.batteryLevel ?? null,
            batteryPercent: p.batteryPercent ?? null,
            isCharging: p.isCharging ?? null,
            batteryCapturedAt: p.batteryCapturedAt ?? null,
            batterySource: p.batterySource ?? null,
          })),
        );

        const acceptedIds = new Set(res?.accepted || []);
        const rejectedIds = new Set((res?.rejected || []).map(r => r.id));

        patchStatus({
          lastUploadAt: Date.now(),
          lastUploadAccepted: acceptedIds.size,
          lastUploadRejected: rejectedIds.size,
        });

        // Drop accepted points; bump attempts for rejected so we back off.
        const after = loadQueue();
        const next: PendingLocationPoint[] = [];
        for (const row of after) {
          if (acceptedIds.has(row.id)) continue; // confirmed by server
          if (rejectedIds.has(row.id)) {
            const attempts = row.attempts + 1;
            next.push({
              ...row,
              status: 'failed',
              attempts,
              nextAttemptAt: Date.now() + backoffFor(attempts),
            });
            continue;
          }
          next.push(row);
        }
        saveQueue(next);
      } catch (err: any) {
        // Whole-chunk failure (network / 5xx) — retry with backoff.
        const chunkIds = new Set(chunk.map(p => p.id));
        const after = loadQueue().map(p => {
          if (!chunkIds.has(p.id)) return p;
          const attempts = p.attempts + 1;
          return {
            ...p,
            status: 'failed' as LocationPointStatus,
            attempts,
            nextAttemptAt: Date.now() + backoffFor(attempts),
          };
        });
        saveQueue(after);
        const msg = err?.message || String(err);
        patchStatus({
          lastErrorAt: Date.now(),
          lastErrorMessage: msg,
        });
        console.warn(
          '[LocationSync] batch upload failed, will retry:',
          chunk.length,
          'points,',
          msg,
        );
      }
    }
  } finally {
    flushing = false;
    patchStatus({ isFlushing: false });
    scheduleNextFlush();
  }
}

// ── AUTO-FLUSH TRIGGERS ──
// Mirror the timer queue's recovery surface so GPS points have at least as
// many resync opportunities as timer starts. Each trigger is no-op safe:
//   - flushLocationQueue() guards against concurrent runs via `flushing`
//   - successful uploads are idempotent on the server (dedupe by recorded_at)
//   - failed chunks back off and retry on the next trigger
//
// We intentionally DO NOT touch timerSyncQueue here — it manages its own
// online/focus/module-load triggers in src/services/timerSyncQueue.ts.
if (typeof window !== 'undefined') {
  // Network back online — most common offline → online recovery.
  window.addEventListener('online', () => {
    void flushLocationQueue();
  });

  // Tab/window regains focus (web + foregrounded WebView).
  window.addEventListener('focus', () => {
    void flushLocationQueue();
  });

  // Tab becomes visible again — fires when user switches back from another
  // app on mobile WebView even when `focus` doesn't (iOS PWA quirk).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void flushLocationQueue();
      }
    });
  }

  // Native app foreground (Capacitor). Best-effort dynamic import so this
  // file stays usable in pure-web tests where @capacitor/app isn't installed.
  // Critical on iOS where `focus` / `visibilitychange` are unreliable when
  // the app resumes from a long background period.
  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void flushLocationQueue();
      });
      App.addListener('resume', () => {
        void flushLocationQueue();
      });
    } catch {
      // Not running under Capacitor — fine, web triggers above cover it.
    }
  })();

  // App start — resume any leftover work from the previous session
  // (offline period, force-quit, crash, etc.).
  void flushLocationQueue();
}


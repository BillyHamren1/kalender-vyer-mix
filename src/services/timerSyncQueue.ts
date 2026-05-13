// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
// Timer sync queue
// ------------------------------------------------------------------
// Architectural decision: ALL timer starts (location, booking, project)
// are mirrored to the server in `location_time_entries`. The server is
// the source of truth.
//
// To keep UI snappy without losing data on flaky networks, we:
//   1. Generate a stable client_dedupe_key per intent.
//   2. Optimistically reflect the timer in localStorage / UI.
//   3. Push the start to the server through a persistent queue.
//   4. On success, mark the timer as synced and reconcile start time.
//   5. On failure, retry with exponential backoff. The timer stays
//      visible (flagged "syncing") so it never silently disappears.
//
// The queue is intentionally tiny — no external deps. It survives
// reloads via localStorage and resumes on app boot / network recovery.
// ------------------------------------------------------------------

import { mobileApi } from './mobileApiService';

const QUEUE_KEY = 'eventflow-timer-sync-queue';

export interface PendingTimerStart {
  /** Local timer key (e.g. "project-<uuid>", "location-<uuid>", "<bookingUuid>") */
  timerKey: string;
  /** Unique client-generated id used for server-side idempotency */
  clientDedupeKey: string;
  /** Exactly one of these must be set */
  locationId?: string;
  bookingId?: string;
  largeProjectId?: string;
  taskId?: string;
  /** ISO start time (optimistic/local) */
  startedAt: string;
  /** Retry bookkeeping */
  attempts: number;
  nextAttemptAt: number;
  /** When the user pressed start */
  enqueuedAt: number;
}

type Listener = (queue: PendingTimerStart[]) => void;
const listeners = new Set<Listener>();

function loadQueue(): PendingTimerStart[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingTimerStart[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  for (const l of listeners) {
    try { l(queue); } catch { /* ignore */ }
  }
  // Cross-component notification
  window.dispatchEvent(new Event('timer-sync-queue-changed'));
}

export function subscribeTimerSyncQueue(l: Listener): () => void {
  listeners.add(l);
  l(loadQueue());
  return () => listeners.delete(l);
}

export function getPendingTimerStarts(): PendingTimerStart[] {
  return loadQueue();
}

export function isTimerPendingSync(timerKey: string): boolean {
  return loadQueue().some(p => p.timerKey === timerKey);
}

export function generateDedupeKey(): string {
  // crypto.randomUUID is available in modern browsers and Capacitor WebView
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enqueue a timer start. Returns the dedupe key. Triggers a flush attempt.
 */
export function enqueueTimerStart(
  params: Omit<PendingTimerStart, 'attempts' | 'nextAttemptAt' | 'enqueuedAt' | 'clientDedupeKey'> & {
    clientDedupeKey?: string;
  },
): string {
  const queue = loadQueue();
  // De-dup: if there is already a pending start for the same timerKey, reuse it.
  const existing = queue.find(p => p.timerKey === params.timerKey);
  if (existing) {
    return existing.clientDedupeKey;
  }
  const dedupeKey = params.clientDedupeKey || generateDedupeKey();
  queue.push({
    timerKey: params.timerKey,
    clientDedupeKey: dedupeKey,
    locationId: params.locationId,
    bookingId: params.bookingId,
    largeProjectId: params.largeProjectId,
    taskId: params.taskId,
    startedAt: params.startedAt,
    attempts: 0,
    nextAttemptAt: Date.now(),
    enqueuedAt: Date.now(),
  });
  saveQueue(queue);
  // Fire-and-forget flush
  void flushQueue();
  return dedupeKey;
}

/**
 * Remove a pending start (e.g. after success, or if user stops timer
 * before it has even synced).
 */
export function removeFromQueue(timerKey: string) {
  const queue = loadQueue().filter(p => p.timerKey !== timerKey);
  saveQueue(queue);
}

/**
 * Wipe ALL pending timer-start jobs. Called on logout / user switch so
 * the queue can never fire one user's pending start against another
 * user's session token.
 *
 * SAFETY: this drops local intent only. Any start that already reached
 * the server is unaffected and remains source-of-truth on the server.
 */
export function clearTimerSyncQueue() {
  saveQueue([]);
}

let flushing = false;
let flushTimeoutId: number | null = null;

const BACKOFF_MS = [0, 2_000, 5_000, 15_000, 30_000, 60_000, 120_000];

function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/**
 * Try to push every pending start to the server. Safe to call repeatedly.
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const queue = loadQueue();
    const now = Date.now();
    const due = queue.filter(p => p.nextAttemptAt <= now);

    for (const item of due) {
      try {
        const res = await mobileApi.startLocationTimer({
          location_id: item.locationId,
          booking_id: item.bookingId,
          large_project_id: item.largeProjectId,
          task_id: item.taskId,
          started_at: item.startedAt,
          client_dedupe_key: item.clientDedupeKey,
        });

        // RACE GUARD (2026-05): server told us this start would re-open
        // a window that was already stopped/reported. Drop the pending
        // start AND any local optimistic timer for this key.
        if (res?.status === 'already_closed_or_consumed') {
          removeFromQueue(item.timerKey);
          window.dispatchEvent(
            new CustomEvent('timer-sync-rejected', {
              detail: {
                timerKey: item.timerKey,
                reason: res?.reason || 'already_closed_or_consumed',
                entry: res?.entry || null,
              },
            }),
          );
          continue;
        }

        // Success — emit a reconcile event so UI can adopt server start time.
        const serverStart: string | undefined = res?.entry?.entered_at;
        const serverEntryId: string | undefined = res?.entry?.id;
        window.dispatchEvent(
          new CustomEvent('timer-sync-confirmed', {
            detail: {
              timerKey: item.timerKey,
              serverStartedAt: serverStart,
              serverEntryId,
              alreadyActive: !!res?.already_active,
            },
          }),
        );
        removeFromQueue(item.timerKey);
      } catch (err: any) {
        // Network / server error — keep in queue with backoff.
        const updated = loadQueue();
        const idx = updated.findIndex(p => p.timerKey === item.timerKey);
        if (idx >= 0) {
          updated[idx].attempts += 1;
          updated[idx].nextAttemptAt = Date.now() + backoffFor(updated[idx].attempts);
          saveQueue(updated);
        }
        console.warn('[TimerSync] start failed, will retry:', item.timerKey, err?.message || err);
      }
    }

    // Schedule next wake-up if anything still pending
    const remaining = loadQueue();
    if (remaining.length > 0) {
      const soonest = Math.min(...remaining.map(p => Math.max(0, p.nextAttemptAt - Date.now())));
      if (flushTimeoutId !== null) {
        window.clearTimeout(flushTimeoutId);
      }
      flushTimeoutId = window.setTimeout(() => {
        flushTimeoutId = null;
        void flushQueue();
      }, Math.max(1_000, soonest)) as unknown as number;
    }
  } finally {
    flushing = false;
  }
}

// Auto-flush when the network comes back / tab regains focus.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
  window.addEventListener('focus', () => { void flushQueue(); });
  // Kick once on module load to retry any leftover items.
  void flushQueue();
}

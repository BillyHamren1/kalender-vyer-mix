/**
 * Server-triggered "ping the phone" handler.
 *
 * Flow:
 *   1. Admin calls the `request-location-ping` edge function with a list
 *      of staff_ids.
 *   2. That function dispatches an FCM data-message with
 *      `data.notification_type = "location_ping"`.
 *   3. The mobile app receives the push, and `pushNotificationService`
 *      re-broadcasts it as a `push-notification-received` window event.
 *   4. `initLocationPingHandler()` (mounted once at app start) catches that
 *      event, asks the OS for a fresh GPS sample, and pushes it into
 *      `locationSyncQueue` so the queue's normal flush uploads it to
 *      `staff_locations`.
 *
 * The dispatcher (`handleLocationPingPush`) is exported as a pure function
 * so the unit test can verify the contract without touching window or
 * Capacitor APIs.
 */

import { enqueueLocationPoint, flushLocationQueue, forceFlushLocationQueue } from './locationSyncQueue';

export interface LocationPingNotification {
  data?: Record<string, unknown> | null | undefined;
}

export interface LocationPingDeps {
  /** Resolve a fresh GPS reading. Reject if unavailable / denied. */
  getCurrentPosition: () => Promise<{
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
  }>;
  /** Persist the point into the sync queue (defaults to the real queue). */
  enqueue?: typeof enqueueLocationPoint;
  /** Trigger an immediate flush (defaults to the real flush). */
  flush?: typeof flushLocationQueue;
  /** Logger hook for debugging — optional. */
  log?: (msg: string, extra?: unknown) => void;
}

export interface LocationPingResult {
  handled: boolean;
  reason?:
    | 'wrong-type'
    | 'missing-data'
    | 'gps-failed'
    | 'enqueued';
  pointId?: string;
}

/**
 * Pure handler: given a notification payload, decide whether it's a
 * location_ping and (if so) capture+enqueue a fresh GPS sample.
 *
 * Returns a structured result so callers and tests can branch on it.
 */
export async function handleLocationPingPush(
  notification: LocationPingNotification,
  deps: LocationPingDeps,
): Promise<LocationPingResult> {
  const data = notification?.data;
  if (!data || typeof data !== 'object') {
    return { handled: false, reason: 'missing-data' };
  }
  if (data.notification_type !== 'location_ping') {
    return { handled: false, reason: 'wrong-type' };
  }

  const enqueue = deps.enqueue ?? enqueueLocationPoint;
  const flush = deps.flush ?? (() => forceFlushLocationQueue('location_ping'));
  const log = deps.log ?? ((msg: string, extra?: unknown) =>
    console.log(`[LocationPing] ${msg}`, extra ?? ''));

  let pos: Awaited<ReturnType<LocationPingDeps['getCurrentPosition']>>;
  try {
    pos = await deps.getCurrentPosition();
  } catch (err) {
    log('getCurrentPosition failed', err);
    return { handled: true, reason: 'gps-failed' };
  }

  const reason = typeof data.reason === 'string' ? data.reason : 'admin_request';
  const requestedAt = typeof data.requested_at === 'string' ? data.requested_at : null;

  const id = enqueue({
    latitude: pos.latitude,
    longitude: pos.longitude,
    accuracy: pos.accuracy ?? null,
    speed: pos.speed ?? null,
    source: 'location_ping',
    // Use the server-supplied timestamp as a stable id so a duplicate FCM
    // delivery doesn't double-upload the same ping.
    id: requestedAt ? `ping-${requestedAt}` : undefined,
  });

  log('enqueued ping', { id, reason });

  // location_ping är en explicit serverbegäran om färsk position, därför
  // force-flushar vi efter enqueue (kön auto-flushar inte längre).
  void flush();

  return { handled: true, reason: 'enqueued', pointId: id };
}

/**
 * Mount the global window-event listener. Idempotent — calling it twice
 * is a no-op so it's safe to invoke from multiple init points.
 */
let mounted = false;
export function initLocationPingHandler(deps: LocationPingDeps): () => void {
  if (typeof window === 'undefined') return () => {};
  if (mounted) return () => {};
  mounted = true;

  const onPush = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as LocationPingNotification | undefined;
    if (!detail) return;
    void handleLocationPingPush(detail, deps);
  };

  window.addEventListener('push-notification-received', onPush);
  return () => {
    window.removeEventListener('push-notification-received', onPush);
    mounted = false;
  };
}

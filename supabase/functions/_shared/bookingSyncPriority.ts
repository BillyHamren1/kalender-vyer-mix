/**
 * Priority policy for Booking -> Planning synchronization.
 *
 * The numeric values are persisted in booking_sync_jobs and intentionally
 * leave room for future levels. Status transitions are operationally critical
 * and must always pass routine incremental refreshes in the queue.
 */
export const BOOKING_SYNC_PRIORITY = {
  incremental: 0,
  offer: 20,
  created: 40,
  updated: 60,
  critical: 100,
} as const;

export function normalizeBookingSyncEvent(eventType?: string | null): string {
  return (eventType || "unknown").replace(/_/g, ".").toLowerCase();
}

export function bookingSyncPriority(eventType?: string | null): number {
  switch (normalizeBookingSyncEvent(eventType)) {
    case "booking.confirmed":
    case "booking.cancelled":
      return BOOKING_SYNC_PRIORITY.critical;
    case "booking.updated":
      return BOOKING_SYNC_PRIORITY.updated;
    case "booking.created":
      return BOOKING_SYNC_PRIORITY.created;
    case "booking.offer":
      return BOOKING_SYNC_PRIORITY.offer;
    case "booking.incremental":
    case "booking.full.sync":
    case "booking.historical":
      return BOOKING_SYNC_PRIORITY.incremental;
    default:
      return BOOKING_SYNC_PRIORITY.offer;
  }
}

export function shouldReplaceQueuedEvent(
  currentEventType: string | null | undefined,
  incomingEventType: string | null | undefined,
): boolean {
  const currentPriority = bookingSyncPriority(currentEventType);
  const incomingPriority = bookingSyncPriority(incomingEventType);
  if (incomingPriority !== currentPriority) return incomingPriority > currentPriority;

  // At equal critical priority, the latest state transition is the useful hint.
  return incomingPriority === BOOKING_SYNC_PRIORITY.critical;
}

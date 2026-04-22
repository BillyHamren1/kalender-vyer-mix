/**
 * workdayServerSync — fire-and-forget glue between client events and the
 * `workday` edge function.
 *
 * Why a module instead of using `useWorkDay` directly:
 *  - `useTimerStartFlow` and `GlobalActiveTimerBanner` need to trigger
 *    workday start/end as side effects, not in render. Calling a hook
 *    from a callback is awkward (and forbidden in some paths).
 *  - This module is safe to call without an auth context — it no-ops
 *    when no token is present, so test flows won't blow up.
 *
 * Both functions are idempotent on the server, so duplicate calls (for
 * example: ten timers start in the same second) are harmless.
 */
import { workdayApi } from './workdayApi';

let lastStartAt = 0;
let inFlightStart: Promise<void> | null = null;

/**
 * Sync the workday-start to the server. Debounces locally so a burst of
 * timer-starts doesn't fan out into ten requests; the edge function is
 * idempotent regardless.
 */
export function syncWorkDayStart(startedAtIso?: string): void {
  const now = Date.now();
  if (inFlightStart) return;
  if (now - lastStartAt < 1500) return;
  lastStartAt = now;
  inFlightStart = workdayApi
    .start(startedAtIso ? { startedAtIso } : {})
    .then(() => undefined)
    .catch((err) => {
      // Soft-fail: localStorage WorkDayTimer continues to work; server
      // will catch up on the next event.
      console.warn('[workday] start sync failed:', err?.message || err);
    })
    .finally(() => {
      inFlightStart = null;
    });
}

/**
 * Sync the workday-end to the server. Called from
 * GlobalActiveTimerBanner.processNextEod once the EOD queue is drained.
 */
export function syncWorkDayEnd(endedAtIso?: string): void {
  workdayApi
    .end(endedAtIso ? { endedAtIso } : {})
    .catch((err) => {
      console.warn('[workday] end sync failed:', err?.message || err);
    });
}

/** @internal — for tests only. Resets debounce state. */
export function __resetWorkDaySyncForTests(): void {
  lastStartAt = 0;
  inFlightStart = null;
}

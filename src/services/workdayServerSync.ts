/**
 * workdayServerSync — glue between client events and the `workday` edge
 * function.
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
 *
 * START is fire-and-forget (debounced) — useTimerStartFlow already has
 * its own hard `ensureWorkDayActive` gate before any activity starts,
 * so this is just a cheap "burst-collapse" helper.
 *
 * END is AWAITABLE (returns Promise<{ ok, error? }>) — the EOD pipeline
 * must not declare the workday closed in UI/state until the server has
 * actually closed the workday row. The previous fire-and-forget version
 * caused a split-truth bug where local state showed "ended" while the
 * server's `workdays` row was still open.
 */
import { workdayApi } from './workdayApi';

let lastStartAt = 0;
let inFlightStart: Promise<void> | null = null;

/**
 * Sync the workday-start to the server. Debounces locally so a burst of
 * timer-starts doesn't fan out into ten requests; the edge function is
 * idempotent regardless. Soft-fail by design — `useTimerStartFlow` owns
 * the hard "no activity without workday" gate.
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
      console.warn('[workday] start sync failed:', err?.message || err);
    })
    .finally(() => {
      inFlightStart = null;
    });
}

export interface WorkDayEndResult {
  ok: boolean;
  error?: string;
}

/**
 * Close the workday on the server. AWAITABLE — callers MUST await this
 * and only mark the workday ended in local state/UI on `ok: true`.
 *
 * Never throws. Returns a structured result instead so callers can
 * render a calm error without try/catch noise.
 */
export async function syncWorkDayEnd(endedAtIso?: string): Promise<WorkDayEndResult> {
  try {
    await workdayApi.end(endedAtIso ? { endedAtIso } : {});
    return { ok: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('[workday] end sync failed:', msg);
    return { ok: false, error: msg };
  }
}

/** @internal — for tests only. Resets debounce state. */
export function __resetWorkDaySyncForTests(): void {
  lastStartAt = 0;
  inFlightStart = null;
}

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

export interface WorkDayEndResult {
  ok: boolean;
  error?: string;
}

/**
 * Sync the workday-end to the server. Awaitable: callers MUST check the
 * returned `ok` before marking local state as ended. Source of truth is
 * the server `workdays` row — local cache must never claim ended unless
 * the server has confirmed.
 */
export async function syncWorkDayEnd(endedAtIso?: string): Promise<WorkDayEndResult> {
  try {
    await workdayApi.end(endedAtIso ? { endedAtIso } : {});
    // Notifiera lyssnare (t.ex. useStaleDayReminder) att en arbetsdag just
    // avslutades — bra trigger för att kontrollera om gårdagen ligger kvar.
    try {
      window.dispatchEvent(new CustomEvent('workday-ended', { detail: { endedAtIso } }));
    } catch { /* no-op (SSR/test) */ }
    return { ok: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('[workday] end sync failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Auto-start trigger sources. Used as audit trail in `workdays.notes` so
 * we can later answer "varför startades dagen?" without guessing.
 */
export type WorkDayAutoStartTrigger =
  | 'geofence_enter'
  | 'travel_start'
  | 'arrival_report'
  | 'ai_reconciled';

/**
 * Autostart wrapper around `syncWorkDayStart` that stamps the trigger
 * source into `workdays.notes` (e.g. "Autostarted: geofence_enter").
 *
 * Uses the same fire-and-forget semantics + debounce as `syncWorkDayStart`:
 * safe to call from multiple places (geofence ENTER, travel start, arrival
 * report) within the same second — only the first call hits the server.
 *
 * The server endpoint is idempotent: if a workday is already open, the
 * existing row is returned and `notes` is NOT overwritten. Only the very
 * first autostart per day records its trigger, which is exactly what we
 * want for the audit trail.
 */
export function autoStartWorkDay(
  trigger: WorkDayAutoStartTrigger,
  opts: { startedAtIso?: string } = {},
): void {
  const now = Date.now();
  if (inFlightStart) return;
  if (now - lastStartAt < 1500) return;
  lastStartAt = now;
  const notes = `Autostarted: ${trigger}`;
  inFlightStart = workdayApi
    .start({ ...(opts.startedAtIso ? { startedAtIso: opts.startedAtIso } : {}), notes })
    .then(() => undefined)
    .catch((err) => {
      console.warn(`[workday] autostart (${trigger}) failed:`, err?.message || err);
    })
    .finally(() => {
      inFlightStart = null;
    });
}

/** @internal — for tests only. Resets debounce state. */
export function __resetWorkDaySyncForTests(): void {
  lastStartAt = 0;
  inFlightStart = null;
}

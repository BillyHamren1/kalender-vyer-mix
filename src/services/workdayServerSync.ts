// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
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
  inFlightEnd = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL END-DAY ROUTINE
// ─────────────────────────────────────────────────────────────────────────────
//
// `endWorkdayFlow` är den ENDA sanktionerade vägen att avsluta en arbetsdag.
// Både manuell "Avsluta dag"-knapp (GlobalActiveTimerBanner) och hemkomst-
// auto-end (useEndDayOnArrivalHome) ska gå genom denna rutin.
//
// Ordning (server-first):
//   1. Caller har redan stoppat ev. aktiva activity-timers via stopSession
//      (ger time_reports). Det görs UTANFÖR denna rutin eftersom det kräver
//      React-hooks (useWorkSession). endWorkdayFlow förutsätter att alla
//      activity-timers är stoppade när den anropas.
//   2. Anropa workday edge function -> end (server är source of truth).
//   3. Vid OK: markera lokal cache, dispatcha 'workday-ended'-event.
//   4. Vid FEL: returnera { ok:false, needsReview:true } — caller får
//      visa fallback-UI / toast. Lokal cache rörs INTE; dagen är inte
//      avslutad.
//
// Idempotent och de-dupad: parallella anrop slås ihop.

let inFlightEnd: Promise<EndWorkdayFlowResult> | null = null;

export interface EndWorkdayFlowResult {
  ok: boolean;
  /** True när servern misslyckades — UI ska markera dagen som behöver review. */
  needsReview?: boolean;
  error?: string;
}

export interface EndWorkdayFlowOptions {
  /** ISO-tidpunkt för avslutet. Default: nu. */
  endedAtIso?: string;
}

export async function endWorkdayFlow(
  opts: EndWorkdayFlowOptions = {},
): Promise<EndWorkdayFlowResult> {
  if (inFlightEnd) return inFlightEnd;

  const run = (async (): Promise<EndWorkdayFlowResult> => {
    // Lazy-import för att undvika cykler (workdayState importerar inte
    // workdayServerSync, men workdayState används bara här på success-path).
    const { markWorkdayEnded } = await import('./workdayState');

    const result = await syncWorkDayEnd(opts.endedAtIso);
    if (!result.ok) {
      // Lämna lokal state orörd — dagen är INTE avslutad.
      return { ok: false, needsReview: true, error: result.error };
    }
    // Server bekräftade. Nu får lokal cache och lyssnare uppdateras.
    markWorkdayEnded(opts.endedAtIso);
    // syncWorkDayEnd dispatchar redan 'workday-ended'-eventet vid framgång,
    // så vi behöver inte göra det igen här.
    return { ok: true };
  })();

  inFlightEnd = run;
  try {
    return await run;
  } finally {
    inFlightEnd = null;
  }
}

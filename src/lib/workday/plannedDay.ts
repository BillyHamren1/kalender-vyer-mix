/**
 * plannedDay — PLANNING-AWARE DECISIONS FOR THE TIMER ENGINE
 * ==========================================================
 *
 * Pure utility shared by:
 *   • mobile geofence EXIT logic (decide whether to auto-stop / start
 *     travel / show "where are you going?" prompt)
 *   • the `close-stale-workday-entries` server watchdog (cap auto-close
 *     time at the planned end-of-day instead of `started_at + 8h`)
 *
 * Inputs are the same data the rest of the system already loads:
 *   - the staff's `MobileBooking[]` for today (already filtered by
 *     `booking_staff_assignments` server-side)
 *   - the current time (`Date | string | number`)
 *
 * No I/O, no React, no Supabase — so the same code path can be imported
 * verbatim into a Deno edge function.
 *
 * Time fields used (in priority order, latest wins):
 *   1. `event_end_time`    — the actual customer-facing event end
 *   2. `rigdown_end_time`  — rigdown phase end
 *   3. `rig_end_time`      — rig (setup) phase end (only if no event/rigdown)
 *
 * Date fields paired with each:
 *   - event_end_time   → eventdate
 *   - rigdown_end_time → rigdowndate
 *   - rig_end_time     → rigdaydate
 *
 * If a booking has no times at all it contributes nothing — we never
 * fabricate a planned end.
 */

import type { MobileBooking } from '@/services/mobileApiService';

/** Default ± window around the planned end where an exit is "on time". */
export const DEFAULT_GRACE_MINUTES = 30;

export interface PlannedDaySignals {
  /**
   * The latest scheduled end-of-activity for the staff today, across all
   * their bookings. ISO 8601 (UTC). `null` when no booking has time data.
   */
  plannedEndOfDay: string | null;
  /**
   * True when at least one booking still has a phase that starts AFTER
   * `now` (i.e. there is more work scheduled later today).
   */
  hasMoreActivitiesToday: boolean;
  /**
   * True when `now` falls within ±`graceMinutes` of `plannedEndOfDay`.
   * False (and `null`-safe) when there is no planned end at all.
   */
  withinGracePeriod: boolean;
  /**
   * The booking that drives `plannedEndOfDay` — useful for telemetry
   * and the "where are you going?" prompt copy. `null` when no times.
   */
  drivingBookingId: string | null;
}

export interface PlannedDayOptions {
  /** Override the grace window. Defaults to DEFAULT_GRACE_MINUTES. */
  graceMinutes?: number;
  /**
   * Treat anything with a date strictly equal to `now`'s local date as
   * "today". Defaults to true. Set to false when you want a UTC-day
   * comparison instead (rarely needed).
   */
  useLocalDate?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function toDate(input: Date | string | number): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/** YYYY-MM-DD in local time (zero-padded). */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Combine `YYYY-MM-DD` (DB date column) + `HH:MM[:SS]` (DB time column)
 * into a single `Date`. The DB stores these as wall-clock in the org's
 * local timezone — we treat them as local time here, which matches how
 * the rest of the mobile app already renders them.
 *
 * Returns `null` when either input is missing or unparseable.
 */
function combineDateTime(
  dateIso: string | null | undefined,
  timeStr: string | null | undefined,
): Date | null {
  if (!dateIso || !timeStr) return null;
  const datePart = dateIso.length >= 10 ? dateIso.slice(0, 10) : dateIso;
  const timePart = timeStr.length >= 5 ? timeStr.slice(0, 8) : timeStr;
  // Construct using ISO so it's parsed as local time deterministically.
  const iso = `${datePart}T${timePart.length === 5 ? `${timePart}:00` : timePart}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Pull the latest "end-of-activity" timestamp out of a booking. Walks
 * the priority order documented at the top of this file.
 */
function bookingLatestEnd(b: MobileBooking): Date | null {
  const candidates: Array<Date | null> = [
    combineDateTime((b as any).eventdate, (b as any).event_end_time),
    combineDateTime((b as any).rigdowndate, (b as any).rigdown_end_time),
    combineDateTime((b as any).rigdaydate, (b as any).rig_end_time),
  ];
  let latest: Date | null = null;
  for (const c of candidates) {
    if (c && (!latest || c.getTime() > latest.getTime())) latest = c;
  }
  return latest;
}

/**
 * Earliest "start of any phase" for a booking — used to detect "still
 * have work later today". Walks rig → event → rigdown starts.
 */
function bookingEarliestStartAfter(
  b: MobileBooking,
  after: Date,
): Date | null {
  const candidates: Array<Date | null> = [
    combineDateTime((b as any).rigdaydate, (b as any).rig_start_time),
    combineDateTime((b as any).eventdate, (b as any).event_start_time),
    combineDateTime((b as any).rigdowndate, (b as any).rigdown_start_time),
  ];
  let earliest: Date | null = null;
  for (const c of candidates) {
    if (c && c.getTime() > after.getTime()) {
      if (!earliest || c.getTime() < earliest.getTime()) earliest = c;
    }
  }
  return earliest;
}

/**
 * True when any of the booking's date columns falls on `ymd`.
 */
function bookingTouchesDate(b: MobileBooking, ymd: string): boolean {
  const fields = ['eventdate', 'rigdaydate', 'rigdowndate'] as const;
  for (const f of fields) {
    const v = (b as any)[f];
    if (typeof v === 'string' && v.startsWith(ymd)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute the three planning signals for a staff at `now`.
 *
 * Pass the staff's bookings (already filtered to ones they're assigned
 * to). The function itself does NOT filter by staff — it trusts the
 * caller, exactly like `useGeofencing`/`useTimerStartFlow` do.
 */
export function computePlannedDaySignals(
  bookings: MobileBooking[],
  nowInput: Date | string | number = new Date(),
  options: PlannedDayOptions = {},
): PlannedDaySignals {
  const now = toDate(nowInput);
  const grace = options.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  const ymd = options.useLocalDate === false
    ? now.toISOString().slice(0, 10)
    : localYmd(now);

  let plannedEnd: Date | null = null;
  let drivingBookingId: string | null = null;
  let hasMore = false;

  for (const b of bookings) {
    if (!bookingTouchesDate(b, ymd)) continue;

    const end = bookingLatestEnd(b);
    if (end && (!plannedEnd || end.getTime() > plannedEnd.getTime())) {
      plannedEnd = end;
      drivingBookingId = (b as any).id ?? null;
    }

    if (!hasMore) {
      const future = bookingEarliestStartAfter(b, now);
      if (future) hasMore = true;
    }
  }

  let withinGrace = false;
  if (plannedEnd) {
    const diffMs = Math.abs(now.getTime() - plannedEnd.getTime());
    withinGrace = diffMs <= grace * 60_000;
  }

  return {
    plannedEndOfDay: plannedEnd ? plannedEnd.toISOString() : null,
    hasMoreActivitiesToday: hasMore,
    withinGracePeriod: withinGrace,
    drivingBookingId,
  };
}

/**
 * Decision helper for geofence EXIT events. Returns the recommended
 * action without executing anything — the caller wires it to UI.
 *
 *   'auto_stop_day'     — within grace + no more activities → stop timer + EOD
 *   'auto_start_travel' — within grace + more activities    → start travel
 *   'prompt_destination'— outside grace (early exit)        → ask user
 *   'no_planning'       — no plannedEndOfDay at all          → fall back to legacy
 */
export type ExitDecision =
  | 'auto_stop_day'
  | 'auto_start_travel'
  | 'prompt_destination'
  | 'no_planning';

export function decideExitAction(signals: PlannedDaySignals): ExitDecision {
  if (!signals.plannedEndOfDay) return 'no_planning';
  if (signals.withinGracePeriod) {
    return signals.hasMoreActivitiesToday
      ? 'auto_start_travel'
      : 'auto_stop_day';
  }
  return 'prompt_destination';
}

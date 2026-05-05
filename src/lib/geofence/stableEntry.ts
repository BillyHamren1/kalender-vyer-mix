/**
 * Stable-entry gate for geofence auto-start.
 *
 * MODELL:
 *   • En enskild GPS-spike inom radien får ALDRIG starta workday/timer.
 *     Vi kräver "stabil ankomst":
 *       – minst N=3 inside-pings  ELLER  dwell ≥ 2 min sedan första inside-ping
 *       – majoriteten av inside-pings har accuracy ≤ 75m
 *       – senaste GPS-ping är färsk (≤ 5 min gammal)
 *   • Saknas stabil ankomst men det finns någon inside-ping → "insufficient".
 *     Anroparen bör emittera assistant_events med
 *     suggested_action='possible_arrival' och INTE starta timer/workday.
 *   • Saknas färsk ping → "no_signal" → ingenting.
 */

export const ENTRY_PING_MIN_COUNT = 3;
export const ENTRY_PING_MIN_DWELL_MS = 2 * 60 * 1000;          // 2 min
export const ENTRY_PING_WINDOW_MS = 15 * 60 * 1000;            // trim window
export const ENTRY_PING_MAX_AGE_MS = 5 * 60 * 1000;            // "no_signal"
export const ENTRY_PING_MAX_ACCURACY_M = 75;

export interface EntryPing {
  ts: number;
  distance: number;
  accuracy: number | null;
}

export interface EntryTrackerState {
  pings: EntryPing[];
}

export type EntryStatus = 'stable' | 'insufficient' | 'unstable' | 'no_signal';

export interface EntryEvaluation {
  status: EntryStatus;
  pings: EntryPing[];
  dwellMs: number;
  reason: string;
}

export function createEntryTracker(): EntryTrackerState {
  return { pings: [] };
}

export function resetEntryTracker(state: EntryTrackerState): void {
  state.pings = [];
}

export function recordEntryPing(state: EntryTrackerState, ping: EntryPing): void {
  state.pings.push(ping);
  const cutoff = ping.ts - ENTRY_PING_WINDOW_MS;
  if (state.pings[0] && state.pings[0].ts < cutoff) {
    state.pings = state.pings.filter((p) => p.ts >= cutoff);
  }
}

/**
 * Evaluate whether the accumulated inside-pings constitute a "stable arrival".
 */
export function evaluateStableEntry(
  state: EntryTrackerState,
  nowTs: number,
  lastPingAgeMs: number | null,
): EntryEvaluation {
  const pings = state.pings;

  if (lastPingAgeMs == null || lastPingAgeMs > ENTRY_PING_MAX_AGE_MS) {
    return { status: 'no_signal', pings, dwellMs: 0, reason: 'last ping too old or missing' };
  }

  if (pings.length === 0) {
    return { status: 'insufficient', pings, dwellMs: 0, reason: 'no inside pings' };
  }

  const dwell = pings[pings.length - 1].ts - pings[0].ts;

  // Stable when EITHER ping count threshold OR dwell threshold met.
  const enoughPings = pings.length >= ENTRY_PING_MIN_COUNT;
  const enoughDwell = dwell >= ENTRY_PING_MIN_DWELL_MS;

  if (!enoughPings && !enoughDwell) {
    return {
      status: 'insufficient',
      pings,
      dwellMs: dwell,
      reason: `only ${pings.length}/${ENTRY_PING_MIN_COUNT} pings, dwell ${Math.round(dwell / 1000)}s < ${ENTRY_PING_MIN_DWELL_MS / 1000}s`,
    };
  }

  const goodAcc = pings.filter(
    (p) => p.accuracy == null || p.accuracy <= ENTRY_PING_MAX_ACCURACY_M,
  );
  if (goodAcc.length * 2 < pings.length) {
    return {
      status: 'unstable',
      pings,
      dwellMs: dwell,
      reason: `only ${goodAcc.length}/${pings.length} pings with accuracy ≤ ${ENTRY_PING_MAX_ACCURACY_M}m`,
    };
  }

  return { status: 'stable', pings, dwellMs: dwell, reason: 'ok' };
}

/**
 * The earliest reliable arrival timestamp — first ping in the buffer with
 * acceptable accuracy. Used as `startedAtIso` for workday + activity.
 */
export function firstReliableArrivalTs(state: EntryTrackerState): number | null {
  for (const p of state.pings) {
    if (p.accuracy == null || p.accuracy <= ENTRY_PING_MAX_ACCURACY_M) return p.ts;
  }
  return state.pings[0]?.ts ?? null;
}

export function buildEntryMetadata(ev: EntryEvaluation) {
  if (ev.pings.length === 0) {
    return { entry_status: ev.status, entry_reason: ev.reason, entry_ping_count: 0 };
  }
  const first = ev.pings[0];
  const last = ev.pings[ev.pings.length - 1];
  return {
    entry_status: ev.status,
    entry_reason: ev.reason,
    entry_ping_count: ev.pings.length,
    entry_first_at: new Date(first.ts).toISOString(),
    entry_last_at: new Date(last.ts).toISOString(),
    entry_dwell_ms: ev.dwellMs,
  };
}

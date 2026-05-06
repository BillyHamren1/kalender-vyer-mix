/**
 * Stable-exit gate for geofence auto-stop.
 *
 * MODELL:
 *   • Workday (lönegrundande) får ALDRIG stoppas av geofence — bara
 *     användare/admin/explicit watchdog. Detta modul rör endast
 *     activity-/timer-stopp.
 *   • En enskild GPS-punkt utanför radien räcker INTE för att stoppa
 *     en activity-timer. Vi kräver "stabil exit":
 *       – minst N=3 konsekutiva pings utanför exitRadius
 *       – pings spänner minst 2 minuter
 *       – majoriteten av pings har accuracy ≤ 75m
 *   • Saknas stabil exit men det finns någon ping → "insufficient" →
 *     systemet emitterar `assistant_events` med
 *     suggested_action='review_departure' och stoppar INTE timern.
 *   • Saknas färska pings (sista ping > 5 min gammal) → "no_signal" →
 *     ingenting stoppas. Timern markeras som "signal tappad" via
 *     canonical day model i admin.
 */

export const EXIT_PING_MIN_COUNT = 3;
export const EXIT_PING_MIN_SPAN_MS = 2 * 60 * 1000;          // 2 min
// Trim window utökat till 35 min så att en outside-ping från för 30 min sedan
// fortfarande lever kvar i trackern och kan trigga STALE-AUTOSTOP nedan.
export const EXIT_PING_WINDOW_MS = 35 * 60 * 1000;           // trim window
export const EXIT_PING_MAX_AGE_MS = 5 * 60 * 1000;           // "no_signal"
export const EXIT_PING_MAX_ACCURACY_M = 75;
/**
 * STALE-OUTSIDE AUTOSTOP (2026-05).
 * Om vi har ackumulerat outside-pings i ≥30 min utan att personen kommit
 * tillbaka, tvinga stopp av activity-timern oavsett om stable-exit-gaten
 * passerat. Stopptiden sätts till FÖRSTA outside-pingen (faktisk lämning),
 * inte "nu". Workdayen rörs inte.
 */
export const EXIT_STALE_AUTOSTOP_MS = 30 * 60 * 1000;

export interface ExitPing {
  /** Wall-clock timestamp (ms). */
  ts: number;
  /** Distance from geofence center in meters. */
  distance: number;
  /** GPS reported accuracy in meters (null = unknown). */
  accuracy: number | null;
}

export interface ExitTrackerState {
  pings: ExitPing[];
}

export type ExitStatus = 'stable' | 'insufficient' | 'unstable' | 'no_signal' | 'stale_autostop';

export interface ExitEvaluation {
  status: ExitStatus;
  pings: ExitPing[];
  spanMs: number;
  reason: string;
  /** ISO time we treat as "user actually left". Set on stable + stale_autostop. */
  exitedAtIso?: string;
}

export function createExitTracker(): ExitTrackerState {
  return { pings: [] };
}

export function resetExitTracker(state: ExitTrackerState): void {
  state.pings = [];
}

export function recordExitPing(state: ExitTrackerState, ping: ExitPing): void {
  state.pings.push(ping);
  const cutoff = ping.ts - EXIT_PING_WINDOW_MS;
  if (state.pings[0] && state.pings[0].ts < cutoff) {
    state.pings = state.pings.filter((p) => p.ts >= cutoff);
  }
}

/**
 * Evaluate whether the accumulated outside-pings constitute a "stable exit".
 *
 * @param state    Per-target tracker (only outside-pings are recorded).
 * @param nowTs    Current wall-clock ms.
 * @param lastPingAgeMs  Age of the latest GPS ping (any direction). Used to
 *                       distinguish "no_signal" from real movement.
 */
export function evaluateStableExit(
  state: ExitTrackerState,
  nowTs: number,
  lastPingAgeMs: number | null,
): ExitEvaluation {
  const pings = state.pings;

  // STALE-OUTSIDE AUTOSTOP — körs FÖRST. Även med dålig accuracy / få pings:
  // om personen inte varit innanför radien på 30 min så har hen lämnat.
  // Stopptid = första outside-pingen (faktisk lämning).
  if (pings.length > 0) {
    const first = pings[0];
    const ageOfFirstOutside = nowTs - first.ts;
    if (ageOfFirstOutside >= EXIT_STALE_AUTOSTOP_MS) {
      return {
        status: 'stale_autostop',
        pings,
        spanMs: pings[pings.length - 1].ts - first.ts,
        reason: `first outside ping ${Math.round(ageOfFirstOutside / 60000)} min ago — forced stop`,
        exitedAtIso: new Date(first.ts).toISOString(),
      };
    }
  }

  // Signal tappad — vi vet inte var personen är. Stoppa ingenting.
  if (lastPingAgeMs == null || lastPingAgeMs > EXIT_PING_MAX_AGE_MS) {
    return { status: 'no_signal', pings, spanMs: 0, reason: 'last ping too old or missing' };
  }

  if (pings.length < EXIT_PING_MIN_COUNT) {
    return {
      status: 'insufficient',
      pings,
      spanMs: 0,
      reason: `only ${pings.length}/${EXIT_PING_MIN_COUNT} outside pings`,
    };
  }

  const span = pings[pings.length - 1].ts - pings[0].ts;
  if (span < EXIT_PING_MIN_SPAN_MS) {
    return {
      status: 'insufficient',
      pings,
      spanMs: span,
      reason: `span ${Math.round(span / 1000)}s < ${EXIT_PING_MIN_SPAN_MS / 1000}s`,
    };
  }

  const goodAcc = pings.filter(
    (p) => p.accuracy == null || p.accuracy <= EXIT_PING_MAX_ACCURACY_M,
  );
  if (goodAcc.length < EXIT_PING_MIN_COUNT) {
    return {
      status: 'unstable',
      pings,
      spanMs: span,
      reason: `only ${goodAcc.length} pings with accuracy ≤ ${EXIT_PING_MAX_ACCURACY_M}m`,
    };
  }

  return {
    status: 'stable',
    pings,
    spanMs: span,
    reason: 'ok',
    exitedAtIso: new Date(pings[0].ts).toISOString(),
  };
}

/**
 * Build metadata payload for assistant_events / time_report sidecar so that
 * admins kan se exakt varför ett auto-stop skedde (eller varför systemet
 * bara föreslog ett stopp utan att stoppa).
 */
export function buildExitMetadata(ev: ExitEvaluation) {
  if (ev.pings.length === 0) {
    return {
      exit_status: ev.status,
      exit_reason: ev.reason,
      exit_ping_count: 0,
    };
  }
  const first = ev.pings[0];
  const last = ev.pings[ev.pings.length - 1];
  const distances = ev.pings.map((p) => p.distance);
  return {
    exit_status: ev.status,
    exit_reason: ev.reason,
    exit_ping_count: ev.pings.length,
    exit_first_at: new Date(first.ts).toISOString(),
    exit_last_at: new Date(last.ts).toISOString(),
    exit_span_ms: ev.spanMs,
    exit_distance_min_m: Math.round(Math.min(...distances)),
    exit_distance_max_m: Math.round(Math.max(...distances)),
    exit_accuracy_min_m:
      ev.pings.reduce<number | null>((min, p) => {
        if (p.accuracy == null) return min;
        return min == null || p.accuracy < min ? p.accuracy : min;
      }, null),
  };
}

/**
 * Compute "actual presence" at a job site from GPS pings, independent of
 * what the staff member happened to type into a manual time report.
 *
 * Pure function — no I/O. Used by the admin tidrapport to render
 * "Anlände HH:MM · Lämnade HH:MM" directly on each session row, so the
 * admin doesn't need to expand a panel or run an AI analysis to spot
 * mismatches between reported time and real presence.
 *
 * Inputs:
 *   - pings: ALL GPS pings for the staff member that day (chronological
 *            order is fine but not required)
 *   - sessionStart / sessionEnd: ISO timestamps for the work session window.
 *            sessionEnd may be null for live/open sessions — in that case we
 *            treat "now" as the window end.
 *   - base: optional fixed base coordinates. If omitted, we infer it from
 *            the median of pings *inside* the session window.
 *   - thresholdMeters: how close a ping must be to be considered "at base".
 *            Defaults to 200 m which is the same constant the existing
 *            movement detection uses.
 *
 * Returns:
 *   - arrivedAt: timestamp of the FIRST ping within `thresholdMeters` of
 *                base, looking inside [sessionStart - graceWindow,
 *                sessionEnd + graceWindow]. We extend before the session so
 *                we can show "anlände 06:42, rapport startad 06:51".
 *   - leftAt:    timestamp of the LAST ping within `thresholdMeters` of
 *                base in the same window.
 *   - basePings: the pings that counted as "at base" (sorted asc).
 *   - base:      the resolved base coordinate (either provided or inferred).
 *   - sampleCount: total pings considered inside the window (any distance).
 */

import { haversineMeters, type Ping } from './movementDetection';

export interface WorkPresence {
  arrivedAt: string | null;
  leftAt: string | null;
  basePings: Ping[];
  base: { lat: number; lng: number } | null;
  sampleCount: number;
}

export interface ComputeWorkPresenceOptions {
  thresholdMeters?: number;
  /** Extra time before/after the session in which we still accept pings as
   *  "arrival" / "departure". Defaults to 60 minutes. */
  graceMinutes?: number;
  base?: { lat: number; lng: number } | null;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export function computeWorkPresence(
  pings: Ping[],
  sessionStart: string,
  sessionEnd: string | null,
  opts: ComputeWorkPresenceOptions = {},
): WorkPresence {
  const threshold = Math.max(1, opts.thresholdMeters ?? 200);
  const graceMs = Math.max(0, (opts.graceMinutes ?? 60) * 60 * 1000);

  const startMs = new Date(sessionStart).getTime();
  const endMs = sessionEnd ? new Date(sessionEnd).getTime() : Date.now();
  const lo = startMs - graceMs;
  const hi = endMs + graceMs;

  const inWindow = pings
    .filter(p => {
      const t = new Date(p.recorded_at).getTime();
      return Number.isFinite(t) && t >= lo && t <= hi;
    })
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  if (inWindow.length === 0) {
    return { arrivedAt: null, leftAt: null, basePings: [], base: opts.base ?? null, sampleCount: 0 };
  }

  // Resolve base: prefer provided; otherwise use the median of pings INSIDE
  // the strict session window (not the grace zone) so a passing-by ping at
  // 06:00 doesn't drag the centre off-site.
  let base = opts.base ?? null;
  if (!base) {
    const strict = inWindow.filter(p => {
      const t = new Date(p.recorded_at).getTime();
      return t >= startMs && t <= endMs;
    });
    const seed = strict.length >= 3 ? strict : inWindow;
    base = { lat: median(seed.map(p => p.lat)), lng: median(seed.map(p => p.lng)) };
  }

  const basePings = inWindow.filter(p => haversineMeters(base!, { lat: p.lat, lng: p.lng }) <= threshold);

  return {
    arrivedAt: basePings[0]?.recorded_at ?? null,
    leftAt: basePings[basePings.length - 1]?.recorded_at ?? null,
    basePings,
    base,
    sampleCount: inWindow.length,
  };
}

/**
 * Compute the global day-level arrival / departure: the very first / last
 * ping anywhere "near a workplace" — useful for the day rubric (Dagen
 * startade / avslutades) when there's no single session to anchor to.
 *
 * We use the union of all sessions: arrivedAt = earliest of all session
 * arrivals; leftAt = latest of all session departures.
 */
export function combineDayPresence(presences: WorkPresence[]): {
  arrivedAt: string | null;
  leftAt: string | null;
} {
  let arrived: string | null = null;
  let left: string | null = null;
  for (const p of presences) {
    if (p.arrivedAt && (!arrived || p.arrivedAt < arrived)) arrived = p.arrivedAt;
    if (p.leftAt && (!left || p.leftAt > left)) left = p.leftAt;
  }
  return { arrivedAt: arrived, leftAt: left };
}

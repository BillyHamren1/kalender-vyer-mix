/**
 * Pure helper: "Where was the user at this exact ISO time?"
 *
 * Looks at the GPS ping closest to a given timestamp and returns its
 * coordinates + how stale that ping is. Used by the admin time-report UI
 * to answer the simplest possible question: when the timer started at
 * 06:51, where was the phone?
 *
 * No address is resolved here — the caller hands the coordinates to
 * useReverseGeocode and renders the result.
 */

import type { Ping } from './movementDetection';

export interface PingAtTime {
  at: string;
  coords: { lat: number; lng: number };
  ageMinutesFromTarget: number;
  /** True if the ping is more than 15 minutes from target — meaning we
   *  shouldn't claim it as "at this time". */
  stale: boolean;
}

/**
 * @param pings  Day's pings (any order).
 * @param targetIso  Wall-clock ISO timestamp we want a position for.
 * @param staleMinutes  Above this gap (default 15 min) the result is `stale`.
 */
export function findPingAtTime(
  pings: Ping[],
  targetIso: string,
  staleMinutes = 15,
): PingAtTime | null {
  if (!pings.length) return null;
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) return null;

  let best: Ping | null = null;
  let bestDelta = Infinity;
  for (const p of pings) {
    const t = new Date(p.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - targetMs);
    if (delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }

  if (!best) return null;
  const ageMin = Math.round(bestDelta / 60_000);
  return {
    at: best.recorded_at,
    coords: { lat: best.lat, lng: best.lng },
    ageMinutesFromTarget: ageMin,
    stale: ageMin > staleMinutes,
  };
}

/**
 * Detect when a staff member has visibly moved away from a "base" location
 * during a session.
 *
 * Pure function — no I/O, deterministic. Used by the admin tidrapport view
 * to render a "förflyttning"-flagga as a separate row instead of letting
 * the project timer silently keep ticking from a different address.
 *
 * Algorithm
 * ---------
 * Walk the pings in chronological order. Maintain a sliding window of the
 * last `windowSize` pings. The "current centre" is the median lat/lng of
 * that window. Whenever the current centre moves more than
 * `thresholdMeters` away from the previous stable centre, open a new
 * movement segment. When the centre returns within threshold, close it.
 *
 * Defaults are tuned for the FA Warehouse case in the screenshot: 3 pings
 * of confirmation, 200 m threshold — so a single noisy GPS sample doesn't
 * flag a phantom move.
 */

export interface Ping {
  lat: number;
  lng: number;
  recorded_at: string; // ISO
  accuracy?: number | null;
  address?: string | null;
}

export interface MovementSegment {
  start: string; // ISO
  end: string;   // ISO
  /** Distance from base centre to this segment's centre, in metres. */
  distanceFromBaseMeters: number;
  /** Median centre of this away-segment. */
  centre: { lat: number; lng: number };
  /** Pings inside the segment (slice of input). */
  pings: Ping[];
  /** Best-effort label (first non-null address inside the segment). */
  address: string | null;
}

export interface DetectMovementOptions {
  /** Number of consecutive pings used to compute the rolling centre. */
  windowSize?: number;
  /** Distance from base before we consider it a real move (metres). */
  thresholdMeters?: number;
  /**
   * Optional fixed base centre. If omitted, we use the median of the first
   * `windowSize` pings.
   */
  base?: { lat: number; lng: number };
}

const R = 6_371_000; // earth radius (m)
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const centreOf = (pings: Ping[]) => ({
  lat: median(pings.map(p => p.lat)),
  lng: median(pings.map(p => p.lng)),
});

export interface DetectMovementResult {
  base: { lat: number; lng: number } | null;
  segments: MovementSegment[];
}

export function detectMovementSegments(
  pings: Ping[],
  opts: DetectMovementOptions = {},
): DetectMovementResult {
  const windowSize = Math.max(2, opts.windowSize ?? 3);
  const threshold = Math.max(1, opts.thresholdMeters ?? 200);

  if (pings.length < windowSize) {
    return { base: opts.base ?? null, segments: [] };
  }

  const sorted = [...pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const base = opts.base ?? centreOf(sorted.slice(0, windowSize));

  const segments: MovementSegment[] = [];
  let active: Ping[] | null = null;

  for (let i = windowSize - 1; i < sorted.length; i++) {
    const window = sorted.slice(i - windowSize + 1, i + 1);
    const centre = centreOf(window);
    const dist = haversineMeters(base, centre);
    const isAway = dist > threshold;

    if (isAway) {
      if (!active) active = [];
      active.push(sorted[i]);
    } else if (active) {
      // Close segment
      const segCentre = centreOf(active);
      segments.push({
        start: active[0].recorded_at,
        end: active[active.length - 1].recorded_at,
        distanceFromBaseMeters: Math.round(haversineMeters(base, segCentre)),
        centre: segCentre,
        pings: active,
        address: active.find(p => p.address)?.address ?? null,
      });
      active = null;
    }
  }

  if (active && active.length > 0) {
    const segCentre = centreOf(active);
    segments.push({
      start: active[0].recorded_at,
      end: active[active.length - 1].recorded_at,
      distanceFromBaseMeters: Math.round(haversineMeters(base, segCentre)),
      centre: segCentre,
      pings: active,
      address: active.find(p => p.address)?.address ?? null,
    });
  }

  return { base, segments };
}

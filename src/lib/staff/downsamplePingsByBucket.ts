/**
 * Bucket pings into fixed time windows (default 5 min) and return one
 * representative per bucket — the one with the lowest (best) accuracy.
 * Ties: keep the earliest. Pings without numeric accuracy are last resort.
 *
 * Pure helper, no DB / no React. Used by RawGpsSatelliteMap to render
 * one marker per window instead of clustering hundreds of raw pings.
 */
export interface PingLike {
  recorded_at: string;
  accuracy: number | null;
  // anything else is preserved verbatim
  [k: string]: unknown;
}

export function downsamplePingsByBucket<T extends PingLike>(
  pings: T[],
  bucketMs: number = 5 * 60 * 1000,
): T[] {
  if (!pings.length) return [];
  const buckets = new Map<number, T>();
  for (const p of pings) {
    const t = new Date(p.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const bucket = Math.floor(t / bucketMs) * bucketMs;
    const current = buckets.get(bucket);
    if (!current) {
      buckets.set(bucket, p);
      continue;
    }
    const curAcc = current.accuracy ?? Number.POSITIVE_INFINITY;
    const newAcc = p.accuracy ?? Number.POSITIVE_INFINITY;
    if (newAcc < curAcc) {
      buckets.set(bucket, p);
    }
    // tie or worse → keep current (earliest insert wins, since we iterate in order)
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
}

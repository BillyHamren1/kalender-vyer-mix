// GPS pings → stationary segments (>5 min) and movement gaps.
// A "stationary segment" is a contiguous run of pings whose centroid drift
// stays within `stationaryRadiusM` for at least `minStopMin` minutes.

import type { Ping, Segment } from "./types.ts";
import { distanceMeters, minutesBetween } from "./geo.ts";

export interface ClusterOptions {
  stationaryRadiusM?: number; // default 80m (covers GPS jitter)
  minStopMin?: number;        // default 5
  maxGapMin?: number;         // default 15 — pings further apart break a segment
}

export function clusterPings(pings: Ping[], opts: ClusterOptions = {}): Segment[] {
  const stationaryRadiusM = opts.stationaryRadiusM ?? 80;
  const minStopMin = opts.minStopMin ?? 5;
  const maxGapMin = opts.maxGapMin ?? 15;

  if (pings.length === 0) return [];

  // Sort by timestamp ascending (defensive)
  const sorted = [...pings].sort((a, b) => a.ts.localeCompare(b.ts));

  const segments: Segment[] = [];
  let current: Ping[] = [sorted[0]];
  let centerLat = sorted[0].lat;
  let centerLng = sorted[0].lng;

  const flush = () => {
    if (current.length === 0) return;
    const startTs = current[0].ts;
    const endTs = current[current.length - 1].ts;
    const durationMin = minutesBetween(startTs, endTs);
    const cLat = current.reduce((s, p) => s + p.lat, 0) / current.length;
    const cLng = current.reduce((s, p) => s + p.lng, 0) / current.length;
    const isStationary = durationMin >= minStopMin;
    segments.push({
      startTs,
      endTs,
      centerLat: cLat,
      centerLng: cLng,
      pingCount: current.length,
      durationMin,
      matchedPlace: null,
      isStationary,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    const last = current[current.length - 1];
    const gapMin = minutesBetween(last.ts, p.ts);
    const distFromCenter = distanceMeters(centerLat, centerLng, p.lat, p.lng);

    // Break segment on big time gap or movement away from cluster center.
    if (gapMin > maxGapMin || distFromCenter > stationaryRadiusM) {
      flush();
      current = [p];
      centerLat = p.lat;
      centerLng = p.lng;
    } else {
      current.push(p);
      // Re-center as running mean — keeps cluster stable
      centerLat = current.reduce((s, x) => s + x.lat, 0) / current.length;
      centerLng = current.reduce((s, x) => s + x.lng, 0) / current.length;
    }
  }
  flush();

  // Insert synthetic "movement" segments between non-adjacent stationary stops
  const out: Segment[] = [];
  for (let i = 0; i < segments.length; i++) {
    out.push(segments[i]);
    const next = segments[i + 1];
    if (next && segments[i].isStationary && next.isStationary) {
      const gap = minutesBetween(segments[i].endTs, next.startTs);
      if (gap >= 1) {
        out.push({
          startTs: segments[i].endTs,
          endTs: next.startTs,
          centerLat: (segments[i].centerLat + next.centerLat) / 2,
          centerLng: (segments[i].centerLng + next.centerLng) / 2,
          pingCount: 0,
          durationMin: gap,
          matchedPlace: null,
          isStationary: false,
        });
      }
    }
  }
  return out;
}

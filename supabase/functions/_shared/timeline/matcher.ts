// Match each stationary segment to a known place (booking / project / location / home).

import type { KnownPlace, Segment } from "./types.ts";
import { distanceMeters } from "./geo.ts";

export function matchSegmentsToPlaces(
  segments: Segment[],
  places: KnownPlace[],
): Segment[] {
  return segments.map((seg) => {
    if (!seg.isStationary) return seg;
    let best: { place: KnownPlace; distance: number } | null = null;
    for (const place of places) {
      const d = distanceMeters(seg.centerLat, seg.centerLng, place.lat, place.lng);
      if (d <= place.radiusM && (best === null || d < best.distance)) {
        best = { place, distance: d };
      }
    }
    return { ...seg, matchedPlace: best?.place ?? null };
  });
}

export function distanceFromSegmentTo(seg: Segment, place: KnownPlace): number {
  return distanceMeters(seg.centerLat, seg.centerLng, place.lat, place.lng);
}

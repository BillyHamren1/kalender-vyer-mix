// Match each stationary segment to a known place (booking / project / location / home).
//
// Prioritetsregel: när flera kända platser överlappar samma punkt vinner alltid
// en icke-home-plats över ett "home" (Boende). Lager/projekt/booking ska aldrig
// gömmas under boende-polygon bara för att boendet råkar ligga vägg-i-vägg.

import type { KnownPlace, Segment } from "./types.ts";
import { distanceMeters } from "./geo.ts";

export function matchSegmentsToPlaces(
  segments: Segment[],
  places: KnownPlace[],
): Segment[] {
  return segments.map((seg) => {
    if (!seg.isStationary) return seg;
    let bestNonHome: { place: KnownPlace; distance: number } | null = null;
    let bestHome: { place: KnownPlace; distance: number } | null = null;
    for (const place of places) {
      const d = distanceMeters(seg.centerLat, seg.centerLng, place.lat, place.lng);
      if (d > place.radiusM) continue;
      if (place.type === "home") {
        if (bestHome === null || d < bestHome.distance) bestHome = { place, distance: d };
      } else {
        if (bestNonHome === null || d < bestNonHome.distance) bestNonHome = { place, distance: d };
      }
    }
    const chosen = bestNonHome ?? bestHome;
    return { ...seg, matchedPlace: chosen?.place ?? null };
  });
}

export function distanceFromSegmentTo(seg: Segment, place: KnownPlace): number {
  return distanceMeters(seg.centerLat, seg.centerLng, place.lat, place.lng);
}

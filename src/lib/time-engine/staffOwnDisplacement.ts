/**
 * Frontend mirror of supabase/functions/_shared/time-engine/staffOwnDisplacement.ts
 * Keep in sync 1:1.
 */

export interface DisplacementPoint {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

const EARTH_RADIUS_M = 6_371_000;

export function staffOwnDisplacementMeters(
  prev: DisplacementPoint | null | undefined,
  next: DisplacementPoint | null | undefined,
): number | null {
  if (!prev || !next) return null;
  if (
    prev.lat == null || prev.lng == null ||
    next.lat == null || next.lng == null
  ) {
    return null;
  }
  const φ1 = (Number(prev.lat) * Math.PI) / 180;
  const φ2 = (Number(next.lat) * Math.PI) / 180;
  const dφ = ((Number(next.lat) - Number(prev.lat)) * Math.PI) / 180;
  const dλ = ((Number(next.lng) - Number(prev.lng)) * Math.PI) / 180;
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

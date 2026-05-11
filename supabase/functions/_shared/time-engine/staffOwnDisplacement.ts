/**
 * Time Engine — Staff own displacement gate (Engine 4 follow-up).
 *
 * Hard truth check used at the presence- and report-classification layers:
 * before any signal_gap is promoted to `transport`, we MUST verify that the
 * staff member's OWN GPS shows real coordinate movement around the gap.
 *
 * Indirect evidence (companion route, transport anchors, differing target
 * labels on either side) is not enough — that path produced "Resa"-block
 * even when the person stood still on the same coordinate all day.
 *
 * Returns the haversine distance (m) between the last known position before
 * the gap and the first known position after it, or `null` when either side
 * is missing a coordinate (caller must then treat the promotion as unsafe).
 *
 * Pure / read-only. No DB access.
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

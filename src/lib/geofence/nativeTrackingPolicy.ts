/**
 * Native GPS capture must never stop because app code picked a sparse
 * distanceFilter. We keep native capture always-on, but we MUST throttle
 * the position events — distanceFilter=0 maps to kCLDistanceFilterNone
 * on iOS, which floods Supabase with thousands of pings per device and
 * causes database overload.
 *
 * Production minimum: 50 meters. Never use 0 in production.
 */

// AKUT STABILISERING 2026-05-26: Höjt från 0 → 50m för att stoppa
// Supabase-överbelastning. distanceFilter=0 (kCLDistanceFilterNone) på iOS
// triggar GPS-callback för minsta rörelse och hammrar staff_location_history.
// FÅR INTE sänkas tillbaka till 0 i produktion.
export const ALWAYS_ON_NATIVE_DISTANCE_FILTER = 50;

/** Minimum tillåten distanceFilter i produktion. */
export const MIN_PRODUCTION_DISTANCE_FILTER = 50;

export function resolveAppliedTrackingDistanceFilter(args: {
  desiredDistanceFilter: number;
  isNativePlatform: boolean;
}): number {
  if (args.isNativePlatform) {
    // Höjt golv: även om en backend-policy ber om finare, släpper vi
    // aldrig under 50 m på native (anti-DDoS mot egen Supabase).
    const desired = Number.isFinite(args.desiredDistanceFilter)
      ? args.desiredDistanceFilter
      : ALWAYS_ON_NATIVE_DISTANCE_FILTER;
    return Math.max(MIN_PRODUCTION_DISTANCE_FILTER, desired);
  }
  if (!Number.isFinite(args.desiredDistanceFilter)) return 0;
  return Math.max(0, args.desiredDistanceFilter);
}

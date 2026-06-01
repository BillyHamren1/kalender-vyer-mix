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
    // På native får applied distanceFilter ALDRIG bli glesare än
    // ALWAYS_ON_NATIVE_DISTANCE_FILTER (50 m). Backend kan be om
    // battery_saver=500m, men då blir telefonen blind nära lager/hem
    // (GPS-callback fyrar inte förrän personen rört sig 500 m). Vi
    // clampar därför uppåt (max 50 m) OCH nedåt (min 50 m, anti-DDoS
    // mot egen Supabase). Resultat på native: alltid exakt 50 m.
    if (!Number.isFinite(args.desiredDistanceFilter)) {
      return ALWAYS_ON_NATIVE_DISTANCE_FILTER;
    }
    return Math.min(
      ALWAYS_ON_NATIVE_DISTANCE_FILTER,
      Math.max(MIN_PRODUCTION_DISTANCE_FILTER, args.desiredDistanceFilter),
    );
  }
  if (!Number.isFinite(args.desiredDistanceFilter)) return 0;
  return Math.max(0, args.desiredDistanceFilter);
}

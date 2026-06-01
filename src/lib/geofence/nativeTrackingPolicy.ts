/**
 * Native GPS capture must never stop because app code picked a sparse
 * distanceFilter. We keep native capture always-on, but we MUST throttle
 * the position events — distanceFilter=0 maps to kCLDistanceFilterNone
 * on iOS, which floods Supabase with thousands of pings per device and
 * causes database overload.
 *
 * Produktionsgräns: 50 meter (anti-DDoS mot Supabase).
 * Övre gräns: 75 meter — annars blir telefonen blind nära lager/hem och
 * vi missar in/ut genom geofence. Capture-policy får INTE välja grövre
 * än 75 m. Upload-skydd görs istället via batch-policy i locationSyncQueue.
 */

// AKUT STABILISERING 2026-05-26: Höjt från 0 → 50m för att stoppa
// Supabase-överbelastning. FÅR INTE sänkas under 50 i produktion.
export const ALWAYS_ON_NATIVE_DISTANCE_FILTER = 50;

/** Minimum tillåten distanceFilter i produktion (anti-DDoS). */
export const MIN_PRODUCTION_DISTANCE_FILTER = 50;
/** Maximum tillåten distanceFilter på native (annars blir telefonen blind). */
export const MAX_NATIVE_DISTANCE_FILTER = 75;

export function resolveAppliedTrackingDistanceFilter(args: {
  desiredDistanceFilter: number;
  isNativePlatform: boolean;
}): number {
  if (args.isNativePlatform) {
    // På native måste applied distanceFilter ligga mellan
    // MIN_PRODUCTION_DISTANCE_FILTER (50m, anti-DDoS) och
    // MAX_NATIVE_DISTANCE_FILTER (75m, annars missar vi geofence i/ut).
    // Tidigare clampade vi mot ALWAYS_ON (50) som tak vilket gjorde att
    // varje desired ≥50 blev exakt 50m — bra för flush-skydd men gjorde
    // det omöjligt att vila batterit i outside_idle. Med 50–75 får vi
    // utrymme för båda extremfallen utan att stryka GPS-callback helt.
    if (!Number.isFinite(args.desiredDistanceFilter)) {
      return MIN_PRODUCTION_DISTANCE_FILTER;
    }
    return Math.max(
      MIN_PRODUCTION_DISTANCE_FILTER,
      Math.min(args.desiredDistanceFilter, MAX_NATIVE_DISTANCE_FILTER),
    );
  }
  if (!Number.isFinite(args.desiredDistanceFilter)) return 0;
  return Math.max(0, args.desiredDistanceFilter);
}

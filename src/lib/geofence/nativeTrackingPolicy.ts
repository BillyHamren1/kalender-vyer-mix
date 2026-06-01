/**
 * Native GPS capture must never stop because app code picked a sparse
 * distanceFilter. Vi måste samtidigt skydda Supabase mot ping-flod, men
 * det skyddet sker via upload-policy + batchning i locationSyncQueue —
 * INTE genom att strypa LOKAL capture till 50 m. Annars blir det omöjligt
 * att samla tät rörelse inom geofence (där capture-policy vill ha 20 m).
 */

/**
 * Default när desired är ogiltig/NaN. Stannar 50 m för att inte hamra
 * batteriet om policyn inte kunnat räkna ut något.
 */
export const ALWAYS_ON_NATIVE_DISTANCE_FILTER = 50;

/** Minimum tillåten distanceFilter på native (tätare än så ger ingen extra info för GPS). */
export const MIN_PRODUCTION_DISTANCE_FILTER = 20;
/** Maximum tillåten distanceFilter på native (annars blir telefonen blind nära geofence). */
export const MAX_NATIVE_DISTANCE_FILTER = 75;

export function resolveAppliedTrackingDistanceFilter(args: {
  desiredDistanceFilter: number;
  isNativePlatform: boolean;
}): number {
  if (args.isNativePlatform) {
    if (!Number.isFinite(args.desiredDistanceFilter)) {
      return ALWAYS_ON_NATIVE_DISTANCE_FILTER;
    }
    return Math.max(
      MIN_PRODUCTION_DISTANCE_FILTER,
      Math.min(args.desiredDistanceFilter, MAX_NATIVE_DISTANCE_FILTER),
    );
  }
  if (!Number.isFinite(args.desiredDistanceFilter)) return 0;
  return Math.max(0, args.desiredDistanceFilter);
}

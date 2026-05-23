/**
 * Native GPS capture must never stop because app code picked a sparse
 * distanceFilter. We therefore keep native capture always-on and let
 * enqueue/upload cadence decide how many points we persist.
 *
 * For @capgo/background-geolocation, distanceFilter=0 maps to
 * kCLDistanceFilterNone on iOS.
 */

export const ALWAYS_ON_NATIVE_DISTANCE_FILTER = 0;

export function resolveAppliedTrackingDistanceFilter(args: {
  desiredDistanceFilter: number;
  isNativePlatform: boolean;
}): number {
  if (args.isNativePlatform) return ALWAYS_ON_NATIVE_DISTANCE_FILTER;
  if (!Number.isFinite(args.desiredDistanceFilter)) return 0;
  return Math.max(0, args.desiredDistanceFilter);
}
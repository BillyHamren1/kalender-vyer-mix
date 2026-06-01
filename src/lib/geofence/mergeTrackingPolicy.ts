/**
 * Slår ihop backend trackingPolicy med lokal mode-decision.
 *
 * Regler:
 *  - Backend `heartbeatMs` styr (server är authority för cadence).
 *  - `distanceFilter` får ALDRIG bli glesare än lokal mode-decision.
 *    Backend kan säga battery_saver=500m när den inte vet att lokal
 *    logik ser near_target/inside. Då skulle telefonen bli blind.
 *  - Vi tar därför `min(backend.distanceFilter, local.distanceFilter)`
 *    så att lokal near/inside-täthet alltid vinner när den är finare.
 *
 * Native clamp (50 m golv/tak) appliceras i ett senare steg via
 * `resolveAppliedTrackingDistanceFilter` — det är inte den här
 * funktionens ansvar.
 */
export interface TrackingMergeInput {
  backend: { heartbeatMs: number; distanceFilter: number; mode: string } | null;
  local: { heartbeatMs: number; distanceFilter: number; mode: string };
}

export interface TrackingMergeResult {
  heartbeatMs: number;
  distanceFilter: number;
  reason: string;
}

export function mergeTrackingPolicy(input: TrackingMergeInput): TrackingMergeResult {
  const { backend, local } = input;
  if (!backend) {
    return {
      heartbeatMs: local.heartbeatMs,
      distanceFilter: local.distanceFilter,
      reason: `local:${local.mode}`,
    };
  }
  const distanceFilter = Math.min(backend.distanceFilter, local.distanceFilter);
  return {
    heartbeatMs: backend.heartbeatMs,
    distanceFilter,
    reason: `backend:${backend.mode}, local:${local.mode}, appliedDistanceFilter=min(${backend.distanceFilter},${local.distanceFilter})=${distanceFilter}`,
  };
}

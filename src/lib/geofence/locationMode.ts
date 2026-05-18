/**
 * Adaptive Location Mode — pure state machine.
 *
 * Maps the user's distance to the nearest relevant work target (and current
 * activity context) into a discrete "location mode". Each mode dictates a
 * heartbeat interval and a desired distanceFilter so we burn less battery
 * when the user is far from any work site, and ramp up automatically as
 * they approach.
 *
 * This module is PURE — it does not start any watcher. The reporter is the
 * sole owner of the GPS engine and applies the recommended settings.
 *
 * Modes (in increasing intensity):
 *   - idle                          : no targets at all, no active timer
 *   - workday_far                   : ≥ 2 km from nearest target
 *   - approaching_target            : 500 m – 2 km
 *   - near_target                   : geofence radius – 500 m
 *   - inside_geofence_pending       : inside radius, waiting for stable-entry
 *   - arrived_pending_user_response : pending arrival created, waiting on user
 *   - dismissed_cooldown            : nearest target is in cooldown
 *   - active_timer                  : a timer is currently running
 */

export type LocationMode =
  | 'idle'
  | 'workday_far'
  | 'approaching_target'
  | 'near_target'
  | 'inside_geofence_pending'
  | 'arrived_pending_user_response'
  | 'dismissed_cooldown'
  | 'active_timer';

export interface LocationModeSettings {
  heartbeatMs: number;
  distanceFilter: number;
}

export interface LocationModeDecision extends LocationModeSettings {
  mode: LocationMode;
  nearestTargetId: string | null;
  nearestTargetDistanceMeters: number | null;
  reasonForModeChange: string;
}

export interface ModeInputTarget {
  key: string;
  lat: number;
  lng: number;
  radius: number;
  cooldownActive?: boolean;
}

export interface ModeInputs {
  position: { lat: number; lng: number } | null;
  targets: ModeInputTarget[];
  hasActiveTimer: boolean;
  hasPendingArrival: boolean;
  insideKeys: Set<string>;
  previousMode: LocationMode | null;
}

// Tightened 2026-05-18: tidigare 5–10 min heartbeat + 300–500m distanceFilter
// gjorde att stillastående telefoner i `idle`/`workday_far` slutade pinga helt
// efter 1–2 träffar (iOS pausar JS-setTimeout i bakgrund, native plugin
// rapporterar bara vid rörelse > distanceFilter). Vi sänker rejält så minsta
// rörelse fångas och heartbeat triggar oftare när appen är aktiv.
const SETTINGS: Record<LocationMode, LocationModeSettings> = {
  idle:                          { heartbeatMs:  3 * 60 * 1000, distanceFilter:  50 },
  workday_far:                   { heartbeatMs:  2 * 60 * 1000, distanceFilter:  50 },
  approaching_target:            { heartbeatMs:  90 * 1000,     distanceFilter:  60 },
  near_target:                   { heartbeatMs:  20 * 1000,     distanceFilter:  35 },
  inside_geofence_pending:       { heartbeatMs:  15 * 1000,     distanceFilter:  15 },
  arrived_pending_user_response: { heartbeatMs:  2 * 60 * 1000, distanceFilter:  60 },
  dismissed_cooldown:            { heartbeatMs:  3 * 60 * 1000, distanceFilter: 100 },
  active_timer:                  { heartbeatMs:  60 * 1000,     distanceFilter:  30 },
};

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const sLat1 = toRad(aLat);
  const sLat2 = toRad(bLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(sLat1) * Math.cos(sLat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function decideLocationMode(inputs: ModeInputs): LocationModeDecision {
  const { position, targets, hasActiveTimer, hasPendingArrival, insideKeys } = inputs;

  let nearestId: string | null = null;
  let nearestDist: number | null = null;
  let nearestRadius = 0;
  let nearestCooldown = false;
  if (position && targets.length > 0) {
    for (const t of targets) {
      const d = haversineMeters(position.lat, position.lng, t.lat, t.lng);
      if (nearestDist == null || d < nearestDist) {
        nearestDist = d;
        nearestId = t.key;
        nearestRadius = t.radius;
        nearestCooldown = !!t.cooldownActive;
      }
    }
  }

  let mode: LocationMode;
  let reason: string;

  if (hasActiveTimer) {
    mode = 'active_timer'; reason = 'an active timer is running';
  } else if (hasPendingArrival) {
    mode = 'arrived_pending_user_response'; reason = 'pending arrival awaiting user';
  } else if (targets.length === 0) {
    mode = 'idle'; reason = 'no relevant targets';
  } else if (nearestDist == null) {
    mode = 'workday_far'; reason = 'no GPS position yet';
  } else if (nearestId && insideKeys.has(nearestId)) {
    mode = 'inside_geofence_pending'; reason = 'inside geofence, waiting for stable entry';
  } else if (nearestCooldown && nearestDist < 1500) {
    mode = 'dismissed_cooldown'; reason = `nearest target ${nearestId} is in dismissed cooldown`;
  } else if (nearestDist <= Math.max(nearestRadius, 500)) {
    mode = 'near_target'; reason = `within ${Math.round(nearestDist)}m of ${nearestId}`;
  } else if (nearestDist <= 2000) {
    mode = 'approaching_target'; reason = `${Math.round(nearestDist)}m from ${nearestId}`;
  } else {
    mode = 'workday_far'; reason = `${Math.round(nearestDist)}m from nearest target`;
  }

  const settings = SETTINGS[mode];
  return {
    mode,
    nearestTargetId: nearestId,
    nearestTargetDistanceMeters: nearestDist,
    heartbeatMs: settings.heartbeatMs,
    distanceFilter: settings.distanceFilter,
    reasonForModeChange: reason,
  };
}

export function logModeChange(prev: LocationMode | null, next: LocationModeDecision): void {
  if (prev === next.mode) return;
  // dev-only telemetry; cheap noop in prod where DCE strips it
  // eslint-disable-next-line no-console
  console.info('[location-mode]', {
    from: prev,
    to: next.mode,
    nearestTargetId: next.nearestTargetId,
    nearestTargetDistanceMeters: next.nearestTargetDistanceMeters,
    selectedHeartbeatMs: next.heartbeatMs,
    selectedDistanceFilter: next.distanceFilter,
    reasonForModeChange: next.reasonForModeChange,
  });
}

/**
 * Capture/Upload-policy — pure mapping
 * ------------------------------------------------------------------
 * Skiljer LOKAL insamling (capture) från SERVER-upload-cadence.
 *
 * Just nu använder `useBackgroundLocationReporter` samma värde för
 * distanceFilter/heartbeat både för OS-callbacks och för server-upload.
 * Det gör att appen aldrig hinner samla en tät lokal batch när
 * personen står kvar inom en geofence — varje callback enqueueas och
 * 10-min-flushen råkar nästan alltid skicka en eller två pings.
 *
 * Denna modul mappar nuvarande `LocationMode` till en
 * capture/upload-policy:
 *
 *   capture* → hur tätt vi observerar GPS lokalt och enqueueas i kön
 *   upload*  → hur ofta backend får batchen (forceFlush bypassar alltid)
 *
 * Pure. Inga sido-effekter. Inget importeras från Time Engine, rapport,
 * timerlogik eller display timeline. Konsumeras av reporter + queue.
 */

import type { LocationMode } from './locationMode';

export type UploadMode =
  | 'batch_inside_geofence'
  | 'boundary_guard'
  | 'moving_outside_known_geofence'
  | 'outside_idle'
  | 'default';

export interface CaptureUploadPolicy {
  /** Hur grov native distanceFilter får vara för LOKAL capture (m). */
  captureDistanceFilter: number;
  /** Min ms mellan lokala enqueue (REPORT_THROTTLE). */
  captureThrottleMs: number;
  /** Upload-läge — styr auto-flush-cadence i locationSyncQueue. */
  uploadMode: UploadMode;
  /** Min ms mellan auto-flushar (forceFlush bypassar). */
  uploadIntervalMs: number;
  /** Mänsklig beskrivning för debug. */
  reason: string;
}

export interface CaptureUploadInput {
  mode: LocationMode | null;
  /** m/s från senaste GPS-fix om tillgänglig (annars null). */
  speedMps?: number | null;
  /** Senast uppmätt förflyttning inom 2 min (m), om beräknad. */
  displacementWithin2minM?: number | null;
}

const MS = (n: number) => n;
const MIN = (n: number) => n * 60_000;

const MOVING_SPEED_MPS = 1.2;
const MOVING_DISPLACEMENT_M = 75;

function isOutsideMoving(input: CaptureUploadInput): boolean {
  if (typeof input.speedMps === 'number' && input.speedMps >= MOVING_SPEED_MPS) return true;
  if (
    typeof input.displacementWithin2minM === 'number' &&
    input.displacementWithin2minM >= MOVING_DISPLACEMENT_M
  ) return true;
  return false;
}

/**
 * Mappa LocationMode → capture/upload-policy.
 *
 *   active_timer, inside_geofence_pending  → batch_inside_geofence (30 min)
 *   near_target                            → boundary_guard (60 s)
 *   approaching_target + rörelse           → moving_outside (60 s)
 *   workday_far + rörelse                  → moving_outside (60 s)
 *   workday_far/idle + stilla              → outside_idle (5 min)
 *   dismissed_cooldown                     → outside_idle (5 min)
 *   arrived_pending_user_response          → boundary_guard (60 s)
 *   null/okänt                             → default (10 min)
 */
export function deriveCaptureUploadPolicy(input: CaptureUploadInput): CaptureUploadPolicy {
  const mode = input.mode;

  switch (mode) {
    case 'active_timer':
    case 'inside_geofence_pending':
      return {
        captureDistanceFilter: 20,
        captureThrottleMs: MS(30_000),
        uploadMode: 'batch_inside_geofence',
        uploadIntervalMs: MIN(30),
        reason: `inside known geofence (${mode}) → tät capture, batch var 30 min`,
      };

    case 'near_target':
    case 'arrived_pending_user_response':
      return {
        captureDistanceFilter: 20,
        captureThrottleMs: MS(15_000),
        uploadMode: 'boundary_guard',
        uploadIntervalMs: MS(60_000),
        reason: `boundary guard (${mode}) → in/ut får inte missas`,
      };

    case 'approaching_target':
      // Approaching ≈ rör sig mot platsen — alltid moving.
      return {
        captureDistanceFilter: 30,
        captureThrottleMs: MS(30_000),
        uploadMode: 'moving_outside_known_geofence',
        uploadIntervalMs: MS(60_000),
        reason: `approaching → live upload var 60 s`,
      };

    case 'workday_far': {
      if (isOutsideMoving(input)) {
        return {
          captureDistanceFilter: 50,
          captureThrottleMs: MS(30_000),
          uploadMode: 'moving_outside_known_geofence',
          uploadIntervalMs: MS(60_000),
          reason: 'workday_far + rörelse → live upload var 60 s',
        };
      }
      return {
        captureDistanceFilter: 75,
        captureThrottleMs: MIN(5),
        uploadMode: 'outside_idle',
        uploadIntervalMs: MIN(5),
        reason: 'workday_far + stilla → glesa pings, batch var 5 min',
      };
    }

    case 'idle':
    case 'dismissed_cooldown':
      return {
        captureDistanceFilter: 75,
        captureThrottleMs: MIN(5),
        uploadMode: 'outside_idle',
        uploadIntervalMs: MIN(5),
        reason: `${mode} → glesa pings, batch var 5 min`,
      };

    case null:
    case undefined:
    default:
      return {
        captureDistanceFilter: 50,
        captureThrottleMs: MS(60_000),
        uploadMode: 'default',
        uploadIntervalMs: MIN(10),
        reason: 'fallback (mode okänt) → klassisk 10-min batch',
      };
  }
}

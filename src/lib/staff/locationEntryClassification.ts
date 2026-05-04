/**
 * Klassificera en `location_time_entries`-rad mot användningstyp.
 *
 * Bakgrund: en LTE-rad med `location_id` men utan `booking_id` /
 * `large_project_id` är inte automatiskt en passiv närvaromarkör. Den kan
 * mycket väl vara en RIKTIG arbetstimer på en plats (t.ex. Lager / FA
 * Warehouse) som startats explicit av personalen via timerflödet.
 *
 * Regel:
 *   - presence-only ≈ rent GPS-bevis / geofence-event / assistant-event
 *     utan koppling till booking eller stort projekt
 *   - location work timer ≈ explicit start (manual/timer/mobile/location_timer
 *     /auto_assigned) på en location utan booking/lp
 *   - har raden booking_id eller large_project_id är den ALLTID
 *     "riktig aktivitet" (inte presence)
 */

const PRESENCE_SOURCES = new Set<string>([
  'gps',
  'geofence',
  'geofence_foreground',
  'geofence_background',
  'arrival_context',
  'arrival_context_unplanned_visit',
]);

const WORK_TIMER_SOURCES = new Set<string>([
  'manual',
  'timer',
  'mobile',
  'location_timer',
  'auto_assigned',
  'booking',
  'project',
]);

export interface LocationEntryClassificationInput {
  source: string | null | undefined;
  booking_id: string | null | undefined;
  large_project_id: string | null | undefined;
  location_id: string | null | undefined;
}

export interface LocationEntryClassification {
  isPresenceOnly: boolean;
  isLocationWorkTimer: boolean;
}

export function classifyLocationEntry(
  e: LocationEntryClassificationInput,
): LocationEntryClassification {
  const hasProjectLink = !!e.booking_id || !!e.large_project_id;
  const src = (e.source ?? '').toLowerCase();

  // Booking/large_project bound → real activity, never presence-only.
  if (hasProjectLink) {
    return { isPresenceOnly: false, isLocationWorkTimer: false };
  }

  // No project link → decide by source.
  // Explicit work-timer source on a location → real location work timer.
  if (e.location_id && (WORK_TIMER_SOURCES.has(src) || src === '')) {
    // Empty source defaults to work-timer too: legacy inserts from the
    // timer flow occasionally omit `source`. Better to treat as work
    // (visible, requires review) than to silently drop the hours.
    return { isPresenceOnly: false, isLocationWorkTimer: true };
  }

  // Pure presence: gps / geofence / arrival event without booking/lp.
  if (PRESENCE_SOURCES.has(src)) {
    return { isPresenceOnly: true, isLocationWorkTimer: false };
  }

  // Unknown source + no project link + no location → treat as presence
  // (passive marker, hours = 0) to be safe.
  return { isPresenceOnly: true, isLocationWorkTimer: false };
}

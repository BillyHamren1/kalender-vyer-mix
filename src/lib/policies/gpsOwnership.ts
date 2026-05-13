/**
 * GPS / GEOFENCE OWNERSHIP CONTRACT
 *
 * This file is documentation-as-code. Importing one of these symbols pulls in
 * the JSDoc and signals reviewers that they are touching contractual
 * behaviour. The runtime values are intentionally trivial.
 *
 * Three rules govern the entire mobile + edge stack:
 *
 *   1. GPS_SIGNAL_ONLY
 *      Mobile GPS / geofence is EVIDENCE only. It must never own work time.
 *        ✅ GPS may inform: arrival banners, presence map, evidence for the
 *           Time Engine, auto-start of the day timer, auto-stop of the day
 *           timer.
 *        ❌ GPS may NOT: create or mutate `time_reports`, `location_time_entries`,
 *           `workdays`, `travel_time_logs`, project/booking timers, warehouse
 *           timers, or any other timeline block.
 *
 *   2. DAY_TIMER_ONLY
 *      The mobile app owns exactly ONE timer: the workday in
 *      `active_time_registrations`. No project / booking / location /
 *      warehouse / travel timers may be started from the client.
 *
 *   3. TIME_ENGINE_OWNS_TIMELINE
 *      Allocation of time to projects / locations / warehouse / travel is
 *      done EXCLUSIVELY by the Time Engine reading evidence. The mobile app
 *      mirrors the result via `staff_day_report_cache` (see Mobile Time App
 *      Mirror-Only memory).
 *
 * Locked by: src/test/contracts/gpsEvidenceOnly.contract.test.ts
 */

export const GPS_SIGNAL_ONLY = 'GPS_SIGNAL_ONLY' as const;
export const DAY_TIMER_ONLY = 'DAY_TIMER_ONLY' as const;
export const TIME_ENGINE_OWNS_TIMELINE = 'TIME_ENGINE_OWNS_TIMELINE' as const;

export type GpsOwnershipPolicy =
  | typeof GPS_SIGNAL_ONLY
  | typeof DAY_TIMER_ONLY
  | typeof TIME_ENGINE_OWNS_TIMELINE;

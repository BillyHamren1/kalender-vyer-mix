/**
 * Contract test — TIMER DISPLAY SOURCE GUARD
 * ==========================================
 *
 * Locks the rule that the new Time app's primary timer surface
 * (`WorkDayPanel.tsx`) reads its active-timer state ONLY from the
 * new active_time_registration backend (useActiveTimerStatus /
 * get-current-time-registration / get-active-time-registration-status /
 * get-timer-time-segments).
 *
 * It MUST NOT decide whether a timer is active, when it started, what it
 * is registered on, or whether it should be stopped from any of these
 * legacy sources:
 *   - useWorkSession                      (LTE/workday/time_report engine)
 *   - useGeofencing/activeTimers          (in-memory geofence state)
 *   - useActiveDayState / get_active_day_state (legacy LTE day state)
 *   - mobileApi.getLocationTimeEntriesLegacy / get_location_time_entries
 *   - mobileApi.startLocationTimer / start_location_timer (action name)
 *   - mobileApi.stopOpenEntryLegacy   / stop_open_entry
 *   - reportsByDate                       (admin/historik time_report cache)
 *
 * Old admin/historik views may keep using these — only the new Time app's
 * main timer display is locked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

// Files that ARE the new Time-app primary timer display surface.
// Any new file added here must be source-pure to the new Time Engine v2.
const TIMER_DISPLAY_FILES = [
  'components/mobile-app/WorkDayPanel.tsx',
];

// Banned tokens — substring match against the file source.
const BANNED_TOKENS = [
  'useWorkSession',
  'activeTimers',
  'useActiveDayState',
  'getActiveDayStateLegacy',
  'getLocationTimeEntriesLegacy',
  'get_active_day_state',
  'get_location_time_entries',
  'start_location_timer',
  'stop_open_entry',
  'location_time_entries',
  'reportsByDate',
];

describe('Timer display source contract', () => {
  for (const rel of TIMER_DISPLAY_FILES) {
    it(`${rel} reads only from the new active_time_registration source`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      // Strip block + line comments so doc strings that mention banned tokens
      // (e.g. "Lokala timer-källor (useWorkSession, …) får INTE läsas här.")
      // do not trigger the guard.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/[^\n]*/g, '$1');

      const offenders = BANNED_TOKENS.filter((t) => code.includes(t));
      expect(
        offenders,
        `${rel} must not reference legacy timer sources: ${offenders.join(', ')}`,
      ).toEqual([]);
    });
  }
});

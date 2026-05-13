/**
 * Contract test — MOBILE SINGLE-TIMER HARD LOCK
 * ==============================================
 *
 * Locks the architectural decision (single-timer-policy-v1):
 *
 *   "The mobile Time app may only start/stop the workday via
 *    WorkDayPanel → mobileApi.startTimeRegistration / stopTimeRegistration.
 *    Activity-, project-, location- and booking-timers must be technically
 *    impossible to start from the client. GPS/geofence is evidence only."
 *
 * If any of these guards regress, this test fails and forces a fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('Mobile · single-timer hard lock contract', () => {
  it('useGeofencing.startTimer is a hard no-op (no setActiveTimers, no enqueueTimerStart)', () => {
    const src = read('src/hooks/useGeofencing.ts');
    // The startTimer body must reference the policy and must NOT call the
    // legacy primitives that would create a parallel timer.
    const startTimerBlockMatch = src.match(
      /const startTimer = useCallback\([\s\S]*?\n  \}, \[\]\);/,
    );
    expect(startTimerBlockMatch, 'startTimer block not found').toBeTruthy();
    const block = startTimerBlockMatch![0];
    expect(block).toMatch(/single-timer-policy-v1/);
    expect(block).not.toMatch(/setActiveTimers\s*\(/);
    expect(block).not.toMatch(/enqueueTimerStart\s*\(/);
    expect(block).not.toMatch(/triggeredEnterRef\.current\.add/);
  });

  it('useWorkSession.startSession is a hard no-op (no startTimer call)', () => {
    const src = read('src/hooks/useWorkSession.tsx');
    const startSessionBlockMatch = src.match(
      /const startSession = useCallback\([\s\S]*?\n    \[\]\,?\s*\n  \);/,
    );
    expect(startSessionBlockMatch, 'startSession block not found').toBeTruthy();
    const block = startSessionBlockMatch![0];
    expect(block).toMatch(/single-timer-policy-v1/);
    // Must not invoke the legacy startTimer primitive (which writes to
    // location_time_entries via the sync queue).
    expect(block).not.toMatch(/\bstartTimer\s*\(/);
    // Must not invoke the engine directly either.
    expect(block).not.toMatch(/enqueueTimerStart\s*\(/);
  });

  it('useTimerStartFlow.performStart suppresses startSession (single-timer-policy)', () => {
    const src = read('src/hooks/useTimerStartFlow.ts');
    expect(src).toMatch(/single-timer-policy-v1/);
    // performStart must not actually invoke startSession on the work session.
    // The policy comment says "hoppar startSession helt".
    const performStartBlock = src.match(
      /const performStart = useCallback\([\s\S]*?\n    \[[^\]]*\],?\s*\n  \);/,
    );
    expect(performStartBlock, 'performStart block not found').toBeTruthy();
    expect(performStartBlock![0]).not.toMatch(/\bstartSession\s*\(/);
  });

  it('WorkDayPanel is the only timer surface and writes only to active_time_registrations', () => {
    const src = read('src/components/mobile-app/WorkDayPanel.tsx');
    expect(src).toMatch(/mobileApi\.startTimeRegistration/);
    expect(src).toMatch(/mobileApi\.stopTimeRegistration/);
    // Must not call any of the legacy timer primitives.
    expect(src).not.toMatch(/startLocationTimer/);
    expect(src).not.toMatch(/createTimeReport/);
    expect(src).not.toMatch(/enqueueTimerStart/);
    expect(src).not.toMatch(/location_time_entries/);
  });

  it('MobileGlobalOverlays stays passive (no timer/workday writes)', () => {
    const src = read('src/components/mobile-app/MobileGlobalOverlays.tsx');
    // It is allowed to mount the background location reporter and the
    // location ping handler — those produce GPS evidence only.
    expect(src).toMatch(/useBackgroundLocationReporter/);
    expect(src).toMatch(/initLocationPingHandler/);
    // It must not start/stop timers, create time reports or end the workday.
    expect(src).not.toMatch(/startTimeRegistration/);
    expect(src).not.toMatch(/stopTimeRegistration/);
    expect(src).not.toMatch(/createTimeReport/);
    expect(src).not.toMatch(/dispatchEvent\(\s*new\s+(Custom)?Event\(['"]request-end-day/);
  });
});

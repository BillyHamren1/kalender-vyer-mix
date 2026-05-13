/**
 * Contract test — APP TIMER: SINGLE VISIBLE SURFACE (rev 2026-05-08)
 * ===================================================================
 *
 * Locks the architectural decision:
 *
 *   "Tidappen ska bara ha EN synlig timer — `WorkDayPanel`, driven av
 *    `active_time_registrations` via `useActiveTimerStatus` +
 *    `mobileApi.startTimeRegistration` / `stopTimeRegistration`."
 *
 * Replaces the previous workday-driven Panel contract. Job/project/
 * location cards are read-only and must not start or stop timers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

const PANEL = 'src/components/mobile-app/WorkDayPanel.tsx';
const HEADER = 'src/components/mobile-app/MobileHeader.tsx';
const JOBS = 'src/pages/mobile/MobileJobs.tsx';

describe('App Timer · single visible surface contract', () => {
  /* 1. WorkDayPanel is the only timer surface and reads active_time_registrations. */
  it('WorkDayPanel uses useActiveTimerStatus + mobileApi start/stopTimeRegistration', () => {
    const panel = stripComments(read(PANEL));
    expect(panel).toMatch(/useActiveTimerStatus\s*\(/);
    expect(panel).toMatch(/mobileApi\.startTimeRegistration/);
    expect(panel).toMatch(/mobileApi\.stopTimeRegistration/);
    expect(panel).toMatch(/formatDuration|formatHMS/);
  });

  /* 2. WorkDayPanel must NOT depend on legacy timer engines. */
  it('WorkDayPanel does not use useWorkDay / useWorkSession / useTimerStartFlow / location_time_entries', () => {
    const panel = stripComments(read(PANEL));
    expect(panel).not.toMatch(/\buseWorkDay\b/);
    expect(panel).not.toMatch(/\buseWorkSession\b/);
    expect(panel).not.toMatch(/\buseTimerStartFlow\b/);
    expect(panel).not.toMatch(/location_time_entries/);
    expect(panel).not.toMatch(/travel_time_logs/);
  });

  /* 3. MobileHeader must not render the legacy WorkDayHeaderTimer. */
  it('MobileHeader does not import or render WorkDayHeaderTimer', () => {
    const header = stripComments(read(HEADER));
    expect(header).not.toMatch(/import\s+[^;]*WorkDayHeaderTimer/);
    expect(header).not.toMatch(/<\s*WorkDayHeaderTimer\b/);
  });

  /* 4. MobileJobs must not start/stop timers from job cards. */
  it('MobileJobs does not import useTimerStartFlow or define legacy timer toggles', () => {
    const jobs = stripComments(read(JOBS));
    expect(jobs).not.toMatch(/\buseTimerStartFlow\b/);
    expect(jobs).not.toMatch(/handleTimerToggle/);
    expect(jobs).not.toMatch(/handleProjectTimerToggle/);
    expect(jobs).not.toMatch(/handleLocationTimerToggle/);
    expect(jobs).not.toMatch(/<\s*TimerConflictDialog\b/);
    expect(jobs).not.toMatch(/<\s*DistanceWarningDialog\b/);
  });
});

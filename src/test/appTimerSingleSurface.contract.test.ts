/**
 * Contract test — APP TIMER: SINGLE VISIBLE SURFACE
 * ==================================================
 *
 * Locks the architectural decision (2026-05-06):
 *
 *   "Tidappen ska bara ha EN synlig timer — arbetsdagstimern.
 *    Projekt/plats/resa är inte egna huvudtimers, bara status-labels."
 *
 * The 10 user-stated acceptance points become 10 mechanical assertions
 * over the source tree. If anyone re-introduces a parallel running
 * "main timer" UI, demotes MyDayTimeline below the raw rows, or
 * repurposes workday/segment math in a way that double-counts — this
 * test fails the build.
 *
 * These are source-level guards on purpose: the underlying segment
 * engines (`useWorkSession`, geofence segments, `useTimerStartFlow`)
 * MAY keep producing data; the contract is purely about what the
 * mobile UI surfaces and how the day is counted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

const PANEL = 'src/components/mobile-app/WorkDayPanel.tsx';
const HEADER = 'src/components/mobile-app/WorkDayHeaderTimer.tsx';
const PROJECT_CARD =
  'src/components/mobile-app/project/MobileProjectTimerCard.tsx';
const MY_DAY = 'src/components/mobile-app/MyDayTimeline.tsx';
const TIME_REPORT_PAGE = 'src/pages/mobile/MobileTimeReport.tsx';
const TIME_HISTORY_PAGE = 'src/pages/mobile/MobileTimeHistory.tsx';
const GEOFENCING = 'src/hooks/useGeofencing.ts';

describe('App Timer · single visible surface contract', () => {
  /* 1. When workday is active, exactly ONE main rolling timer is shown. */
  it('only WorkDayPanel ticks the big HH:MM:SS clock when workday is open', () => {
    const panel = stripComments(read(PANEL));
    // The big clock is driven by a 1Hz interval (`setInterval(..., 1000)`)
    // gated on `workdayOpen`. This must exist.
    expect(panel).toMatch(/setInterval\(/);
    expect(panel).toMatch(/workdayOpen/);
    // And it must format HH:MM:SS — the visual hallmark of the main timer.
    expect(panel).toMatch(/formatHMS/);

    // The header indicator MAY tick (it's a small repeat across pages),
    // but it must derive from the SAME workday start (`useWorkDay`),
    // never from an activity timer.
    const header = stripComments(read(HEADER));
    expect(header).toMatch(/useWorkDay\s*\(/);
    expect(header).not.toMatch(/activeTimers\?\.values\(\)\.next\(\).*differenceInSeconds/s);
  });

  /* 2. Active project shows as a label/status, not a separate main timer. */
  it('MobileProjectTimerCard does not render a rolling HH:MM:SS clock', () => {
    if (!existsSync(join(ROOT, PROJECT_CARD))) return; // file may have been removed
    const src = stripComments(read(PROJECT_CARD));
    // The card must not start its own per-second tick.
    expect(src).not.toMatch(/setInterval\([^)]*1000\s*\)/);
    // And it must not format an HH:MM:SS rolling string.
    expect(src).not.toMatch(/String\([^)]*\)\.padStart\(2,\s*['"]0['"]\).*padStart\(2,\s*['"]0['"]\).*padStart\(2,\s*['"]0['"]\)/s);
  });

  /* 3. Switching project changes active distribution, never resets workday. */
  it('switching project does not call useWorkDay.start / endWorkday', () => {
    const panel = stripComments(read(PANEL));
    // Locate the handleSwitchProject body.
    const m = panel.match(/handleSwitchProject\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\}/);
    expect(m, 'handleSwitchProject must exist in WorkDayPanel').toBeTruthy();
    const body = m![1];
    expect(body).not.toMatch(/\bstart\s*\(/);
    expect(body).not.toMatch(/endWorkday|endDay\s*\(/);
    // It must merely open the picker dialog.
    expect(body).toMatch(/setDialogOpen\(true\)/);
  });

  /* 4. Geofence ENTER sets active distribution (toast announces registration). */
  it('geofence enter announces "Tid registreras" rather than "Timer startad"', () => {
    const overlays = stripComments(
      read('src/components/mobile-app/MobileGlobalOverlays.tsx'),
    );
    expect(overlays).toMatch(/Tid registreras/);
    expect(overlays).not.toMatch(/Timer startad/);
  });

  /* 5. Geofence EXIT closes distribution, workday continues. */
  it('geofence exit handler does not end the workday', () => {
    const geo = stripComments(read(GEOFENCING));
    // The workplace-exit dispatch must exist…
    expect(geo).toMatch(/workplace-exit/);
    // …and must NOT call endWorkdayFlow / mobileApi.endWorkday in the exit path.
    // (If anyone re-introduces it, the workday would be killed on every leave.)
    expect(geo).not.toMatch(/endWorkdayFlow\s*\(/);
    expect(geo).not.toMatch(/mobileApi\.endWorkday\s*\(/);
  });

  /* 6. If no active distribution → "Ej fördelat". */
  it('WorkDayPanel renders "Ej fördelat" when no active timer', () => {
    const panel = read(PANEL);
    expect(panel).toMatch(/Ej fördelat/);
    // And the fallback path must be wired to the missing-timer branch.
    expect(panel).toMatch(/getActivityLabel/);
  });

  /* 7. Profile time report shows MyDayTimeline above raw rows. */
  it('MobileTimeReport mounts MyDayTimeline before the raw report list', () => {
    const src = read(TIME_REPORT_PAGE);
    const myDayIdx = src.indexOf('<MyDayTimeline');
    const rawHeader = src.indexOf('Rådata');
    expect(myDayIdx).toBeGreaterThan(-1);
    expect(rawHeader).toBeGreaterThan(-1);
    expect(myDayIdx).toBeLessThan(rawHeader);
  });

  it('MobileTimeHistory shows MyDayTimeline before raw rows for selected day', () => {
    const src = read(TIME_HISTORY_PAGE);
    const myDayIdx = src.indexOf('<MyDayTimeline');
    const rawHeader = src.indexOf('Rådata');
    expect(myDayIdx).toBeGreaterThan(-1);
    expect(rawHeader).toBeGreaterThan(-1);
    expect(myDayIdx).toBeLessThan(rawHeader);
  });

  /* 8. Unallocated time renders neutrally (not as an error). */
  it('MyDayTimeline treats unallocated as a neutral category, not an error', () => {
    const src = read(MY_DAY);
    // Must build the timeline from the canonical builder, which classifies
    // gaps as `unallocated` rather than throwing.
    expect(src).toMatch(/buildStaffDayTimelineFromRaw/);
    // And it must not label the unallocated bucket as an error/risk.
    expect(src).not.toMatch(/Fel.*ej fördelad|risk.*unallocated/i);
  });

  /* 9. End workday closes the day and shows the total. */
  it('WorkDayPanel exposes an "Avsluta arbetsdag" action that dispatches request-end-day', () => {
    const panel = stripComments(read(PANEL));
    expect(panel).toMatch(/Avsluta arbetsdag/);
    expect(panel).toMatch(/request-end-day/);
    // And the "ended today" branch must render the total.
    expect(panel).toMatch(/Arbetsdag avslutad/);
    expect(panel).toMatch(/formatTotal\(/);
  });

  /* 10. No double-counting between workday and project segments. */
  it('Project labor basis does not also add the workday minutes on top', () => {
    // The canonical project cost helper must explicitly NOT count workday
    // as project cost (memory: time-data-authority-v1 / project-labor-basis-v1).
    const path = 'src/lib/projects/projectLaborBasis.ts';
    if (!existsSync(join(ROOT, path))) return;
    const src = stripComments(read(path));
    // Workday minutes are surfaced separately as `unallocatedWorkdayMinutes`,
    // never summed into the confirmed/project cost figure.
    expect(src).toMatch(/unallocatedWorkdayMinutes/);
  });
});

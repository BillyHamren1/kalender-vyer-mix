/**
 * Regressionstest: STRIKT SEPARATION mellan personalkalendern och
 * projektkalendern (intern bokningsplanering i stora projekt).
 *
 * Reglerna verifieras genom källkodsinspektion — de förbjudna kopplingarna
 * ska INTE finnas i de produktionsfiler som tidigare blandade ihop dem.
 *
 * Detta är medvetet ett "statiskt" test: vi vill att alla framtida AI/dev-
 * loopar omedelbart ser om någon återinför savePhaseDays-skrivvägen i
 * projektkalenderns flöde eller plockar in plannerCalendarEvents som
 * extraEvents i personalkalendervyn.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('Stora projekt — projektkalender vs personalkalender, dataisolering', () => {
  it('LargeEstablishmentPage använder LargeProjectBookingPlannerCalendar i kalenderläget', () => {
    const src = read('src/pages/project/LargeEstablishmentPage.tsx');
    expect(src).toMatch(/LargeProjectBookingPlannerCalendar/);
  });

  it('LargeEstablishmentPage skickar inte plannerCalendarEvents som extraEvents till ProjectCalendarView', () => {
    const src = read('src/pages/project/LargeEstablishmentPage.tsx');
    expect(src).not.toMatch(/from\s+['"][^'"]*useLargeProjectPlannerCalendarEvents['"]/);
    expect(src).not.toMatch(/extraEvents=\{plannerCalendarEvents\}/);
    expect(src).not.toMatch(/<ProjectCalendarView\b/);
    expect(src).not.toMatch(/rightPanel=\{<LargeProjectPlannerPanel/);
  });

  it('LargeProjectPlannerPanel.handlePlanWholeBooking använder inte savePhaseDays', () => {
    const src = read('src/components/project/large-planner/LargeProjectPlannerPanel.tsx');
    expect(src).not.toMatch(/savePhaseDays/);
    expect(src).not.toMatch(/phaseDaysWriter/);
  });

  it('LargeProjectPlannerPanel skriver inte till calendar_events/staff_assignments/bookings via supabase', () => {
    const src = read('src/components/project/large-planner/LargeProjectPlannerPanel.tsx');
    // .from('calendar_events') / .from('staff_assignments') / .from('bookings') / .from('booking_staff_assignments') / .from('large_project_team_assignments')
    expect(src).not.toMatch(/from\(\s*['"]calendar_events['"]/);
    expect(src).not.toMatch(/from\(\s*['"]staff_assignments['"]/);
    expect(src).not.toMatch(/from\(\s*['"]booking_staff_assignments['"]/);
    expect(src).not.toMatch(/from\(\s*['"]large_project_team_assignments['"]/);
    expect(src).not.toMatch(/from\(\s*['"]bookings['"]/);
  });

  it('LargeProjectBookingPlannerCalendar skriver inte direkt till skyddade tabeller', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx',
    );
    expect(src).not.toMatch(/from\(\s*['"]calendar_events['"]/);
    expect(src).not.toMatch(/from\(\s*['"]staff_assignments['"]/);
    expect(src).not.toMatch(/from\(\s*['"]booking_staff_assignments['"]/);
    expect(src).not.toMatch(/from\(\s*['"]large_project_team_assignments['"]/);
    expect(src).not.toMatch(/savePhaseDays/);
  });

  it('largeProjectPlannerService.ts skriver bara till large_project_booking_plan_items (mutationer)', () => {
    const src = read(
      'src/components/project/large-planner/largeProjectPlannerService.ts',
    );
    // Tillåt SELECT från calendar_events/staff_assignments (read-only bemanning),
    // men inga write-anrop (.insert/.update/.delete/.upsert) mot dem.
    const protectedTables = [
      'calendar_events',
      'staff_assignments',
      'booking_staff_assignments',
      'large_project_team_assignments',
      'bookings',
    ];
    for (const t of protectedTables) {
      const writeRegex = new RegExp(
        `from\\(\\s*['"]${t}['"][\\s\\S]{0,400}?\\.(insert|update|delete|upsert)\\(`,
      );
      expect(src, `${t} får inte skrivas till från projektkalendern`).not.toMatch(writeRegex);
    }
  });
});

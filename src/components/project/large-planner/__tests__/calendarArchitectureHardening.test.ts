/**
 * Regressionstester för den hårdare separationen mellan
 * personalkalendern och stora projektets interna projektkalender.
 *
 * Källkodsbaserade tester — vi vill upptäcka direkt om någon framtida
 * ändring återinför den gamla blandvägen.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const exists = (rel: string) => existsSync(resolve(process.cwd(), rel));

describe('Kalenderarkitektur — separationshärdning', () => {
  // ── Borttagen död hook ────────────────────────────────────────────────
  it('useLargeProjectPlannerCalendarEvents.ts existerar inte längre', () => {
    expect(
      exists('src/components/project/large-planner/useLargeProjectPlannerCalendarEvents.ts'),
    ).toBe(false);
  });

  // ── eventService.ts: personalkalendern exkluderar event-fasen ────────
  it('eventService.fetchCalendarEvents filtrerar bort event_type=event', () => {
    const src = read('src/services/eventService.ts');
    expect(src).toMatch(/\.neq\(\s*['"]event_type['"]\s*,\s*['"]event['"]\s*\)/);
  });

  it('eventService.ts dokumenterar event-fas-exkluderingen', () => {
    const src = read('src/services/eventService.ts');
    expect(src.toLowerCase()).toContain('staff-calendar-no-event-day-v1');
  });

  // ── plannerCalendarDerivation: event-fasen hopas ─────────────────────
  it('plannerCalendarDerivation hoppar phase==="event"', () => {
    const src = read('src/services/plannerCalendarDerivation.ts');
    expect(src).toMatch(/phase\s*===\s*['"]event['"][\s\S]{0,200}continue/);
    expect(src.toLowerCase()).toContain('staff-calendar-no-event-day-v1');
  });

  // ── LargeProjectPlannerCalendarAdapter ───────────────────────────────
  it('Adapter exponerar UNASSIGNED_RESOURCE_ID och INGEN DEFAULT_TEAM_ID', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts',
    );
    expect(src).toMatch(/export const UNASSIGNED_RESOURCE_ID\s*=/);
    expect(src).not.toMatch(/export const DEFAULT_TEAM_ID\s*=/);
  });

  it('Adapter filtrerar bort source_booking_phase==="event"', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts',
    );
    expect(src).toMatch(/source_booking_phase\s*===\s*['"]event['"]/);
  });

  it('Adapter filtrerar bort booking_product_id-items', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts',
    );
    expect(src).toMatch(/it\.booking_product_id/);
  });

  // ── LargeProjectBookingPlannerCalendar isolerad ──────────────────────
  it('LargeProjectBookingPlannerCalendar importerar inte useRealTimeCalendarEvents', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx',
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*useRealTimeCalendarEvents['"]/);
  });

  it('LargeProjectBookingPlannerCalendar importerar inte useUnifiedStaffOperations', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx',
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*useUnifiedStaffOperations['"]/);
  });

  it('LargeProjectBookingPlannerCalendar importerar inte CustomCalendar/ProjectCalendarView', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx',
    );
    expect(src).not.toMatch(/from\s+['"]@\/components\/Calendar\/CustomCalendar['"]/);
    expect(src).not.toMatch(/from\s+['"]@\/components\/project\/ProjectCalendarView['"]/);
  });

  // ── LargeProjectPlannerCalendarView isolerad ─────────────────────────
  it('LargeProjectPlannerCalendarView importerar inte CustomCalendar/ProjectCalendarView', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx',
    );
    expect(src).not.toMatch(/from\s+['"]@\/components\/Calendar\/CustomCalendar['"]/);
    expect(src).not.toMatch(/from\s+['"]@\/components\/project\/ProjectCalendarView['"]/);
  });

  it('LargeProjectPlannerCalendarView importerar inte useRealTimeCalendarEvents/useUnifiedStaffOperations', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx',
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*useRealTimeCalendarEvents['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*useUnifiedStaffOperations['"]/);
  });

  // ── LargeEstablishmentPage använder rätt kalender ────────────────────
  it('LargeEstablishmentPage renderar LargeProjectBookingPlannerCalendar, inte ProjectCalendarView', () => {
    const src = read('src/pages/project/LargeEstablishmentPage.tsx');
    expect(src).toMatch(/<LargeProjectBookingPlannerCalendar/);
    expect(src).not.toMatch(/<ProjectCalendarView/);
    expect(src).not.toMatch(/useLargeProjectPlannerCalendarEvents/);
  });

  // ── ProjectCalendarView är markerad som LEGACY + dev-guard ───────────
  it('ProjectCalendarView innehåller LEGACY-kommentar och dev-guard mot isLargeProject', () => {
    const src = read('src/components/project/ProjectCalendarView.tsx');
    expect(src).toContain('LEGACY');
    expect(src).toMatch(/FORBIDDEN USAGE/);
    expect(src).toMatch(/isLargeProject\s*&&\s*import\.meta\.env\?\.DEV/);
  });

  // ── Personalkalendern läser inte large_project_booking_plan_items ────
  it('eventService.ts läser inte large_project_booking_plan_items', () => {
    const src = read('src/services/eventService.ts');
    expect(src).not.toMatch(/large_project_booking_plan_items/);
  });

  it('useRealTimeCalendarEvents.tsx läser inte large_project_booking_plan_items', () => {
    const src = read('src/hooks/useRealTimeCalendarEvents.tsx');
    expect(src).not.toMatch(/large_project_booking_plan_items/);
  });

  it('plannerCalendarDerivation.ts läser inte large_project_booking_plan_items', () => {
    const src = read('src/services/plannerCalendarDerivation.ts');
    expect(src).not.toMatch(/large_project_booking_plan_items/);
  });
});

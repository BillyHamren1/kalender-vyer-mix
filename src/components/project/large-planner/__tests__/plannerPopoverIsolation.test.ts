/**
 * Statiskt isoleringstest: planner-popovern och add-day-dialogen får
 * ALDRIG skriva till personalkalenderns tabeller. Allt ska gå via
 * useLargeProjectPlannerItems (large_project_booking_plan_items).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const FORBIDDEN_TABLES = [
  'calendar_events',
  'staff_assignments',
  'booking_staff_assignments',
  'large_project_team_assignments',
  'bookings',
];

const FORBIDDEN_SERVICES = [
  // Personalkalenderns skrivvägar
  '@/services/eventService',
  'updateCalendarEvent',
  'deleteCalendarEvent',
  'phaseDaysWriter',
  'savePhaseDays',
  'moveLargeProjectDay',
  'recompute_booking_staff_for_day',
];

describe('Planner popover + add-day dialog — strikt isolering', () => {
  const popover = read('src/components/project/large-planner/PlannerEventActionPopover.tsx');
  const dialog = read('src/components/project/large-planner/PlannerAddPhaseDayDialog.tsx');

  it('PlannerEventActionPopover importerar inte personalkalenderns skrivvägar', () => {
    for (const sym of FORBIDDEN_SERVICES) {
      expect(popover, `popover får inte använda ${sym}`).not.toContain(sym);
    }
  });

  it('PlannerAddPhaseDayDialog importerar inte personalkalenderns skrivvägar', () => {
    for (const sym of FORBIDDEN_SERVICES) {
      expect(dialog, `dialog får inte använda ${sym}`).not.toContain(sym);
    }
  });

  it('Ingen av filerna gör supabase.from(<skyddad tabell>)', () => {
    for (const t of FORBIDDEN_TABLES) {
      const rx = new RegExp(`from\\(\\s*['"]${t}['"]`);
      expect(popover, `popover får inte träffa ${t}`).not.toMatch(rx);
      expect(dialog, `dialog får inte träffa ${t}`).not.toMatch(rx);
    }
  });

  it('Båda går via useLargeProjectPlannerItems (planner-tabellen)', () => {
    expect(popover).toMatch(/useLargeProjectPlannerItems/);
    expect(dialog).toMatch(/useLargeProjectPlannerItems/);
  });

  it('CustomEvent routar kind=planner_item till PlannerEventActionPopover', () => {
    const src = read('src/components/Calendar/CustomEvent.tsx');
    expect(src).toMatch(/PlannerEventActionPopover/);
    expect(src).toMatch(/kind === 'planner_item'/);
  });

  it('Adaptern märker alla planner-events med kind=planner_item', () => {
    const src = read('src/components/project/large-planner/LargeProjectPlannerCalendarAdapter.ts');
    expect(src).toMatch(/kind:\s*'planner_item'/);
    expect(src).toMatch(/plannerLargeProjectId/);
    expect(src).toMatch(/plannerBookingId/);
    expect(src).toMatch(/plannerPhase/);
  });
});

/**
 * Regressionstest: stora projektets ISOLERADE projektkalender återanvänder
 * personalkalenderns visuella TimeGrid-UI men har separat datalager.
 *
 * Statisk källkodsinspektion + enhetstest av adaptern.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPlannerResourcesForDay,
  mapPlannerItemsToCalendarEvents,
  plannerItemIdFromEventId,
  UNASSIGNED_RESOURCE_ID,
  PLANNER_EVENT_ID_PREFIX,
} from '../LargeProjectPlannerCalendarAdapter';
import type { PlannerItemWithValidity } from '../useLargeProjectPlannerItems';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('Stora projekt — projektkalender UI/data-separation', () => {
  // ── Källkodsinspektion ───────────────────────────────────────────────────
  it('LargeEstablishmentPage renderar LargeProjectBookingPlannerCalendar', () => {
    const src = read('src/pages/project/LargeEstablishmentPage.tsx');
    expect(src).toMatch(/<LargeProjectBookingPlannerCalendar/);
  });

  it('LargeProjectBookingPlannerCalendar använder den isolerade kalendervyn (TimeGrid-baserad)', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx',
    );
    expect(src).toMatch(/LargeProjectPlannerCalendarView/);
  });

  it('LargeProjectPlannerCalendarView importerar TimeGrid (samma UI som personalkalendern)', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx',
    );
    expect(src).toMatch(/from\s+['"]@\/components\/Calendar\/TimeGrid['"]/);
  });

  it('LargeProjectPlannerCalendarView importerar inte ProjectCalendarView eller CustomCalendar', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx',
    );
    expect(src).not.toMatch(/from\s+['"]@\/components\/project\/ProjectCalendarView['"]/);
    expect(src).not.toMatch(/from\s+['"]@\/components\/Calendar\/CustomCalendar['"]/);
  });

  it('LargeProjectPlannerCalendarView använder inte personalkalenderns write-hooks', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx',
    );
    expect(src).not.toMatch(/useUnifiedStaffOperations/);
    expect(src).not.toMatch(/useRealTimeCalendarEvents/);
    expect(src).not.toMatch(/useEventDragDrop\(/);
  });

  it('LargeProjectPlannerCalendarView drop-handler kallar updateItem (→ large_project_booking_plan_items)', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx',
    );
    expect(src).toMatch(/updateItem\(/);
  });

  it('LargeProjectPlannerCalendarView skriver inte direkt till skyddade tabeller', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectPlannerCalendarView.tsx',
    );
    for (const t of [
      'calendar_events',
      'staff_assignments',
      'booking_staff_assignments',
      'large_project_team_assignments',
      'bookings',
    ]) {
      expect(src).not.toMatch(new RegExp(`from\\(\\s*['"]${t}['"]`));
    }
  });

  it('LargeProjectBookingPlannerCalendar importerar inte personalkalenderns write-hooks', () => {
    const src = read(
      'src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx',
    );
    expect(src).not.toMatch(/useUnifiedStaffOperations/);
    expect(src).not.toMatch(/useRealTimeCalendarEvents/);
  });

  // ── Adapter-enhetstest ───────────────────────────────────────────────────
  it('buildPlannerResourcesForDay returnerar personer per dag + Ej tilldelat sist', () => {
    const resources = buildPlannerResourcesForDay([
      { id: 'staff-1', name: 'Anna', color: '#FF0000', assignedDates: ['2026-05-27'] },
      { id: 'staff-2', name: 'Bo', color: null, assignedDates: ['2026-05-27'] },
    ]);
    expect(resources).toHaveLength(3);
    expect(resources[0].id).toBe('staff-1');
    expect(resources[0].title).toBe('Anna');
    expect(resources[1].id).toBe('staff-2');
    expect(resources[2].id).toBe(UNASSIGNED_RESOURCE_ID);
    expect(resources[2].title).toBe('Ej tilldelat');
  });

  it('mapPlannerItemsToCalendarEvents — items renderas från large_project_booking_plan_items, resourceId=staffId', () => {
    const items: PlannerItemWithValidity[] = [
      {
        id: 'item-1',
        large_project_id: 'lp-1',
        booking_id: 'book-1',
        parent_item_id: null,
        title: 'Lastning på lager',
        description: null,
        item_type: 'booking',
        phase: null,
        plan_date: '2026-05-27',
        start_time: '08:00:00',
        end_time: '12:00:00',
        assigned_staff_id: 'staff-1',
        assigned_team_id: null,
        status: 'planned',
        source: 'booking',
        source_booking_phase: null,
        sort_order: 0,
        notes: null,
        metadata: {},
        booking_product_id: null,
        created_at: '',
        updated_at: '',
        isAssignedStaffAllowed: true,
        assignmentWarning: null,
      },
    ];
    const events = mapPlannerItemsToCalendarEvents(items, { largeProjectId: 'lp-1' });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(`${PLANNER_EVENT_ID_PREFIX}item-1`);
    expect(events[0].resourceId).toBe('staff-1');
    expect(events[0].start).toBe('2026-05-27T08:00:00');
    expect(events[0].extendedProps?.isLargeProjectPlannerItem).toBe(true);
    expect(events[0].extendedProps?.plannerItemId).toBe('item-1');
    expect(events[0].extendedProps?.assignmentInvalid).toBe(false);
  });

  it('mapPlannerItemsToCalendarEvents — obemannad assigned_staff_id routas till Ej tilldelat med "Bemanning saknas"', () => {
    const items: PlannerItemWithValidity[] = [
      {
        id: 'item-2',
        large_project_id: 'lp-1',
        booking_id: null,
        parent_item_id: null,
        title: 'Rigga scen',
        description: null,
        item_type: 'task',
        phase: null,
        plan_date: '2026-05-28',
        start_time: null,
        end_time: null,
        assigned_staff_id: 'staff-not-on-day',
        assigned_team_id: null,
        status: 'planned',
        source: 'manual',
        source_booking_phase: null,
        sort_order: 0,
        notes: null,
        metadata: {},
        booking_product_id: null,
        created_at: '',
        updated_at: '',
        isAssignedStaffAllowed: false,
        assignmentWarning: 'Personen är inte bemannad på projektet den här dagen.',
      },
    ];
    const events = mapPlannerItemsToCalendarEvents(items, { largeProjectId: 'lp-1' });
    expect(events).toHaveLength(1);
    expect(events[0].resourceId).toBe(UNASSIGNED_RESOURCE_ID);
    expect(events[0].extendedProps?.assignmentInvalid).toBe(true);
    expect(events[0].extendedProps?.assignmentInvalidReason).toBe('Bemanning saknas');
  });

  it('mapPlannerItemsToCalendarEvents — orderrad-todos (booking_product_id) filtreras bort (egen renderingsregel)', () => {
    const items: PlannerItemWithValidity[] = [
      {
        id: 'item-3',
        large_project_id: 'lp-1',
        booking_id: 'book-1',
        parent_item_id: null,
        title: 'Plocka 4x Profil 12',
        description: null,
        item_type: 'task',
        phase: null,
        plan_date: '2026-05-27',
        start_time: null,
        end_time: null,
        assigned_staff_id: null,
        assigned_team_id: null,
        status: 'planned',
        source: 'manual',
        source_booking_phase: null,
        sort_order: 0,
        notes: null,
        metadata: {},
        booking_product_id: 'bp-1',
        created_at: '',
        updated_at: '',
        isAssignedStaffAllowed: true,
        assignmentWarning: null,
      },
    ];
    const events = mapPlannerItemsToCalendarEvents(items, { largeProjectId: 'lp-1' });
    expect(events).toHaveLength(0);
  });

  it('plannerItemIdFromEventId — endast events med planner-prefix extraheras', () => {
    expect(plannerItemIdFromEventId(`${PLANNER_EVENT_ID_PREFIX}abc`)).toBe('abc');
    expect(plannerItemIdFromEventId('calendar-event-123')).toBeNull();
  });

  // ── TimeGrid har plannerMode-läge ────────────────────────────────────────
  it('TimeGrid exponerar plannerMode-prop som döljer +-knapp och staff-rad', () => {
    const src = read('src/components/Calendar/TimeGrid.tsx');
    expect(src).toMatch(/plannerMode\?:\s*boolean/);
    expect(src).toMatch(/!plannerMode\s*&&[\s\S]{0,400}TeamStaffPickerPopover/);
    expect(src).toMatch(/!plannerMode\s*&&[\s\S]{0,400}staff-row-time-cell/);
  });
});

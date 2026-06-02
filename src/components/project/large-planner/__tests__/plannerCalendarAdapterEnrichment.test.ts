/**
 * Verifierar att projektkalenderns adapter berikar booking-fasblock med:
 *  - plannerPhaseLabel (Rigg / Nedmontering)
 *  - plannerTodoTotal / plannerTodoDone per (booking_id, plan_date)
 * Eventdagar filtreras bort (Staff Calendar No Event Day).
 */
import { describe, it, expect } from 'vitest';
import { mapPlannerItemsToCalendarEvents } from '../LargeProjectPlannerCalendarAdapter';
import type { PlannerItemWithValidity } from '../useLargeProjectPlannerItems';

const base = {
  large_project_id: 'lp-1',
  parent_item_id: null,
  description: null,
  phase: null,
  start_time: '08:00:00',
  end_time: '17:00:00',
  assigned_staff_id: null,
  assigned_team_id: null,
  source: 'booking' as const,
  sort_order: 0,
  notes: null,
  metadata: {},
  booking_product_id: null,
  created_at: '',
  updated_at: '',
  isAssignedStaffAllowed: true,
  assignmentWarning: null,
};

describe('LargeProjectPlannerCalendarAdapter – berikning', () => {
  it('renderar Rigg-fasblock med phaseLabel + todo-progress', () => {
    const items: PlannerItemWithValidity[] = [
      {
        ...base,
        id: 'rig-1',
        booking_id: 'book-A',
        title: 'Rigg — Acme',
        item_type: 'booking',
        plan_date: '2026-06-08',
        status: 'planned',
        source_booking_phase: 'rig',
      },
      // 2 todos varav 1 klar för samma bokning+datum
      {
        ...base,
        id: 'todo-1',
        booking_id: 'book-A',
        title: 'Montera entrébåge',
        item_type: 'task',
        plan_date: '2026-06-08',
        status: 'planned',
        source: 'manual',
        source_booking_phase: null,
      },
      {
        ...base,
        id: 'todo-2',
        booking_id: 'book-A',
        title: 'Kontrollera kabeldragning',
        item_type: 'task',
        plan_date: '2026-06-08',
        status: 'done',
        source: 'manual',
        source_booking_phase: null,
      },
    ];

    const events = mapPlannerItemsToCalendarEvents(items, { largeProjectId: 'lp-1' });
    expect(events).toHaveLength(1);
    const ep = events[0].extendedProps as Record<string, unknown>;
    expect(ep.plannerPhaseLabel).toBe('Rigg');
    expect(ep.plannerTodoTotal).toBe(2);
    expect(ep.plannerTodoDone).toBe(1);
    expect(ep.plannerItemType).toBe('booking');
    expect(ep.plannerBookingId).toBe('book-A');
  });

  it('eventdagar filtreras bort, Nedmontering får rätt label', () => {
    const items: PlannerItemWithValidity[] = [
      {
        ...base,
        id: 'evt-1',
        booking_id: 'book-A',
        title: 'Event',
        item_type: 'booking',
        plan_date: '2026-06-09',
        status: 'planned',
        source_booking_phase: 'event',
      },
      {
        ...base,
        id: 'down-1',
        booking_id: 'book-A',
        title: 'Nedmontering',
        item_type: 'booking',
        plan_date: '2026-06-10',
        status: 'planned',
        source_booking_phase: 'rigDown',
      },
    ];
    const events = mapPlannerItemsToCalendarEvents(items, { largeProjectId: 'lp-1' });
    expect(events).toHaveLength(1);
    expect((events[0].extendedProps as any).plannerPhaseLabel).toBe('Nedmontering');
    expect((events[0].extendedProps as any).plannerTodoTotal).toBe(0);
  });

  it('todos utan booking_id räknas inte mot någon kalenderpost', () => {
    const items: PlannerItemWithValidity[] = [
      {
        ...base,
        id: 'rig-1',
        booking_id: 'book-A',
        title: 'Rigg',
        item_type: 'booking',
        plan_date: '2026-06-08',
        status: 'planned',
        source_booking_phase: 'rig',
      },
      {
        ...base,
        id: 'free-todo',
        booking_id: null,
        title: 'Fri todo',
        item_type: 'manual',
        plan_date: '2026-06-08',
        status: 'planned',
        source: 'manual',
        source_booking_phase: null,
      },
    ];
    const events = mapPlannerItemsToCalendarEvents(items, { largeProjectId: 'lp-1' });
    expect(events).toHaveLength(1);
    expect((events[0].extendedProps as any).plannerTodoTotal).toBe(0);
  });
});

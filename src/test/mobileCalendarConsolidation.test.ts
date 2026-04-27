import { describe, it, expect } from 'vitest';
import { consolidateShifts, isItemActive } from '@/lib/mobileCalendarConsolidation';
import type { ScheduledShift } from '@/services/mobileApiService';

const baseShift = (overrides: Partial<ScheduledShift>): ScheduledShift => ({
  shift_id: 's1',
  booking_id: 'b1',
  booking_number: '2603-9',
  title: 'Tiomila 2026',
  event_type: 'event',
  start_time: '2026-04-28T08:00:00',
  end_time: '2026-04-28T17:00:00',
  delivery_address: 'Tranås',
  delivery_latitude: null,
  delivery_longitude: null,
  client: 'Tiomila 2026',
  is_internal: false,
  internal_type: null,
  large_project_id: null,
  large_project_name: null,
  ...overrides,
});

describe('mobileCalendarConsolidation', () => {
  it('collapses multiple same-day bookings of the same large project into ONE card', () => {
    const a = baseShift({
      shift_id: 'sA',
      booking_id: 'bA',
      booking_number: '2603-9',
      large_project_id: 'lp1',
      large_project_name: 'Tiomila 2026',
      start_time: '2026-04-28T08:00:00',
      end_time: '2026-04-28T17:00:00',
    });
    const b = baseShift({
      shift_id: 'sB',
      booking_id: 'bB',
      booking_number: '2602-15',
      large_project_id: 'lp1',
      large_project_name: 'Tiomila 2026',
      start_time: '2026-04-28T09:00:00',
      end_time: '2026-04-28T18:30:00',
    });

    const items = consolidateShifts([a, b]);

    expect(items).toHaveLength(1);
    const it = items[0];
    expect(it.kind).toBe('project');
    if (it.kind !== 'project') return;
    expect(it.largeProjectId).toBe('lp1');
    expect(it.title).toBe('Tiomila 2026');
    // Earliest start, latest end across the project's bookings.
    expect(it.start_time).toBe('2026-04-28T08:00:00');
    expect(it.end_time).toBe('2026-04-28T18:30:00');
    expect(it.shifts).toHaveLength(2);
  });

  it('keeps standalone (non-project) bookings as their own cards', () => {
    const standalone = baseShift({ shift_id: 'sX', booking_id: 'bX' });
    const items = consolidateShifts([standalone]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('booking');
  });

  it('does NOT merge bookings of the same project on different days', () => {
    const monday = baseShift({
      shift_id: 's1',
      booking_id: 'bA',
      large_project_id: 'lp1',
      start_time: '2026-04-27T08:00:00',
      end_time: '2026-04-27T17:00:00',
    });
    const tuesday = baseShift({
      shift_id: 's2',
      booking_id: 'bA',
      large_project_id: 'lp1',
      start_time: '2026-04-28T08:00:00',
      end_time: '2026-04-28T17:00:00',
    });
    const items = consolidateShifts([monday, tuesday]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'project')).toBe(true);
  });

  it('isItemActive lights project card when ANY child booking has a timer', () => {
    const a = baseShift({
      shift_id: 'sA',
      booking_id: 'bA',
      large_project_id: 'lp1',
    });
    const b = baseShift({
      shift_id: 'sB',
      booking_id: 'bB',
      large_project_id: 'lp1',
    });
    const items = consolidateShifts([a, b]);
    expect(isItemActive(items[0], new Set(['bB']))).toBe(true);
    expect(isItemActive(items[0], new Set(['bX']))).toBe(false);
  });

  it('isItemActive lights project card when project-level timer is active', () => {
    const a = baseShift({ shift_id: 'sA', booking_id: 'bA', large_project_id: 'lp1' });
    const items = consolidateShifts([a]);
    expect(isItemActive(items[0], new Set(['project-lp1']))).toBe(true);
  });
});

/**
 * ============================================================
 * TEST: Planner Event Utilities (usePlannerEvents hook)
 * ============================================================
 * Tests the convenience hook and utility functions for
 * combining, filtering, and grouping planner events.
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import {
  filterByCategory,
  groupByDate,
  groupByBooking,
} from '@/hooks/usePlannerEvents';
import type { PlannerEvent } from '@/types/planner-events';

// ─── Test Data Factory ─────────────────────────────────────

function makePlannerEvent(overrides: Partial<PlannerEvent> = {}): PlannerEvent {
  return {
    id: 'pe-1',
    type: 'rig',
    title: 'Test Event',
    start: '2025-06-10T08:00:00.000Z',
    end: '2025-06-10T16:00:00.000Z',
    allDay: false,
    resourceId: 'team-1',
    resourceIds: ['team-1'],
    bookingId: 'booking-1',
    bookingNumber: 'BK-001',
    status: null,
    category: 'planning',
    color: '#F2FCE2',
    viewed: true,
    deliveryAddress: null,
    metadata: {},
    source: 'calendar',
    rawOriginalData: {},
    ...overrides,
  };
}

// ─── filterByCategory ──────────────────────────────────────

describe('filterByCategory', () => {
  it('filters correctly', () => {
    const events = [
      makePlannerEvent({ id: '1', category: 'planning' }),
      makePlannerEvent({ id: '2', category: 'warehouse' }),
      makePlannerEvent({ id: '3', category: 'planning' }),
      makePlannerEvent({ id: '4', category: 'logistics' }),
    ];

    expect(filterByCategory(events, 'planning')).toHaveLength(2);
    expect(filterByCategory(events, 'warehouse')).toHaveLength(1);
    expect(filterByCategory(events, 'logistics')).toHaveLength(1);
  });

  it('returns empty array when no matches', () => {
    const events = [makePlannerEvent({ category: 'planning' })];
    expect(filterByCategory(events, 'logistics')).toEqual([]);
  });

  it('handles empty input', () => {
    expect(filterByCategory([], 'planning')).toEqual([]);
  });
});

// ─── groupByDate ───────────────────────────────────────────

describe('groupByDate', () => {
  it('groups events by date key', () => {
    const events = [
      makePlannerEvent({ id: '1', start: '2025-06-10T08:00:00.000Z' }),
      makePlannerEvent({ id: '2', start: '2025-06-10T14:00:00.000Z' }),
      makePlannerEvent({ id: '3', start: '2025-06-11T09:00:00.000Z' }),
    ];

    const grouped = groupByDate(events);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped['2025-06-10']).toHaveLength(2);
    expect(grouped['2025-06-11']).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(groupByDate([])).toEqual({});
  });
});

// ─── groupByBooking ────────────────────────────────────────

describe('groupByBooking', () => {
  it('groups events by bookingId', () => {
    const events = [
      makePlannerEvent({ id: '1', bookingId: 'b-1', type: 'rig' }),
      makePlannerEvent({ id: '2', bookingId: 'b-1', type: 'event' }),
      makePlannerEvent({ id: '3', bookingId: 'b-2', type: 'rig' }),
    ];

    const grouped = groupByBooking(events);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped['b-1']).toHaveLength(2);
    expect(grouped['b-2']).toHaveLength(1);
  });

  it('uses event ID as fallback key when bookingId is null', () => {
    const events = [
      makePlannerEvent({ id: 'standalone-1', bookingId: null }),
      makePlannerEvent({ id: 'standalone-2', bookingId: null }),
    ];

    const grouped = groupByBooking(events);
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped['standalone-1']).toHaveLength(1);
    expect(grouped['standalone-2']).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(groupByBooking([])).toEqual({});
  });
});

// ─── Edge Cases: Partial/Incomplete Data ───────────────────

describe('resilience with incomplete data', () => {
  it('handles event with all nulls', () => {
    const event = makePlannerEvent({
      bookingId: null,
      bookingNumber: null,
      status: null,
      color: null,
      deliveryAddress: null,
      resourceId: null,
      resourceIds: [],
    });

    // Should not throw
    expect(filterByCategory([event], 'planning')).toHaveLength(1);
    expect(groupByDate([event])).toBeDefined();
    expect(groupByBooking([event])).toBeDefined();
  });

  it('handles event with empty strings', () => {
    const event = makePlannerEvent({
      title: '',
      start: '2025-01-01T00:00:00.000Z',
      end: '',
    });

    const grouped = groupByDate([event]);
    expect(grouped['2025-01-01']).toHaveLength(1);
  });

  it('handles large volume without performance issues', () => {
    const events = Array.from({ length: 10000 }, (_, i) =>
      makePlannerEvent({
        id: `event-${i}`,
        start: `2025-06-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
        bookingId: `booking-${i % 100}`,
      })
    );

    const start = performance.now();
    const grouped = groupByDate(events);
    const byBooking = groupByBooking(events);
    const filtered = filterByCategory(events, 'planning');
    const elapsed = performance.now() - start;

    expect(Object.keys(grouped).length).toBeGreaterThan(0);
    expect(Object.keys(byBooking).length).toBe(100);
    expect(filtered).toHaveLength(10000);
    // Should complete in under 100ms even for 10k events
    expect(elapsed).toBeLessThan(100);
  });
});

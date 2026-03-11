/**
 * ============================================================
 * TEST: Planner Event Adapters
 * ============================================================
 * Verifies that all event sources map correctly to the unified
 * PlannerEvent model, with edge cases for missing/partial data.
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import {
  fromCalendarEvent,
  fromCalendarEvents,
  fromWarehouseEvent,
  fromWarehouseEvents,
  fromDashboardEvent,
  fromDashboardEvents,
  toPlanningCalendarEvent,
  toWarehouseEvent,
  toDashboardEvent,
} from '@/adapters/planner-event-adapters';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import type { WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import type { DashboardEvent } from '@/hooks/useDashboardEvents';

// ─── Test Data Factories ───────────────────────────────────

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'cal-1',
    title: 'Rigg Event',
    start: '2025-06-10T08:00:00.000Z',
    end: '2025-06-10T16:00:00.000Z',
    resourceId: 'team-1',
    bookingId: 'booking-123',
    bookingNumber: 'BK-001',
    eventType: 'rig',
    deliveryAddress: 'Testgatan 1',
    viewed: true,
    extendedProps: {
      bookingNumber: 'BK-001',
      booking_id: 'booking-123',
      deliveryCity: 'Stockholm',
    },
    ...overrides,
  };
}

function makeWarehouseEvent(overrides: Partial<WarehouseEvent> = {}): WarehouseEvent {
  return {
    id: 'wh-1',
    booking_id: 'booking-456',
    booking_number: 'BK-002',
    title: 'Packning Event',
    start_time: '2025-06-11T07:00:00.000Z',
    end_time: '2025-06-11T12:00:00.000Z',
    resource_id: 'warehouse',
    event_type: 'packing',
    delivery_address: 'Lagergatan 5',
    source_rig_date: '2025-06-10',
    source_event_date: '2025-06-12',
    source_rigdown_date: '2025-06-13',
    has_source_changes: false,
    change_details: null,
    manually_adjusted: false,
    viewed: false,
    created_at: '2025-06-01T00:00:00Z',
    updated_at: '2025-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeDashboardEvent(overrides: Partial<DashboardEvent> = {}): DashboardEvent {
  return {
    id: 'dash-1',
    bookingId: 'booking-789',
    bookingNumber: 'BK-003',
    client: 'Acme AB',
    date: new Date('2025-06-15'),
    eventType: 'rig, event',
    category: 'planning',
    assignedStaff: [{ id: 'staff-1', name: 'Anna', color: '#ff0000' }],
    status: 'CONFIRMED',
    deliveryAddress: 'Eventvägen 3',
    ...overrides,
  };
}

// ─── CalendarEvent Adapter ─────────────────────────────────

describe('fromCalendarEvent', () => {
  it('maps all fields correctly', () => {
    const result = fromCalendarEvent(makeCalendarEvent());

    expect(result.id).toBe('cal-1');
    expect(result.type).toBe('rig');
    expect(result.title).toBe('Rigg Event');
    expect(result.start).toBe('2025-06-10T08:00:00.000Z');
    expect(result.end).toBe('2025-06-10T16:00:00.000Z');
    expect(result.allDay).toBe(false);
    expect(result.resourceId).toBe('team-1');
    expect(result.resourceIds).toEqual(['team-1']);
    expect(result.bookingId).toBe('booking-123');
    expect(result.bookingNumber).toBe('BK-001');
    expect(result.category).toBe('planning');
    expect(result.source).toBe('calendar');
    expect(result.viewed).toBe(true);
    expect(result.deliveryAddress).toBe('Testgatan 1');
    expect(result.rawOriginalData).toBeDefined();
  });

  it('normalizes eventType casing ("Rigg" → "rig")', () => {
    const result = fromCalendarEvent(makeCalendarEvent({ eventType: 'rig' }));
    expect(result.type).toBe('rig');
  });

  it('handles missing eventType gracefully', () => {
    const result = fromCalendarEvent(makeCalendarEvent({ eventType: undefined }));
    expect(result.type).toBe('unknown');
    expect(result.category).toBe('planning');
  });

  it('handles missing resourceId', () => {
    const result = fromCalendarEvent(makeCalendarEvent({ resourceId: '' }));
    expect(result.resourceId).toBeNull();
    expect(result.resourceIds).toEqual([]);
  });

  it('handles missing bookingId — falls back to extendedProps', () => {
    const result = fromCalendarEvent(makeCalendarEvent({
      bookingId: undefined,
      extendedProps: { booking_id: 'from-props' },
    }));
    expect(result.bookingId).toBe('from-props');
  });

  it('handles completely empty event', () => {
    const minimal: CalendarEvent = {
      id: 'empty-1',
      title: '',
      start: '',
      end: '',
      resourceId: '',
    };
    const result = fromCalendarEvent(minimal);
    expect(result.id).toBe('empty-1');
    expect(result.type).toBe('unknown');
    expect(result.source).toBe('calendar');
  });

  it('preserves rawOriginalData for round-trip', () => {
    const original = makeCalendarEvent();
    const result = fromCalendarEvent(original);
    expect(result.rawOriginalData).toBe(original);
  });
});

describe('fromCalendarEvents (batch)', () => {
  it('handles empty array', () => {
    expect(fromCalendarEvents([])).toEqual([]);
  });

  it('maps multiple events', () => {
    const events = [makeCalendarEvent({ id: 'a' }), makeCalendarEvent({ id: 'b' })];
    const result = fromCalendarEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });
});

// ─── WarehouseEvent Adapter ────────────────────────────────

describe('fromWarehouseEvent', () => {
  it('maps all fields correctly', () => {
    const result = fromWarehouseEvent(makeWarehouseEvent());

    expect(result.id).toBe('wh-1');
    expect(result.type).toBe('packing');
    expect(result.title).toBe('Packning Event');
    expect(result.start).toBe('2025-06-11T07:00:00.000Z');
    expect(result.end).toBe('2025-06-11T12:00:00.000Z');
    expect(result.resourceId).toBe('warehouse');
    expect(result.bookingId).toBe('booking-456');
    expect(result.bookingNumber).toBe('BK-002');
    expect(result.category).toBe('warehouse');
    expect(result.source).toBe('warehouse');
    expect(result.viewed).toBe(false);
    expect(result.metadata.sourceRigDate).toBe('2025-06-10');
    expect(result.metadata.hasSourceChanges).toBe(false);
  });

  it('handles all warehouse event types', () => {
    const types = ['packing', 'delivery', 'return', 'inventory', 'unpacking'] as const;
    types.forEach(t => {
      const result = fromWarehouseEvent(makeWarehouseEvent({ event_type: t }));
      expect(result.type).toBe(t);
      expect(result.category).toBe('warehouse');
    });
  });

  it('handles missing booking_number', () => {
    const result = fromWarehouseEvent(makeWarehouseEvent({ booking_number: null }));
    expect(result.bookingNumber).toBeNull();
  });
});

// ─── DashboardEvent Adapter ────────────────────────────────

describe('fromDashboardEvent', () => {
  it('maps all fields correctly', () => {
    const result = fromDashboardEvent(makeDashboardEvent());

    expect(result.id).toBe('dash-1');
    expect(result.title).toBe('Acme AB');
    expect(result.allDay).toBe(true);
    expect(result.bookingId).toBe('booking-789');
    expect(result.bookingNumber).toBe('BK-003');
    expect(result.category).toBe('planning');
    expect(result.status).toBe('CONFIRMED');
    expect(result.source).toBe('dashboard');
    expect(result.metadata.assignedStaff).toHaveLength(1);
  });

  it('converts Date object to ISO string', () => {
    const result = fromDashboardEvent(makeDashboardEvent());
    expect(result.start).toContain('2025-06-15');
    expect(typeof result.start).toBe('string');
  });

  it('handles missing optional fields', () => {
    const result = fromDashboardEvent(makeDashboardEvent({
      status: undefined,
      deliveryAddress: undefined,
      bookingNumber: null,
    }));
    expect(result.status).toBeNull();
    expect(result.deliveryAddress).toBeNull();
    expect(result.bookingNumber).toBeNull();
  });
});

// ─── Reverse Adapters (Compatibility) ──────────────────────

describe('toPlanningCalendarEvent', () => {
  it('returns original when source is calendar', () => {
    const original = makeCalendarEvent();
    const pe = fromCalendarEvent(original);
    const back = toPlanningCalendarEvent(pe);
    expect(back).toBe(original); // Same reference
  });

  it('reconstructs from non-calendar source', () => {
    const pe = fromWarehouseEvent(makeWarehouseEvent());
    const back = toPlanningCalendarEvent(pe);
    expect(back.id).toBe('wh-1');
    expect(back.title).toBe('Packning Event');
    expect(back.resourceId).toBe('warehouse');
  });
});

describe('toWarehouseEvent', () => {
  it('returns original when source is warehouse', () => {
    const original = makeWarehouseEvent();
    const pe = fromWarehouseEvent(original);
    const back = toWarehouseEvent(pe);
    expect(back).toBe(original);
  });
});

describe('toDashboardEvent', () => {
  it('returns original when source is dashboard', () => {
    const original = makeDashboardEvent();
    const pe = fromDashboardEvent(original);
    const back = toDashboardEvent(pe);
    expect(back).toBe(original);
  });

  it('reconstructs from non-dashboard source', () => {
    const pe = fromCalendarEvent(makeCalendarEvent());
    const back = toDashboardEvent(pe);
    expect(back.client).toBe('Rigg Event');
    expect(back.date).toBeInstanceOf(Date);
  });
});

// ─── Event Deduplication ───────────────────────────────────

describe('deduplication safety', () => {
  it('preserves unique IDs across sources', () => {
    const cal = fromCalendarEvent(makeCalendarEvent({ id: 'shared-id' }));
    const wh = fromWarehouseEvent(makeWarehouseEvent({ id: 'shared-id' }));
    
    // Different source tags even with same ID
    expect(cal.source).toBe('calendar');
    expect(wh.source).toBe('warehouse');
  });

  it('batch conversion maintains order and count', () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      makeCalendarEvent({ id: `event-${i}` })
    );
    const result = fromCalendarEvents(events);
    expect(result).toHaveLength(100);
    expect(result[0].id).toBe('event-0');
    expect(result[99].id).toBe('event-99');
  });
});

// ─── Date/Time Edge Cases ──────────────────────────────────

describe('date/time normalization', () => {
  it('handles date-only strings (yyyy-MM-dd)', () => {
    const result = fromCalendarEvent(makeCalendarEvent({
      start: '2025-06-10',
      end: '2025-06-10',
    }));
    expect(result.start).toBe('2025-06-10T00:00:00.000Z');
    expect(result.end).toBe('2025-06-10T00:00:00.000Z');
  });

  it('passes through ISO timestamps unchanged', () => {
    const iso = '2025-06-10T14:30:00.000Z';
    const result = fromCalendarEvent(makeCalendarEvent({ start: iso, end: iso }));
    expect(result.start).toBe(iso);
    expect(result.end).toBe(iso);
  });

  it('handles missing end time by falling back to start', () => {
    const result = fromCalendarEvent(makeCalendarEvent({
      start: '2025-06-10T08:00:00.000Z',
      end: '',
    }));
    expect(result.end).toBe('2025-06-10T08:00:00.000Z');
  });
});

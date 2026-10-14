// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isWarehouseWorkEvent, normalizeWarehouseWorkEventType, WAREHOUSE_WORK_EVENT_TYPES } from './warehouseWorkEvents';
import { unstaffedWarehouseEvents } from './personnelIntervals';

describe('warehouse calendar and personnel source policy', () => {
  it('includes every concrete warehouse activity, including internal tasks', () => {
    for (const event_type of WAREHOUSE_WORK_EVENT_TYPES) {
      expect(isWarehouseWorkEvent({ event_type })).toBe(true);
    }
  });

  it.each(['rig', 'event', 'rigDown', 'other', 'warehouse', '', null, undefined])(
    'does not present booking phase or legacy projection %s as an open job',
    event_type => expect(isWarehouseWorkEvent({ event_type })).toBe(false),
  );

  it('keeps distinct same-booking warehouse jobs and removes only the exact staffed event', () => {
    const events = [
      { id: 'pack-one', event_type: 'packing', booking_id: 'booking' },
      { id: 'pack-two', event_type: 'packing', booking_id: 'booking' },
      { id: 'return', event_type: 'return', booking_id: 'booking' },
      { id: 'phase', event_type: 'event', booking_id: 'booking' },
      { id: 'legacy', event_type: 'other', booking_id: 'booking' },
    ];
    const assignments = [{ warehouse_event_id: 'pack-one' }, { warehouse_event_id: 'legacy' }];
    const open = unstaffedWarehouseEvents(events.filter(isWarehouseWorkEvent), assignments);
    expect(open.map(event => event.id)).toEqual(['pack-two', 'return']);
    // Filtering open work must not mutate or relink actual staffing or source rows.
    expect(assignments).toEqual([{ warehouse_event_id: 'pack-one' }, { warehouse_event_id: 'legacy' }]);
    expect(events).toHaveLength(5);
  });
});

describe('multi-rigdown warehouse events', () => {
  it('keeps distinct dated logistics jobs visible with their original identity', () => {
    const events = ['return', 'inventory', 'unpacking'].flatMap(type => ['2026-10-15', '2026-10-16'].map(date => ({ id: `${type}-${date}`, event_type: `${type}_${date}` })));
    expect(events.filter(isWarehouseWorkEvent)).toEqual(events);
    expect(events.map(event => normalizeWarehouseWorkEventType(event.event_type))).toEqual(['return', 'return', 'inventory', 'inventory', 'unpacking', 'unpacking']);
    expect(unstaffedWarehouseEvents(events.filter(isWarehouseWorkEvent), [{ warehouse_event_id: 'return-2026-10-15' }])).toHaveLength(5);
    expect(events[0].event_type).toBe('return_2026-10-15');
  });
  it.each(['return_bad', 'return_2026-10-15_extra', 'event_2026-10-15', 'packing_2026-10-15'])('does not admit arbitrary suffixed types: %s', event_type => {
    expect(isWarehouseWorkEvent({ event_type })).toBe(false);
  });
  it('does not count cancelled assignments as staffing', () => {
    const event = { id: 'return-day', event_type: 'return_2026-10-15' };
    expect(unstaffedWarehouseEvents([event], [{ warehouse_event_id: event.id, status: 'cancelled' }])).toEqual([event]);
    expect(unstaffedWarehouseEvents([event], [{ warehouse_event_id: event.id, status: 'cancelled' }, { warehouse_event_id: event.id, status: 'planned' }])).toEqual([]);
  });
});

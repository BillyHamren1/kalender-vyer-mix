// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isWarehouseWorkEvent, WAREHOUSE_WORK_EVENT_TYPES } from './warehouseWorkEvents';
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

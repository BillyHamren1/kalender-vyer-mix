import { describe, it, expect } from 'vitest';
import { buildPlannerCalendarEvents } from '../plannerCalendarDerivation';

const baseInput = {
  bookings: [],
  largeProjects: [],
  largeProjectBookings: [],
  bookingAssignments: [],
  largeProjectTeamAssignments: [],
  fromDate: '2026-05-01',
  toDate: '2026-05-31',
};

describe('buildPlannerCalendarEvents – todo passthrough', () => {
  it('emits a calendar event for event_type=todo with resource_id', () => {
    const events = buildPlannerCalendarEvents({
      ...baseInput,
      realEvents: [
        {
          id: 'todo-1',
          title: 'Upphämtning – Kund X',
          start_time: '2026-05-14T09:00:00',
          end_time: '2026-05-14T10:00:00',
          resource_id: 'team-1',
          booking_id: null,
          event_type: 'todo',
          delivery_address: null,
          booking_number: null,
          source_date: '2026-05-14',
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'todo-1',
      title: 'Upphämtning – Kund X',
      resourceId: 'team-1',
      eventType: 'todo',
    });
  });

  it('skips todo without resource_id', () => {
    const events = buildPlannerCalendarEvents({
      ...baseInput,
      realEvents: [
        {
          id: 'todo-2',
          title: 'Lös',
          start_time: '2026-05-14T09:00:00',
          end_time: '2026-05-14T10:00:00',
          resource_id: null,
          booking_id: null,
          event_type: 'todo',
          delivery_address: null,
          booking_number: null,
          source_date: '2026-05-14',
        },
      ],
    });
    expect(events).toHaveLength(0);
  });
});

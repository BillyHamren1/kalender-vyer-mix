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

  it('propagerar customerPickup till large-project-grupperade riggkort', () => {
    const events = buildPlannerCalendarEvents({
      ...baseInput,
      bookings: [
        {
          id: 'booking-1',
          client: 'Hammarby Fotboll AB',
          title: 'Hämtas hos oss',
          booking_number: '2606-5',
          deliveryaddress: null,
          large_project_id: 'lp-1',
          rigdaydate: '2026-05-14',
          eventdate: '2026-05-15',
          rigdowndate: '2026-05-16',
          rig_start_time: '08:00:00',
          rig_end_time: '12:00:00',
          event_start_time: '08:00:00',
          event_end_time: '17:00:00',
          rigdown_start_time: '08:00:00',
          rigdown_end_time: '12:00:00',
          status: 'CONFIRMED',
          customer_pickup: true,
          calendar_color: null,
        },
      ],
      largeProjects: [
        {
          id: 'lp-1',
          name: 'Derbyhelg',
          project_number: 'LP-1',
          address: null,
          start_date: ['2026-05-14'],
          event_date: ['2026-05-15'],
          end_date: ['2026-05-16'],
        },
      ],
      largeProjectBookings: [{ large_project_id: 'lp-1', booking_id: 'booking-1' }],
      realEvents: [
        {
          id: 'ce-1',
          title: 'Rigg',
          start_time: '2026-05-14T08:00:00',
          end_time: '2026-05-14T12:00:00',
          resource_id: 'team-1',
          booking_id: 'booking-1',
          event_type: 'rig',
          delivery_address: null,
          booking_number: '2606-5',
          source_date: '2026-05-14',
          customer_pickup: true,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('rig');
    expect(events[0].extendedProps?.isLargeProject).toBe(true);
    expect(events[0].extendedProps?.customerPickup).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { MobileBooking } from '@/services/mobileApiService';
import type { ArrivalTarget } from '@/types/arrivalTarget';
import { isArrivalTargetPlannedToday, isBookingPlannedOnDate } from '@/lib/mobileBookingPlanning';

const baseBooking: MobileBooking = {
  id: 'b1',
  client: 'Testkund',
  booking_number: '1001',
  status: null,
  deliveryaddress: 'Gatan 1',
  delivery_city: 'Stockholm',
  delivery_postal_code: null,
  delivery_latitude: 59.33,
  delivery_longitude: 18.06,
  rigdaydate: null,
  eventdate: null,
  rigdowndate: null,
  rig_start_time: null,
  rig_end_time: null,
  event_start_time: null,
  event_end_time: null,
  rigdown_start_time: null,
  rigdown_end_time: null,
  internalnotes: null,
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  assigned_project_id: null,
  assigned_project_name: null,
  large_project_id: null,
  large_project_name: null,
  assignment_dates: [],
};

describe('mobileBookingPlanning', () => {
  it('accepts bookings planned today via assignment_dates', () => {
    const booking: MobileBooking = {
      ...baseBooking,
      assignment_dates: ['2026-04-29'],
    };

    expect(isBookingPlannedOnDate(booking, '2026-04-29')).toBe(true);
    expect(isBookingPlannedOnDate(booking, '2026-05-20')).toBe(false);
  });

  it('accepts bookings planned today via phase dates', () => {
    const booking: MobileBooking = {
      ...baseBooking,
      eventdate: '2026-04-29',
    };

    expect(isBookingPlannedOnDate(booking, '2026-04-29')).toBe(true);
  });

  it('blocks future project arrival targets', () => {
    const futureProjectBooking: MobileBooking = {
      ...baseBooking,
      id: 'b2',
      large_project_id: 'lp-1',
      large_project_name: 'Framtidsprojekt',
      assignment_dates: ['2026-05-20'],
    };
    const target: ArrivalTarget = {
      kind: 'project',
      target_id: 'lp-1',
      label: 'Framtidsprojekt',
      arrived_at: '2026-04-29T07:00:00.000Z',
    };

    expect(isArrivalTargetPlannedToday(target, [futureProjectBooking], '2026-04-29')).toBe(false);
  });

  it('allows location arrival targets regardless of schedule', () => {
    const target: ArrivalTarget = {
      kind: 'location',
      target_id: 'loc-1',
      label: 'Lager',
      arrived_at: '2026-04-29T07:00:00.000Z',
    };

    expect(isArrivalTargetPlannedToday(target, [], '2026-04-29')).toBe(true);
  });
});
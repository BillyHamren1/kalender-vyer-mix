import { describe, it, expect } from 'vitest';
import { __buildPlannerDays } from '../largeProjectPlannerService';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
} from '../largeProjectPlannerTypes';

const baseBooking = (
  overrides: Partial<LargeProjectPlannerBooking>,
): LargeProjectPlannerBooking => ({
  id: overrides.id ?? crypto.randomUUID(),
  booking_number: null,
  client: null,
  display_name: 'B',
  rigdaydate: null,
  eventdate: null,
  rigdowndate: null,
  rig_start_time: null,
  rig_end_time: null,
  event_start_time: null,
  event_end_time: null,
  rigdown_start_time: null,
  rigdown_end_time: null,
  deliveryaddress: null,
  delivery_city: null,
  contact_name: null,
  contact_phone: null,
  contact_email: null,
  internalnotes: null,
  rig_dates: [],
  event_dates: [],
  rigdown_dates: [],
  ...overrides,
});

const baseItem = (overrides: Partial<LargeProjectBookingPlanItem>): LargeProjectBookingPlanItem => ({
  id: overrides.id ?? crypto.randomUUID(),
  large_project_id: 'lp1',
  booking_id: null,
  parent_item_id: null,
  title: 'x',
  description: null,
  item_type: 'task',
  phase: null,
  plan_date: '2026-06-01',
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
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('buildPlannerDays (legacy, items-only)', () => {
  it('grupperar items per datum och sorterar stigande', () => {
    const days = __buildPlannerDays([], [
      baseItem({ plan_date: '2026-06-03' }),
      baseItem({ plan_date: '2026-06-01' }),
      baseItem({ plan_date: '2026-06-01' }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-03']);
    expect(days[0].items.length).toBe(2);
  });

  it('returnerar tom array för tom input', () => {
    expect(__buildPlannerDays([], [])).toEqual([]);
  });
});

describe('buildPlannerDays — flerdagars rig/event/rigDown', () => {
  it('inkluderar ALLA rigg-, event- och nedriggdagar från *_dates', () => {
    const days = __buildPlannerDays(
      [
        baseBooking({
          rigdaydate: '2026-06-07',
          eventdate: null,
          rigdowndate: '2026-06-27',
          rig_dates: ['2026-06-07', '2026-06-08', '2026-06-20'],
          event_dates: [],
          rigdown_dates: ['2026-06-27', '2026-06-28', '2026-07-02'],
        }),
      ],
      [],
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-06-07',
      '2026-06-08',
      '2026-06-20',
      '2026-06-27',
      '2026-06-28',
      '2026-07-02',
    ]);
    expect(days[0].phase).toBe('rig');
    expect(days[3].phase).toBe('rigDown');
  });

  it('faller tillbaka på *date-fält när *_dates saknas (äldre data)', () => {
    const days = __buildPlannerDays(
      [
        baseBooking({
          rigdaydate: '2026-06-07',
          eventdate: '2026-06-15',
          rigdowndate: '2026-06-27',
          rig_dates: [],
          event_dates: [],
          rigdown_dates: [],
        }),
      ],
      [],
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-06-07',
      '2026-06-15',
      '2026-06-27',
    ]);
  });

  it('dedupar datum som finns i både *date och *_dates', () => {
    const days = __buildPlannerDays(
      [
        baseBooking({
          rigdaydate: '2026-06-07',
          rig_dates: ['2026-06-07', '2026-06-08'],
        }),
      ],
      [],
    );
    expect(days.map((d) => d.date)).toEqual(['2026-06-07', '2026-06-08']);
  });
});

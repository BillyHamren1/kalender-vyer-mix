import { describe, it, expect } from 'vitest';
import { __buildPlannerDays } from '../largeProjectPlannerService';
import type { LargeProjectBookingPlanItem } from '../largeProjectPlannerTypes';

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

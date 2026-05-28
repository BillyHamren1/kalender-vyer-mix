import { describe, it, expect } from 'vitest';
import { __buildPlannerDays } from '../largeProjectPlannerService';
import type { LargeProjectBookingPlanItem } from '../largeProjectPlannerTypes';

const emptyProjectDates = { rig: [] as string[], event: [] as string[], rigDown: [] as string[] };

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

describe('buildProjectDays — strikt från stora projektets datum', () => {
  it('visar EXAKT stora projektets rig + event + rigDown-datum, inget annat', () => {
    const days = __buildPlannerDays(
      {
        rig: ['2026-06-07', '2026-06-08'],
        event: ['2026-06-22'],
        rigDown: ['2026-06-27', '2026-06-28'],
      },
      [],
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-06-07',
      '2026-06-08',
      '2026-06-22',
      '2026-06-27',
      '2026-06-28',
    ]);
    expect(days[0].phase).toBe('rig');
    expect(days[2].phase).toBe('event');
    expect(days[3].phase).toBe('rigDown');
  });

  it('plan_items UTANFÖR projektets datum får ALDRIG skapa nya kolumner', () => {
    const days = __buildPlannerDays(
      { rig: ['2026-06-07'], event: [], rigDown: ['2026-06-27'] },
      [
        baseItem({ plan_date: '2026-05-29' }), // utanför
        baseItem({ plan_date: '2026-06-26' }), // utanför
        baseItem({ plan_date: '2026-06-07' }), // innanför
      ],
    );
    expect(days.map((d) => d.date)).toEqual(['2026-06-07', '2026-06-27']);
    expect(days[0].items.length).toBe(1);
    expect(days[1].items.length).toBe(0);
  });

  it('returnerar tom array när projektet saknar datum', () => {
    expect(__buildPlannerDays(emptyProjectDates, [])).toEqual([]);
    expect(
      __buildPlannerDays(emptyProjectDates, [baseItem({ plan_date: '2026-06-01' })]),
    ).toEqual([]);
  });

  it('event-fasen vinner över rig/rigDown vid kollision på samma datum', () => {
    const days = __buildPlannerDays(
      { rig: ['2026-06-22'], event: ['2026-06-22'], rigDown: ['2026-06-22'] },
      [],
    );
    expect(days).toHaveLength(1);
    expect(days[0].phase).toBe('event');
  });
});

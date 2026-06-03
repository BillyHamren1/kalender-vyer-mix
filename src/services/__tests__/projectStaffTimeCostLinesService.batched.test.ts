/**
 * Verifierar att fetchProjectStaffTimeCostSummaryForTargets:
 *  - gör EN supabase-query (ingen N+1 över bookings)
 *  - bygger OR-filter med large_project_id + booking_id.in.(...)
 *  - dedupar rader på row.id
 *  - mappar till samma summary-shape
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryCalls: Array<{ table: string; or?: string }> = [];
const fakeRows = [
  {
    id: 'r1', organization_id: 'o', staff_day_submission_id: 's',
    staff_id: 'a', staff_name: 'A', date: '2026-06-03',
    booking_id: 'b1', project_id: null, large_project_id: 'LP',
    assignment_id: null, location_id: null,
    source_block_id: null, source_block_kind: null, source_label: null,
    start_at: '2026-06-03T08:00:00Z', end_at: '2026-06-03T09:00:00Z',
    minutes: 60, hours: 1, hourly_rate: 100, cost: 100,
    rate_source: 'snap', submission_status: 'approved',
  },
  {
    // duplicate (matchar både large_project_id och booking_id) — ska dedupas
    id: 'r1', organization_id: 'o', staff_day_submission_id: 's',
    staff_id: 'a', staff_name: 'A', date: '2026-06-03',
    booking_id: 'b1', project_id: null, large_project_id: 'LP',
    assignment_id: null, location_id: null,
    source_block_id: null, source_block_kind: null, source_label: null,
    start_at: '2026-06-03T08:00:00Z', end_at: '2026-06-03T09:00:00Z',
    minutes: 60, hours: 1, hourly_rate: 100, cost: 100,
    rate_source: 'snap', submission_status: 'approved',
  },
  {
    id: 'r2', organization_id: 'o', staff_day_submission_id: 's',
    staff_id: 'b', staff_name: 'B', date: '2026-06-03',
    booking_id: 'b2', project_id: null, large_project_id: 'LP',
    assignment_id: null, location_id: null,
    source_block_id: null, source_block_kind: null, source_label: null,
    start_at: '2026-06-03T10:00:00Z', end_at: '2026-06-03T11:30:00Z',
    minutes: 90, hours: 1.5, hourly_rate: 200, cost: 300,
    rate_source: 'snap', submission_status: 'submitted',
  },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        or: (orFilter: string) => ({
          limit: async () => {
            queryCalls.push({ table, or: orFilter });
            return { data: fakeRows, error: null };
          },
        }),
      }),
    }),
  },
}));

import {
  fetchProjectStaffTimeCostSummaryForTargets,
} from '../projectStaffTimeCostLinesService';

beforeEach(() => {
  queryCalls.length = 0;
});

describe('fetchProjectStaffTimeCostSummaryForTargets', () => {
  it('gör exakt EN query för LP + bookings', async () => {
    await fetchProjectStaffTimeCostSummaryForTargets({
      large_project_id: 'LP',
      booking_ids: ['b1', 'b2', 'b3'],
    });
    expect(queryCalls.length).toBe(1);
    expect(queryCalls[0].table).toBe('project_staff_time_cost_lines');
    expect(queryCalls[0].or).toContain('large_project_id.eq.LP');
    expect(queryCalls[0].or).toContain('booking_id.in.(b1,b2,b3)');
  });

  it('dedupar rader på id och summerar approved+unapproved', async () => {
    const summary = await fetchProjectStaffTimeCostSummaryForTargets({
      large_project_id: 'LP',
      booking_ids: ['b1', 'b2'],
    });
    // r1 förekommer två gånger i mock → ska räknas EN gång.
    expect(summary.rows.length).toBe(2);
    expect(summary.totalHours).toBeCloseTo(2.5, 2);   // 1 + 1.5
    expect(summary.approvedHours).toBeCloseTo(1.0, 2);
    expect(summary.unapprovedHours).toBeCloseTo(1.5, 2);
    expect(summary.totalCost).toBe(400);
    expect(summary.byStaff.length).toBe(2);
    expect(summary.byDate.length).toBe(1);
    expect(summary.byDate[0].staffCount).toBe(2);
  });

  it('returnerar tomt utan target', async () => {
    const summary = await fetchProjectStaffTimeCostSummaryForTargets({});
    expect(queryCalls.length).toBe(0);
    expect(summary.rows.length).toBe(0);
    expect(summary.totalHours).toBe(0);
  });
});

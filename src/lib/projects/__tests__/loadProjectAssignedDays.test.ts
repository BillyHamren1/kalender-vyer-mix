/**
 * Säkerställer att Large Project-bemanning räknas via
 * `large_project_team_assignments` × `staff_assignments` — INTE via
 * syskonbokningarnas BSA.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  loadLargeProjectAssignedDays,
  loadBookingAssignedDays,
} from '../loadProjectAssignedDays';

function makeSupabaseMock(handlers: Record<string, any>) {
  return {
    from(table: string) {
      const h = handlers[table];
      if (!h) throw new Error(`unexpected table: ${table}`);
      return h();
    },
  } as any;
}

describe('loadLargeProjectAssignedDays', () => {
  it('returnerar unika (date, staff_id) från LP-team × staff_assignments — ignorerar BSA', async () => {
    const supabase = makeSupabaseMock({
      large_project_team_assignments: () => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                { assignment_date: '2026-05-18', team_id: 'team-3' },
                { assignment_date: '2026-05-22', team_id: 'team-4' },
              ],
              error: null,
            }),
        }),
      }),
      staff_assignments: () => ({
        select: () => ({
          in: () => ({
            gte: () => ({
              lte: () =>
                Promise.resolve({
                  data: [
                    // team-3 18 maj: 5 personer
                    { staff_id: 's1', team_id: 'team-3', assignment_date: '2026-05-18' },
                    { staff_id: 's2', team_id: 'team-3', assignment_date: '2026-05-18' },
                    { staff_id: 's3', team_id: 'team-3', assignment_date: '2026-05-18' },
                    { staff_id: 's4', team_id: 'team-3', assignment_date: '2026-05-18' },
                    { staff_id: 's5', team_id: 'team-3', assignment_date: '2026-05-18' },
                    // team-4 18 maj: är INTE planerat på LP för 18 maj → ska ignoreras
                    { staff_id: 's9', team_id: 'team-4', assignment_date: '2026-05-18' },
                    // team-4 22 maj: 2 personer
                    { staff_id: 's6', team_id: 'team-4', assignment_date: '2026-05-22' },
                    { staff_id: 's7', team_id: 'team-4', assignment_date: '2026-05-22' },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    });

    const days = await loadLargeProjectAssignedDays(supabase, 'lp-1');
    const byDate = new Map<string, string[]>();
    for (const d of days) {
      const list = byDate.get(d.date) ?? [];
      list.push(d.staff_id);
      byDate.set(d.date, list);
    }
    expect(byDate.get('2026-05-18')?.sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(byDate.get('2026-05-22')?.sort()).toEqual(['s6', 's7']);
    expect(days.every((d) => d.source === 'lp_team')).toBe(true);
  });

  it('tom lista när LP saknar team-assignments', async () => {
    const supabase = makeSupabaseMock({
      large_project_team_assignments: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });
    const days = await loadLargeProjectAssignedDays(supabase, 'lp-x');
    expect(days).toEqual([]);
  });
});

describe('loadBookingAssignedDays', () => {
  it('paginerar BSA tills tomt batch — slipper .limit(1000) cap', async () => {
    let calls = 0;
    const supabase = makeSupabaseMock({
      booking_staff_assignments: () => ({
        select: () => ({
          in: () => ({
            range: vi.fn().mockImplementation(() => {
              calls += 1;
              if (calls === 1) {
                return Promise.resolve({
                  data: Array.from({ length: 1000 }).map((_, i) => ({
                    staff_id: `s${i}`,
                    assignment_date: '2026-05-18',
                  })),
                  error: null,
                });
              }
              if (calls === 2) {
                return Promise.resolve({
                  data: [
                    { staff_id: 's-extra', assignment_date: '2026-05-19' },
                    // dubblett samma dag som första sidan → ska dedupliceras
                    { staff_id: 's0', assignment_date: '2026-05-18' },
                  ],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: null });
            }),
          }),
        }),
      }),
    });
    const days = await loadBookingAssignedDays(supabase, ['b1']);
    // 1000 unika från första + 1 ny (s-extra) = 1001 unika
    expect(days.length).toBe(1001);
    expect(days.some((d) => d.staff_id === 's-extra')).toBe(true);
  });
});

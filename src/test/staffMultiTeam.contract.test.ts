import { describe, it, expect, vi } from 'vitest';

/**
 * Contract test — multi-team staff assignment.
 *
 * Locks the rule that one staff member CAN belong to several teams the same
 * day, and that "remove" can be scoped to a single team without affecting
 * other team memberships.
 */

vi.mock('@/integrations/supabase/client', () => {
  const callLog: any[] = [];
  const lastUpsert: { args?: any } = {};
  const lastDelete: { filters?: any } = {};

  const builder = (op: 'upsert' | 'delete') => {
    const filters: Record<string, string> = {};
    const chain: any = {
      eq(col: string, val: string) {
        filters[col] = val;
        return chain;
      },
    };
    if (op === 'delete') {
      lastDelete.filters = filters;
      // Resolve when awaited — emulate Promise<{ error: null }>
      chain.then = (resolve: any) => resolve({ error: null });
    }
    return chain;
  };

  return {
    supabase: {
      from: (_table: string) => ({
        upsert: (args: any) => {
          lastUpsert.args = args;
          callLog.push({ op: 'upsert', args });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => {
          callLog.push({ op: 'delete' });
          return builder('delete');
        },
      }),
    },
    __callLog: callLog,
    __lastUpsert: lastUpsert,
    __lastDelete: lastDelete,
  };
});

describe('multi-team staff assignment contract', () => {
  it('staffService.assignStaffToTeam upserts on (staff,team,date) — multi-team allowed', async () => {
    vi.mock('@/services/staffAvailabilityService', () => ({
      isStaffAvailableOnDate: async () => true,
    }));
    const { assignStaffToTeam } = await import('@/services/staffService');
    const mod = await import('@/integrations/supabase/client') as any;

    await assignStaffToTeam('staff-1', 'team-2', new Date('2026-05-01T12:00:00Z'));

    expect(mod.__lastUpsert.args).toBeDefined();
    // The composite onConflict key must include team_id so the same staff can
    // be in MULTIPLE teams the same day.
    const callArgs = mod.__lastUpsert.args;
    expect(callArgs).toMatchObject({
      staff_id: 'staff-1',
      team_id: 'team-2',
      assignment_date: '2026-05-01',
    });
  });

  it('staffService.removeStaffAssignment with teamId removes only that team-row', async () => {
    const { removeStaffAssignment } = await import('@/services/staffService');
    const mod = await import('@/integrations/supabase/client') as any;

    await removeStaffAssignment('staff-1', new Date('2026-05-01T12:00:00Z'), 'team-2');

    expect(mod.__lastDelete.filters).toMatchObject({
      staff_id: 'staff-1',
      assignment_date: '2026-05-01',
      team_id: 'team-2',
    });
  });

  it('staffService.removeStaffAssignment without teamId clears all team-rows for the day', async () => {
    const { removeStaffAssignment } = await import('@/services/staffService');
    const mod = await import('@/integrations/supabase/client') as any;

    await removeStaffAssignment('staff-1', new Date('2026-05-01T12:00:00Z'));

    expect(mod.__lastDelete.filters).toMatchObject({
      staff_id: 'staff-1',
      assignment_date: '2026-05-01',
    });
    expect((mod.__lastDelete.filters as any).team_id).toBeUndefined();
  });
});

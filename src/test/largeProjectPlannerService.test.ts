import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();
const fromMock = vi.fn((table: string) => {
  if (table === 'large_project_team_assignments') {
    return {
      upsert: upsertMock,
    };
  }

  throw new Error(`Unexpected table: ${table}`);
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}));

import { syncLargeProjectPlanningAssignments } from '@/services/largeProjectPlannerService';

describe('syncLargeProjectPlanningAssignments', () => {
  beforeEach(() => {
    upsertMock.mockReset();
    fromMock.mockClear();
    upsertMock.mockResolvedValue({ error: null });
  });

  it('upserts only visible non-event phases for large projects', async () => {
    await syncLargeProjectPlanningAssignments('lp-1', [
      { date: '2026-05-11', kind: 'rig', teamId: 'team-2' },
      { date: '2026-05-12', kind: 'event', teamId: 'team-3' },
      { date: '2026-05-13', kind: 'rigDown', teamId: 'team-4' },
    ]);

    expect(fromMock).toHaveBeenCalledWith('large_project_team_assignments');
    expect(upsertMock).toHaveBeenCalledWith(
      [
        {
          large_project_id: 'lp-1',
          phase: 'rig',
          assignment_date: '2026-05-11',
          team_id: 'team-2',
        },
        {
          large_project_id: 'lp-1',
          phase: 'rigDown',
          assignment_date: '2026-05-13',
          team_id: 'team-4',
        },
      ],
      { onConflict: 'large_project_id,phase,assignment_date' },
    );
  });

  it('deduplicates same phase/date and keeps the latest team', async () => {
    await syncLargeProjectPlanningAssignments('lp-2', [
      { date: '2026-05-11', kind: 'rig', teamId: 'team-1' },
      { date: '2026-05-11', kind: 'rig', teamId: 'team-5' },
    ]);

    expect(upsertMock).toHaveBeenCalledWith(
      [
        {
          large_project_id: 'lp-2',
          phase: 'rig',
          assignment_date: '2026-05-11',
          team_id: 'team-5',
        },
      ],
      { onConflict: 'large_project_id,phase,assignment_date' },
    );
  });
});
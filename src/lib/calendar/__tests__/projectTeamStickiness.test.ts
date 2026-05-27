import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client BEFORE importing the helper.
const mockState: { rows: any[] } = { rows: [] };

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const filters: Array<(r: any) => boolean> = [];
    const api: any = {};
    api.select = () => api;
    api.eq = (col: string, val: any) => {
      filters.push((r) => r[col] === val);
      return api;
    };
    api.neq = (col: string, val: any) => {
      filters.push((r) => r[col] !== val);
      return api;
    };
    api.in = (col: string, vals: any[]) => {
      const set = new Set(vals);
      filters.push((r) => set.has(r[col]));
      return api;
    };
    api.limit = () => api;
    api.then = (resolve: any, reject?: any) => {
      const data = mockState.rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return api;
  };
  return {
    supabase: {
      from: () => builder(),
    },
  };
});

import {
  getStickyTeamForBooking,
  getStickyTeamForLargeProject,
  findExistingDayRow,
} from '@/lib/calendar/projectTeamStickiness';

const ORG = 'org-1';

beforeEach(() => {
  mockState.rows = [];
});

describe('getStickyTeamForBooking', () => {
  it('returnerar null för booking utan kalendrarad', async () => {
    const team = await getStickyTeamForBooking('b1', ORG);
    expect(team).toBeNull();
  });

  it('returnerar bokningens etablerade team', async () => {
    mockState.rows = [
      { booking_id: 'b1', organization_id: ORG, resource_id: 'team-3', event_type: 'rig' },
      { booking_id: 'b1', organization_id: ORG, resource_id: 'team-3', event_type: 'rigDown' },
    ];
    const team = await getStickyTeamForBooking('b1', ORG);
    expect(team).toBe('team-3');
  });

  it('ignorerar andra bokningars rader', async () => {
    mockState.rows = [
      { booking_id: 'b2', organization_id: ORG, resource_id: 'team-1', event_type: 'rig' },
      { booking_id: 'b2', organization_id: ORG, resource_id: 'team-1', event_type: 'rig' },
      { booking_id: 'b1', organization_id: ORG, resource_id: 'team-4', event_type: 'rig' },
    ];
    const team = await getStickyTeamForBooking('b1', ORG);
    expect(team).toBe('team-4');
  });
});

describe('getStickyTeamForLargeProject', () => {
  it('ärver team från syskonbokning på exakt phase+date', async () => {
    mockState.rows = [
      { large_project_id: 'lp-1', booking_id: 'b1' },
      { large_project_id: 'lp-1', booking_id: 'b2' },
      { id: 'b1', large_project_id: 'lp-1' },
      { id: 'b2', large_project_id: 'lp-1' },
      {
        booking_id: 'b2',
        organization_id: ORG,
        resource_id: 'team-4',
        event_type: 'rig',
        source_date: '2026-06-18',
      },
    ];

    const team = await getStickyTeamForLargeProject('lp-1', ORG, 'rig', '2026-06-18');
    expect(team).toBe('team-4');
  });

  it('faller tillbaka till vanligaste syskonteam när exakt dag saknas', async () => {
    mockState.rows = [
      { large_project_id: 'lp-1', booking_id: 'b1' },
      { large_project_id: 'lp-1', booking_id: 'b2' },
      { id: 'b1', large_project_id: 'lp-1' },
      { id: 'b2', large_project_id: 'lp-1' },
      { booking_id: 'b1', organization_id: ORG, resource_id: 'team-2', event_type: 'rig', source_date: '2026-06-10' },
      { booking_id: 'b2', organization_id: ORG, resource_id: 'team-2', event_type: 'event', source_date: '2026-06-11' },
      { booking_id: 'b2', organization_id: ORG, resource_id: 'team-3', event_type: 'rigDown', source_date: '2026-06-12' },
    ];

    const team = await getStickyTeamForLargeProject('lp-1', ORG, 'rig', '2026-06-18');
    expect(team).toBe('team-2');
  });
});

describe('findExistingDayRow', () => {
  it('returnerar befintlig rad inkl. resource_id', async () => {
    mockState.rows = [
      { id: 'evt-1', booking_id: 'b1', organization_id: ORG, resource_id: 'team-2', event_type: 'rig', source_date: '2026-06-01' },
    ];
    const row = await findExistingDayRow('b1', ORG, 'rig', '2026-06-01');
    expect(row).toMatchObject({ id: 'evt-1', resource_id: 'team-2' });
  });

  it('returnerar null när rad saknas', async () => {
    const row = await findExistingDayRow('b1', ORG, 'rig', '2026-06-01');
    expect(row).toBeNull();
  });
});

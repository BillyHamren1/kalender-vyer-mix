import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory mock
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  project_followers: [],
  projects: [],
  project_tasks: [],
  bookings: [],
  large_projects: [],
  large_project_tasks: [],
};

const makeBuilder = (tableName: string) => {
  let rows: Row[] = [...(tables[tableName] || [])];
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => {
      rows = rows.filter((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: any[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return builder;
    },
    neq: (col: string, val: any) => {
      rows = rows.filter((r) => r[col] !== val);
      return builder;
    },
    order: () => builder,
    maybeSingle: async () => ({ data: rows[0] || null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return builder;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => makeBuilder(t),
  },
}));

import { fetchMyProjects } from '../myProjectsService';

describe('fetchMyProjects with followers', () => {
  beforeEach(() => {
    tables.project_followers = [];
    tables.projects = [];
    tables.project_tasks = [];
    tables.bookings = [];
    tables.large_projects = [];
    tables.large_project_tasks = [];
  });

  it('includes standard project where user is only a follower', async () => {
    tables.projects = [
      { id: 'p1', name: 'P1', status: 'active', booking_id: null, project_leader: null },
    ];
    tables.project_followers = [
      { project_id: 'p1', project_type: 'standard', staff_id: 'staff-x' },
    ];

    const res = await fetchMyProjects('staff-x');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('p1');
    expect(res[0].role).toBe('follower');
  });

  it('includes large project where user is only a follower', async () => {
    tables.large_projects = [
      {
        id: 'lp1',
        name: 'LP1',
        status: 'active',
        start_date: ['2026-01-01'],
        end_date: ['2026-01-02'],
        project_leader: null,
        project_number: 'LP-1',
      },
    ];
    tables.project_followers = [
      { project_id: 'lp1', project_type: 'large', staff_id: 'staff-x' },
    ];

    const res = await fetchMyProjects('staff-x');
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('large');
    expect(res[0].role).toBe('follower');
  });

  it('prioritises leader role over follower', async () => {
    tables.projects = [
      { id: 'p1', name: 'P1', status: 'active', booking_id: null, project_leader: 'staff-x' },
    ];
    tables.project_followers = [
      { project_id: 'p1', project_type: 'standard', staff_id: 'staff-x' },
    ];

    const res = await fetchMyProjects('staff-x');
    expect(res).toHaveLength(1);
    expect(res[0].role).toBe('leader');
  });
});

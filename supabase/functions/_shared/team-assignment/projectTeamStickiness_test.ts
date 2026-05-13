// Deno test: project team stickiness helper.
//
// Read-only helper — vi mockar supabase-svar och kontrollerar att rätt
// team väljs, samt att helpern aldrig försöker mutera data.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  getStickyTeamForBooking,
  getStickyTeamForLargeProject,
} from './projectTeamStickiness.ts';

type Row = Record<string, any>;

function makeSupabase(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: string }> = [];

  const builder = (tableName: string) => {
    let rows = [...(tables[tableName] ?? [])];
    const filters: Array<(r: Row) => boolean> = [];
    const api: any = {};

    api.select = (_cols?: string) => api;
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
    api.not = (col: string, op: string, expr: string) => {
      // Stöd "in" via "not in (..)" — vi godtar formatet helpern producerar.
      if (op === 'in') {
        const ids = expr
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((s) => s.trim().replace(/^"|"$/g, ''));
        const set = new Set(ids);
        filters.push((r) => !set.has(r[col]));
      }
      return api;
    };
    api.limit = (_n: number) => api;
    api.then = (resolve: (v: any) => any, reject?: (e: any) => any) => {
      const data = rows.filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    // mutationer skulle vara fel — registrera om de skulle anropas
    api.insert = () => {
      writes.push({ table: tableName, op: 'insert' });
      return Promise.resolve({ data: null, error: null });
    };
    api.update = () => {
      writes.push({ table: tableName, op: 'update' });
      return Promise.resolve({ data: null, error: null });
    };
    api.upsert = () => {
      writes.push({ table: tableName, op: 'upsert' });
      return Promise.resolve({ data: null, error: null });
    };
    api.delete = () => {
      writes.push({ table: tableName, op: 'delete' });
      return Promise.resolve({ data: null, error: null });
    };
    return api;
  };

  return {
    from: builder,
    __writes: writes,
  };
}

const ORG = 'org-1';

Deno.test('booking utan tidigare rader → null (round-robin tar över)', async () => {
  const supabase = makeSupabase({ calendar_events: [] });
  const team = await getStickyTeamForBooking(supabase, 'b1', ORG);
  assertEquals(team, null);
});

Deno.test('booking med rigdag i team-3 → ny rivdag ärver team-3', async () => {
  const supabase = makeSupabase({
    calendar_events: [
      { id: 'e1', booking_id: 'b1', organization_id: ORG, resource_id: 'team-3', event_type: 'rig' },
    ],
  });
  const team = await getStickyTeamForBooking(supabase, 'b1', ORG);
  assertEquals(team, 'team-3');
});

Deno.test('booking med flera dagar på team-2 och en på team-5 → vanligaste vinner', async () => {
  const supabase = makeSupabase({
    calendar_events: [
      { id: 'a', booking_id: 'b1', organization_id: ORG, resource_id: 'team-2', event_type: 'rig' },
      { id: 'b', booking_id: 'b1', organization_id: ORG, resource_id: 'team-2', event_type: 'rig' },
      { id: 'c', booking_id: 'b1', organization_id: ORG, resource_id: 'team-5', event_type: 'rigDown' },
    ],
  });
  const team = await getStickyTeamForBooking(supabase, 'b1', ORG);
  assertEquals(team, 'team-2');
});

Deno.test('andra bokningars rader påverkar inte sticky-teamet', async () => {
  const supabase = makeSupabase({
    calendar_events: [
      { id: 'x', booking_id: 'b2', organization_id: ORG, resource_id: 'team-1', event_type: 'rig' },
      { id: 'y', booking_id: 'b2', organization_id: ORG, resource_id: 'team-1', event_type: 'rig' },
      { id: 'z', booking_id: 'b1', organization_id: ORG, resource_id: 'team-4', event_type: 'rig' },
    ],
  });
  const team = await getStickyTeamForBooking(supabase, 'b1', ORG);
  assertEquals(team, 'team-4');
});

Deno.test('helper utför inga skrivningar', async () => {
  const supabase = makeSupabase({
    calendar_events: [
      { id: 'e1', booking_id: 'b1', organization_id: ORG, resource_id: 'team-3', event_type: 'rig' },
    ],
  });
  await getStickyTeamForBooking(supabase, 'b1', ORG);
  assertEquals(supabase.__writes.length, 0);
});

Deno.test('large project: exakt match på (phase, date) vinner', async () => {
  const supabase = makeSupabase({
    large_project_bookings: [
      { large_project_id: 'lp-1', booking_id: 'b1' },
      { large_project_id: 'lp-1', booking_id: 'b2' },
    ],
    bookings: [
      { id: 'b1', large_project_id: 'lp-1' },
      { id: 'b2', large_project_id: 'lp-1' },
    ],
    calendar_events: [
      { booking_id: 'b1', organization_id: ORG, resource_id: 'team-2', event_type: 'rig', source_date: '2026-06-01' },
      { booking_id: 'b2', organization_id: ORG, resource_id: 'team-3', event_type: 'rigDown', source_date: '2026-06-05' },
    ],
  });
  const team = await getStickyTeamForLargeProject(supabase, 'lp-1', ORG, 'rig', '2026-06-01');
  assertEquals(team, 'team-2');
});

Deno.test('large project: ingen exakt match → fallback till vanligaste team', async () => {
  const supabase = makeSupabase({
    large_project_bookings: [{ large_project_id: 'lp-1', booking_id: 'b1' }],
    bookings: [{ id: 'b1', large_project_id: 'lp-1' }],
    calendar_events: [
      { booking_id: 'b1', organization_id: ORG, resource_id: 'team-5', event_type: 'rig', source_date: '2026-06-01' },
      { booking_id: 'b1', organization_id: ORG, resource_id: 'team-5', event_type: 'rigDown', source_date: '2026-06-05' },
    ],
  });
  const team = await getStickyTeamForLargeProject(supabase, 'lp-1', ORG, 'rig', '2026-06-10');
  assertEquals(team, 'team-5');
});

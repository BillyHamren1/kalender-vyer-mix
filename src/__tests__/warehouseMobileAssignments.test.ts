/** Exercise the actual deployed handler body without starting Deno.serve or calling production. */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { warehouseAssignmentScopes, allowsLegacyWarehouseJob, warehouseMobileEventType } from '../../supabase/functions/_shared/warehouseAssignmentPrecedence';
import { warehousePlanningBounds, warehousePlanningDate } from '../../supabase/functions/_shared/warehousePlanningTime';
import { warehouseVisibleDate } from '../../supabase/functions/_shared/warehouseTaskAccess';
import { isWarehouseTeam } from '../../supabase/functions/_shared/warehouseTeam';

const source = readFileSync('supabase/functions/mobile-app-api/index.ts', 'utf8');
const handlerCode = source.slice(source.indexOf('function deriveLagerType('), source.indexOf('async function handleGetLagerTasks('));
const dependencies = { warehouseAssignmentScopes, allowsLegacyWarehouseJob, warehouseMobileEventType, warehousePlanningBounds, warehousePlanningDate, warehouseVisibleDate, isWarehouseTeam, corsHeaders: {} };
const handler = new Function(...Object.keys(dependencies), ts.transpileModule(handlerCode, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText + '\nreturn handleGetLagerAssignments;')(...Object.values(dependencies));
const day = '2026-10-14';
const event = (id: string, resource_id = 'lager-1', event_type = 'packing') => ({ id, organization_id: 'org', title: id, start_time: `${day}T08:00:00Z`, end_time: `${day}T10:00:00Z`, resource_id, event_type });
const row = (status = 'planned') => ({ id: 'assignment', organization_id: 'org', staff_id: 'worker', assignment_date: day, assignment_type: 'packing', warehouse_event_id: 'a', status, metadata: { resource_id: 'lager-1' } });
function db(rows: any[]) {
  const tables: Record<string, any[]> = {
    warehouse_assignments: rows,
    warehouse_calendar_events: [event('a'), event('b'), event('c', 'lager-2', 'return_2026-10-14')],
    staff_assignments: ['lager-1', 'lager-2'].map(team_id => ({ team_id, assignment_date: day, staff_id: 'worker', organization_id: 'org' })),
    projects: [],
  };
  return { from(table: string) {
    let values = tables[table] || [];
    let single = false;
    const q: any = {
      select: () => q, order: () => q, or: () => q,
      eq: (column: string, value: any) => { values = values.filter(r => r[column] === value); return q; },
      in: (column: string, value: any[]) => { values = values.filter(r => value.includes(r[column])); return q; },
      maybeSingle: () => { single = true; return q; },
      then: (resolve: any, reject: any) => Promise.resolve({ data: single ? values[0] ?? null : values, error: null }).then(resolve, reject),
    };
    for (const op of ['gte', 'lte', 'gt', 'lt']) q[op] = (column: string, value: string) => {
      values = values.filter(r => op === 'gte' ? r[column] >= value : op === 'lte' ? r[column] <= value : op === 'gt' ? r[column] > value : r[column] < value); return q;
    };
    return q;
  } };
}
async function read(rows: any[]) {
  const response = await handler(db(rows), 'worker', { date_from: day, date_to: day }, 'org');
  expect(response.status).toBe(200);
  return response.json();
}
describe('mobile warehouse assignments handler', () => {
  it('shows only selected concrete job on that team, preserving unrelated legacy team work', async () => {
    const result = await read([row()]);
    expect(result.assignments.map((a: any) => a.id)).toEqual(['wa-assignment', 'wce-c']);
    expect(result.assignments[1].action).toBe('open_return_scanner');
  });
  it('does not resurrect cancelled last job or expose other jobs via its team mirror', async () => {
    const result = await read([row('cancelled')]);
    expect(result.assignments.map((a: any) => a.id)).toEqual(['wce-c']);
    expect(result.summary.canonical_count).toBe(0);
  });
  it('preserves legacy team job lists where there are no concrete rows', async () => {
    expect((await read([])).assignments.map((a: any) => a.id)).toEqual(['wce-a', 'wce-b', 'wce-c']);
  });
});

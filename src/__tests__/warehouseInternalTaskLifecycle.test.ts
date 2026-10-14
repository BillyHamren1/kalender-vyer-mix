import { beforeEach, describe, expect, it, vi } from 'vitest';
type Call = { table: string; methods: unknown[][] };
type Reply = { data?: unknown; error?: unknown };
const mock = vi.hoisted(() => ({ calls: [] as Call[], replies: [] as Reply[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const call: Call = { table, methods: [] }; mock.calls.push(call);
    const result = mock.replies.shift() ?? { data: null, error: null };
    const promise = Promise.resolve(result);
    const chain: Record<string, unknown> = { then: promise.then.bind(promise) };
    for (const name of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'limit', 'single', 'maybeSingle', 'lt', 'gt'])
      chain[name] = (...args: unknown[]) => { call.methods.push([name, ...args]); return chain; };
    return chain;
  },
} }));
vi.mock('@/hooks/useOrganizationId', () => ({ getOrganizationId: async () => 'org-1' }));
vi.mock('@/services/booking/bookingPackingSyncService', () => ({ syncBookingToPacking: vi.fn() }));
import { createInternalWarehouseTask } from '@/services/warehouseProjectService';
import { warehousePlanningBounds, warehousePlanningDate } from '../../supabase/functions/_shared/warehousePlanningTime';
const project = { data: { id: 'project-1', organization_id: 'org-1' }, error: null };
const ok = { data: [], error: null };
const input = { title: 'Inventera', start_date: '2026-07-01T08:00:00', end_date: '2026-07-01T10:00:00' };
beforeEach(() => { mock.calls.length = 0; mock.replies.length = 0; });
describe('internal warehouse task creation', () => {
  it('fails before any writes when canonical event link is unavailable', async () => {
    mock.replies.push(project, { error: { code: '42703' } });
    await expect(createInternalWarehouseTask(input)).rejects.toThrow('Ingen uppgift har skapats');
    expect(mock.calls.flatMap(c => c.methods).some(m => m[0] === 'insert')).toBe(false);
  });
  it('writes real task ID on one event with Stockholm times', async () => {
    mock.replies.push(project, ok, { data: { id: 'task-1' } }, ok, { data: { id: 'event-1' } });
    await createInternalWarehouseTask(input);
    const event = mock.calls.find(c => c.table === 'warehouse_calendar_events' && c.methods.some((m) => m[0] === 'insert'));
    expect(event?.methods.find((m) => m[0] === 'insert')?.[1]).toMatchObject({ project_task_id: 'task-1', start_time: '2026-07-01T06:00:00.000Z', end_time: '2026-07-01T08:00:00.000Z' });
  });
  it('assigns only selected staff with SQL time values and exact task/event links', async () => {
    mock.replies.push(project, ok, { data: [{ id: 'staff-1' }] }, { data: { id: 'task-1' } }, ok, ok, { data: { id: 'event-1' } }, ok);
    await createInternalWarehouseTask({ ...input, assigned_to_ids: ['staff-1', 'staff-1'] });
    const assignment = mock.calls.find(c => c.table === 'warehouse_assignments');
    expect(assignment?.methods.find((m) => m[0] === 'insert')?.[1]).toEqual([
      expect.objectContaining({ staff_id: 'staff-1', project_task_id: 'task-1', warehouse_event_id: 'event-1', start_time: '08:00', end_time: '10:00' }),
    ]);
  });
  it('rejects reversed times before writing', async () => {
    mock.replies.push(project);
    await expect(createInternalWarehouseTask({ ...input, end_date: input.start_date })).rejects.toThrow('Sluttid');
    expect(mock.calls).toHaveLength(1);
  });
  it('compensates the task if event insertion fails', async () => {
    mock.replies.push(project, ok, { data: { id: 'task-1' } }, ok, { error: new Error('write failed') }, ok);
    await expect(createInternalWarehouseTask(input)).rejects.toThrow('write failed');
    expect(mock.calls.at(-1)).toMatchObject({ table: 'project_tasks', methods: [['delete'], ['eq', 'id', 'task-1']] });
  });
});
describe('server warehouse dates', () => {
  it('uses a 23-hour spring transition and 25-hour autumn transition', () => {
    const spring = warehousePlanningBounds('2026-03-29', '2026-03-29');
    const fall = warehousePlanningBounds('2026-10-25', '2026-10-25');
    expect((Date.parse(spring.end) - Date.parse(spring.start)) / 3600000).toBe(23);
    expect((Date.parse(fall.end) - Date.parse(fall.start)) / 3600000).toBe(25);
    expect(warehousePlanningDate('2026-07-01T22:30:00Z')).toBe('2026-07-02');
  });
});

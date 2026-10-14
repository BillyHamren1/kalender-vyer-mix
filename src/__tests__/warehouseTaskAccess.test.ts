import { describe, expect, it } from 'vitest';
import { canCompleteWarehouseTask, warehouseVisibleDate, type WarehouseTaskDatabase } from '../../supabase/functions/_shared/warehouseTaskAccess';
type Reply = { data?: unknown; error?: unknown };
function database(results: Reply[]) {
  const calls: { table: string; filters: unknown[][] }[] = [];
  const db = { calls, from(table: string) {
    const call = { table, filters: [] as unknown[][] }; calls.push(call);
    const result = results.shift();
    const promise = Promise.resolve(result);
    const chain: Record<string, unknown> = { then: promise.then.bind(promise) };
    for (const name of ['select', 'eq', 'neq', 'in', 'limit', 'maybeSingle']) chain[name] = (...args: unknown[]) => { call.filters.push([name, ...args]); return chain; };
    return chain;
  } };
  return db as unknown as WarehouseTaskDatabase & { calls: typeof calls };
}
const task = { data: { id: 'task', project_id: 'project', assigned_to_ids: ['former-worker'] } };
const project = { data: { id: 'project' } };
const linked = { data: [{ id: 'event', project_task_id: 'task' }] };
describe('warehouse task completion ownership', () => {
  it('rejects a stale legacy assignee when the linked job has no concrete assignment', async () => {
    const db = database([task, project, linked, { data: [] }]);
    expect(await canCompleteWarehouseTask(db, 'org', 'former-worker', 'task')).toBe(false);
    expect(db.calls.at(-1)?.filters).toContainEqual(['in', 'warehouse_event_id', ['event']]);
    expect(db.calls.at(-1)?.filters).toContainEqual(['eq', 'staff_id', 'former-worker']);
  });
  it('accepts the concrete assignee even if legacy project assignees differ', async () => {
    const db = database([task, project, linked, { data: [{ id: 'assignment' }] }]);
    expect(await canCompleteWarehouseTask(db, 'org', 'new-worker', 'task')).toBe(true);
    for (const call of db.calls) expect(call.filters).toContainEqual(['eq', 'organization_id', 'org']);
  });
  it('rejects cancelled concrete assignments even when legacy ownership remains', async () => {
    const db = database([task, project, linked, { data: [{ id: 'assignment', status: 'cancelled' }] }]);
    expect(await canCompleteWarehouseTask(db, 'org', 'former-worker', 'task')).toBe(false);
    expect(db.calls.at(-1)?.filters).toContainEqual(['neq', 'status', 'cancelled']);
  });
  it('keeps explicit legacy ownership only for unlinked internal tasks', async () => {
    expect(await canCompleteWarehouseTask(database([task, project, { data: [] }]), 'org', 'former-worker', 'task')).toBe(true);
    expect(await canCompleteWarehouseTask(database([task, project, { data: [] }]), 'org', 'other', 'task')).toBe(false);
  });
  it('fails closed for read failure and unrelated projects', async () => {
    await expect(canCompleteWarehouseTask(database([task, project, { error: new Error('offline') }]), 'org', 'worker', 'task')).rejects.toThrow('offline');
    expect(await canCompleteWarehouseTask(database([task, { data: null }]), 'org', 'former-worker', 'task')).toBe(false);
  });
  it('places continuing work on the requested day without changing timestamps', () => {
    expect(warehouseVisibleDate('2026-10-13', '2026-10-14', '2026-10-14')).toBe('2026-10-14');
    expect(warehouseVisibleDate('2026-10-15', '2026-10-14', '2026-10-16')).toBe('2026-10-15');
  });
});

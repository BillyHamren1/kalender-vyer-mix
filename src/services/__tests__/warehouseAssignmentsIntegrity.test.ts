// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ from: vi.fn(), mirror: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mock.from } }));
vi.mock('@/services/staffAssignmentCore', () => ({ assignStaffToTeamCore: mock.mirror }));
import { assignStaffToWarehouseEvent, removeStaffFromWarehouseEvent, syncWarehouseAssignmentsForStaffTeamDay } from '../warehouseAssignmentsSync';
function query(result: unknown) {
  const q: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
  for (const name of ['select','eq','in','is','gte','lt','update','insert','delete']) q[name] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  return q;
}
const event = { id: 'event', organization_id: 'org', start_time: '2026-10-15T06:00:00Z', end_time: '2026-10-15T08:00:00Z', resource_id: 'lager-1', event_type: 'return_2026-10-15', title: 'Retur' };
describe('warehouse staffing integrity', () => {
  beforeEach(() => vi.clearAllMocks());
  it('aborts before any assignment read/write when source events cannot be read', async () => {
    const failure = { message: 'temporary read failure' };
    const source = query({ data: null, error: failure });
    mock.from.mockReturnValue(source);
    await expect(syncWarehouseAssignmentsForStaffTeamDay({ staffId: 'staff', teamId: 'lager-1', date: new Date(2026, 9, 15) })).rejects.toEqual(failure);
    expect(mock.from.mock.calls).toEqual([['warehouse_calendar_events']]);
    expect(source.gte).toHaveBeenCalledWith('start_time', '2026-10-14T22:00:00.000Z');
    expect(source.lt).toHaveBeenCalledWith('start_time', '2026-10-15T22:00:00.000Z');
  });
  it('updates planning fields without overwriting lifecycle status on an existing assignment', async () => {
    const write = query({ error: null });
    mock.from.mockReturnValueOnce(query({ data: event, error: null }))
      .mockReturnValueOnce(query({ data: { id: 'existing' }, error: null })).mockReturnValueOnce(write);
    expect(await assignStaffToWarehouseEvent({ staffId: 'staff', warehouseEventId: 'event' })).toEqual({ ok: true });
    const fields = write.update.mock.calls[0][0];
    expect(fields).not.toHaveProperty('status');
    expect(fields).toMatchObject({ warehouse_event_id: 'event', assignment_type: 'return', action: 'open_return_scanner' });
  });
  it('still initializes a new concrete assignment as planned', async () => {
    const write = query({ error: null });
    mock.from.mockReturnValueOnce(query({ data: event, error: null }))
      .mockReturnValueOnce(query({ data: null, error: null })).mockReturnValueOnce(write);
    await assignStaffToWarehouseEvent({ staffId: 'staff', warehouseEventId: 'event' });
    expect(write.insert.mock.calls[0][0]).toMatchObject({ status: 'planned', warehouse_event_id: 'event' });
  });
});

describe('explicit staffing cancellation', () => {
  it('reactivates only cancelled work on an explicit assignment and records mirror provenance', async () => {
    const write = query({ error: null });
    mock.from.mockReset();
    mock.from.mockReturnValueOnce(query({ data: { ...event, resource_id: 'warehouse' }, error: null }))
      .mockReturnValueOnce(query({ data: { id: 'existing', status: 'cancelled', metadata: { retained: true } }, error: null })).mockReturnValueOnce(write);
    await assignStaffToWarehouseEvent({ staffId: 'staff', warehouseEventId: 'event' });
    expect(write.update.mock.calls[0][0]).toMatchObject({ status: 'planned', metadata: { retained: true, assignment_mode: 'explicit_event', mirrored_team_id: 'lager-1' } });
  });
});

it('retains a cancelled row when the last explicit assignment is removed', async () => {
  const write = query({ error: null });
  mock.from.mockReset().mockReturnValue(write);
  expect(await removeStaffFromWarehouseEvent({ staffId: 'staff', warehouseEventId: 'event' })).toEqual({ ok: true });
  expect(write.update).toHaveBeenCalledWith({ status: 'cancelled' });
  expect(write.delete).not.toHaveBeenCalled();
  expect(write.eq).toHaveBeenCalledWith('staff_id', 'staff');
  expect(write.eq).toHaveBeenCalledWith('warehouse_event_id', 'event');
});

it('never expands an explicit job mirror during passive team reconciliation', async () => {
  const events = query({ data: [event, { ...event, id: 'unassigned-job' }], error: null });
  const existing = query({ data: [{ id: 'assignment', warehouse_event_id: 'event', metadata: { assignment_mode: 'explicit_event', resource_id: 'warehouse', mirrored_team_id: 'lager-1' } }], error: null });
  mock.from.mockReset().mockReturnValueOnce(events).mockReturnValueOnce(existing);
  await syncWarehouseAssignmentsForStaffTeamDay({ staffId: 'staff', teamId: 'lager-1', date: new Date(2026, 9, 15) });
  expect(mock.from).toHaveBeenCalledTimes(2);
  expect(existing.delete).not.toHaveBeenCalled();
  expect(existing.update).not.toHaveBeenCalled();
});

it('allows an intentional team placement to materialize team work without reopening cancelled jobs', async () => {
  const writeExisting = query({ error: null });
  const writeNew = query({ error: null });
  mock.from.mockReset()
    .mockReturnValueOnce(query({ data: [event, { ...event, id: 'second' }], error: null }))
    .mockReturnValueOnce(query({ data: [{ id: 'assignment', warehouse_event_id: 'event', metadata: { assignment_mode: 'explicit_event', mirrored_team_id: 'lager-1' } }], error: null }))
    .mockReturnValueOnce(query({ data: { id: 'assignment', status: 'cancelled' }, error: null }))
    .mockReturnValueOnce(writeExisting)
    .mockReturnValueOnce(query({ data: null, error: null }))
    .mockReturnValueOnce(writeNew);
  await syncWarehouseAssignmentsForStaffTeamDay({ staffId: 'staff', teamId: 'lager-1', date: new Date(2026, 9, 15), explicitTeamPlacement: true });
  expect(writeExisting.update.mock.calls[0][0]).not.toHaveProperty('status');
  expect(writeNew.insert.mock.calls[0][0]).toMatchObject({ warehouse_event_id: 'second', status: 'planned' });
});

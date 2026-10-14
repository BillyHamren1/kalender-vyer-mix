// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ writes: [] as { table: string; data: Record<string, unknown> }[], assignmentError: null as Error | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      start_time: '2026-07-01T08:00:00Z', end_time: '2026-07-01T09:00:00Z',
      manually_adjusted: false, has_source_changes: true,
    }, error: null }) }) }),
    update: (data: Record<string, unknown>) => {
      calls.writes.push({ table, data });
      return { eq: async () => ({ error: table === 'warehouse_assignments' ? calls.assignmentError : null }) };
    },
  }),
} }));
import { updateWarehouseCalendarEvent } from '../warehouseCalendarService';

describe('warehouse move persistence', () => {
  beforeEach(() => { calls.writes = []; calls.assignmentError = null; });
  it('preserves dragged instants while assigning the Stockholm work date', async () => {
    await updateWarehouseCalendarEvent('event', { start_time: '2026-07-01T23:00:00Z', end_time: '2026-07-02T00:00:00Z' });
    expect(calls.writes[0].data.start_time).toBe('2026-07-01T23:00:00Z');
    expect(calls.writes[1]).toEqual({ table: 'warehouse_assignments', data: {
      assignment_date: '2026-07-02', start_time: '01:00', end_time: '02:00',
    } });
  });
  it('rejects inverted intervals before any write', async () => {
    await expect(updateWarehouseCalendarEvent('event', { end_time: '2026-07-01T07:00:00Z' })).rejects.toThrow();
    expect(calls.writes).toHaveLength(0);
  });
  it('restores original event if assignment persistence fails', async () => {
    calls.assignmentError = new Error('write failed');
    await expect(updateWarehouseCalendarEvent('event', { end_time: '2026-07-01T10:00:00Z' })).rejects.toThrow('write failed');
    expect(calls.writes[2]).toEqual({ table: 'warehouse_calendar_events', data: {
      start_time: '2026-07-01T08:00:00Z', end_time: '2026-07-01T09:00:00Z', manually_adjusted: false, has_source_changes: true,
    } });
  });
});

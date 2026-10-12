import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchInternalWarehouseIdentity } from '../internalWarehouseIdentityService';

const fixture = vi.hoisted(() => ({ rows: [] as any[], error: null as any, filters: [] as [string, unknown][], select: '' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => {
    const query = {
      select: (columns: string) => { fixture.select = columns; return query; },
      is: (column: string, value: unknown) => { fixture.filters.push([column, value]); return query; },
      eq: (column: string, value: unknown) => { fixture.filters.push([column, value]); return query; },
      limit: async (count: number) => ({
        data: fixture.rows.filter(row => fixture.filters.every(([field, value]) => {
          const [root, child] = field.split('.');
          return (child ? row[root]?.[child] : row[root]) === value;
        })).slice(0, count), error: fixture.error,
      }),
    };
    return query;
  } },
}));

const warehouse = (id: string) => ({ id, name: 'Renamed warehouse', organization_id: 'org', is_internal: true,
  deleted_at: null, booking_id: 'warehouse-booking', warehouse_booking: { is_internal: true, internal_type: 'warehouse' } });

describe('canonical permanent Lager identity', () => {
  beforeEach(() => { fixture.rows = []; fixture.error = null; fixture.filters = []; fixture.select = ''; });

  it('keeps the existing Lager id among finite projects and other internal activities', async () => {
    fixture.rows = [
      { ...warehouse('finite'), name: 'Lager', warehouse_booking: null },
      { ...warehouse('training'), warehouse_booking: { is_internal: true, internal_type: 'training' } },
      { ...warehouse('deleted-lager'), deleted_at: '2026-10-01' },
      warehouse('historic-lager'),
    ];
    expect((await fetchInternalWarehouseIdentity())?.id).toBe('historic-lager');
    expect(fixture.select).toContain('!inner');
  });

  it('does not infer Lager from an internal flag or display name', async () => {
    fixture.rows = [{ ...warehouse('finite'), name: 'Lager', warehouse_booking: null }];
    expect(await fetchInternalWarehouseIdentity()).toBeNull();
  });

  it('rejects ambiguous Lager identities instead of attaching new work to the first row', async () => {
    fixture.rows = [warehouse('old'), warehouse('duplicate')];
    await expect(fetchInternalWarehouseIdentity()).rejects.toThrow('Flera Lagerprojekt');
  });

  it('propagates access/database failures instead of treating them as a missing project', async () => {
    fixture.error = new Error('read denied');
    await expect(fetchInternalWarehouseIdentity()).rejects.toThrow('read denied');
  });
});

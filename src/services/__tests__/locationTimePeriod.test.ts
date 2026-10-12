import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLocationTimeEntriesForPeriod } from '../locationTimeService';

const fixture = vi.hoisted(() => ({ rows: [] as any[], calls: 0, failPage: -1, changeCount: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const filters: [string, string, unknown][] = [];
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(['eq', key, value]); return query; },
    gte: (key: string, value: unknown) => { filters.push(['gte', key, value]); return query; },
    lte: (key: string, value: unknown) => { filters.push(['lte', key, value]); return query; },
    order: () => query,
    range: async (start: number, end: number) => {
      const page = fixture.calls++;
      const rows = fixture.rows.filter(row => filters.every(([op, key, value]) =>
        op === 'eq' ? row[key] === value : op === 'gte' ? row[key] >= value! : row[key] <= value!));
      return { data: rows.slice(start, end + 1), count: rows.length + (fixture.changeCount && page > 0 ? 1 : 0), error: page === fixture.failPage ? new Error('page denied') : null };
    },
  };
  return query;
} } }));

const filters = { location_id: 'lager', date_from: '2026-10-01', date_to: '2026-10-31' };
describe('complete location time period', () => {
  beforeEach(() => {
    fixture.rows = Array.from({ length: 1101 }, (_, id) => ({ id: String(id), location_id: 'lager', entry_date: '2026-10-12', total_minutes: 60 }));
    fixture.calls = 0; fixture.failPage = -1; fixture.changeCount = false;
  });
  it('includes all 1101 rows in totals instead of the latest 500', async () => {
    const rows = await fetchLocationTimeEntriesForPeriod(filters);
    expect(rows).toHaveLength(1101);
    expect(rows.reduce((sum, row) => sum + row.total_minutes!, 0)).toBe(66060);
    expect(fixture.calls).toBe(3);
  });
  it('excludes other locations and dates', async () => {
    fixture.rows.push({ id: 'other', location_id: 'office', entry_date: '2026-10-12' }, { id: 'old', location_id: 'lager', entry_date: '2026-09-30' });
    expect(await fetchLocationTimeEntriesForPeriod(filters)).toHaveLength(1101);
  });
  it('uses arrival-date cohorts, not calendar-month overlap allocation', async () => {
    fixture.rows = [
      { id: 'before', location_id: 'lager', entry_date: '2026-09-30', entered_at: '2026-09-30T23:00:00Z', exited_at: '2026-10-01T02:00:00Z', total_minutes: 180 },
      { id: 'inside', location_id: 'lager', entry_date: '2026-10-31', entered_at: '2026-10-31T23:00:00Z', exited_at: '2026-11-01T02:00:00Z', total_minutes: 180 },
    ];
    const rows = await fetchLocationTimeEntriesForPeriod(filters);
    expect(rows.map(row => row.id)).toEqual(['inside']);
    expect(rows[0].total_minutes).toBe(180);
  });
  it('never returns a partial sum when a later page fails', async () => {
    fixture.failPage = 1;
    await expect(fetchLocationTimeEntriesForPeriod(filters)).rejects.toThrow('page denied');
  });
  it('rejects changing result sets instead of silently omitting rows', async () => {
    fixture.changeCount = true;
    await expect(fetchLocationTimeEntriesForPeriod(filters)).rejects.toThrow('ändrades');
  });
  it('handles an empty period', async () => {
    fixture.rows = [];
    expect(await fetchLocationTimeEntriesForPeriod(filters)).toEqual([]);
  });
  it('rejects reversed dates before querying', async () => {
    await expect(fetchLocationTimeEntriesForPeriod({ ...filters, date_to: '2026-09-30' })).rejects.toThrow('giltig period');
    expect(fixture.calls).toBe(0);
  });
});

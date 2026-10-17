import { describe, it, expect, vi, beforeEach } from 'vitest';
const fixture = vi.hoisted(() => ({ packings: [] as Record<string, unknown>[], calls: [] as { org?: string; ids?: string[] }[], fail: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from(table: string) {
  if (table === 'packing_projects') return { select: () => ({ order: async () => ({ data: fixture.packings, error: null }) }) };
  const call: { org?: string; ids?: string[] } = {}; fixture.calls.push(call);
  const query = {
    select: () => query,
    eq: (_key: string, org: string) => { call.org = org; return query; },
    in: async (_key: string, ids: string[]) => {
      call.ids = ids;
      return { data: ids.map(id => ({ id, client: call.org })), error: fixture.fail ? new Error('read failed') : null };
    },
  }; return query;
} } }));
import { fetchPackings } from '../packingService';
beforeEach(() => { fixture.calls = []; fixture.packings = []; fixture.fail = false; });
describe('Packings batched booking reads', () => {
  it('loads 300 packings with two bounded booking reads instead of 300', async () => {
    fixture.packings = Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, organization_id: 'org-a', booking_id: `b${i}` }));
    const rows = await fetchPackings();
    expect(rows).toHaveLength(300);
    expect(fixture.calls).toHaveLength(2);
    expect(fixture.calls.map(c => c.ids?.length)).toEqual([200, 100]);
    expect(fixture.calls.every(c => c.org === 'org-a')).toBe(true);
    expect(rows[299].booking?.id).toBe('b299');
  });
  it('deduplicates shared booking IDs and isolates organizations', async () => {
    fixture.packings = [{ id: 'p1', booking_id: 'shared', organization_id: 'a' }, { id: 'p2', booking_id: 'shared', organization_id: 'a' }, { id: 'p3', booking_id: 'shared', organization_id: 'b' }];
    const rows = await fetchPackings();
    expect(fixture.calls).toEqual([{ org: 'a', ids: ['shared'] }, { org: 'b', ids: ['shared'] }]);
    expect(rows.map(r => r.booking?.client)).toEqual(['a', 'a', 'b']);
  });
  it('fails rather than displaying partial data when a booking batch fails', async () => {
    fixture.packings = [{ id: 'p', booking_id: 'b', organization_id: 'a' }]; fixture.fail = true;
    await expect(fetchPackings()).rejects.toThrow('read failed');
  });
});
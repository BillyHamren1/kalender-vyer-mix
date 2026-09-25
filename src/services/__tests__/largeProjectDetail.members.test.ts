import { describe, it, expect, vi } from 'vitest';

// Projektdetaljens datakälla (fetchLargeProjectCore): join-medlem + legacy-only
// medlem ska båda synas, utan dubblett, med grundbokningen markerad.
vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => (table === 'bookings'
        ? Promise.resolve({ data: [{ id: 'b-1' }, { id: 'b-legacy' }], error: null })
        : chain),
      single: () => Promise.resolve({
        data: {
          id: 'lp1', name: 'Mässan', status: 'planning', primary_booking_id: 'b-1',
          large_project_bookings: [
            { id: 'lpb-1', large_project_id: 'lp1', booking_id: 'b-1', display_name: null, sort_order: 1, created_at: '' },
          ],
        },
        error: null,
      }),
    };
    return chain;
  };
  return { supabase: { from } };
});

import { fetchLargeProjectCore } from '@/services/largeProjectService';

describe('Projektdetalj – medlemmar efter kalenderklick', () => {
  it('visar join- och legacy-medlemmar en gång var, grundbokning markerad', async () => {
    const core = await fetchLargeProjectCore('lp1');
    const ids = core!.bookings.map((b) => b.booking_id).sort();
    expect(ids).toEqual(['b-1', 'b-legacy']);
    expect(core!.bookingCount).toBe(2);
    expect(core!.bookings.filter((b: any) => b.is_primary).map((b) => b.booking_id)).toEqual(['b-1']);
  });
});

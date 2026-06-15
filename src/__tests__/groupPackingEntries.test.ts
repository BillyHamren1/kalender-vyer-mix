import { describe, expect, it } from 'vitest';
import { groupPackingEntries } from '@/lib/packing/groupPackingEntries';
import type { PackingWithBooking } from '@/types/packing';

const makePacking = (
  id: string,
  bookingNumber: string,
  lpId: string | null,
  lpName: string | null,
): PackingWithBooking =>
  ({
    id,
    name: `Pack ${id}`,
    booking_id: `b-${id}`,
    status: 'planning',
    created_at: '2026-06-15T00:00:00Z',
    updated_at: '2026-06-15T00:00:00Z',
    booking: {
      id: `b-${id}`,
      client: 'Client',
      booking_number: bookingNumber,
      eventdate: '2026-07-01',
      rigdaydate: null,
      rigdowndate: null,
      deliveryaddress: null,
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      large_project_id: lpId,
    },
    large_project: lpId && lpName ? { id: lpId, name: lpName } : null,
  }) as unknown as PackingWithBooking;

describe('groupPackingEntries', () => {
  it('grupperar packlistor från samma stora projekt till ETT lp_group-kort', () => {
    const entries = [
      { kind: 'out' as const, packing: makePacking('1', '2606-1', 'lp1', 'Almedalen 2026') },
      { kind: 'out' as const, packing: makePacking('2', '2606-2', 'lp1', 'Almedalen 2026') },
      { kind: 'out' as const, packing: makePacking('3', '2606-3', null, null) },
    ];
    const groups = groupPackingEntries(entries);
    expect(groups).toHaveLength(2);
    const lp = groups.find(g => g.type === 'lp_group');
    expect(lp).toBeDefined();
    expect(lp?.type === 'lp_group' && lp.packings).toHaveLength(2);
    expect(lp?.type === 'lp_group' && lp.largeProjectName).toBe('Almedalen 2026');
  });

  it('separerar olika kind (out/in) även för samma LP', () => {
    const a = makePacking('1', '2606-1', 'lp1', 'X');
    const b = makePacking('2', '2606-2', 'lp1', 'X');
    const groups = groupPackingEntries([
      { kind: 'out', packing: a },
      { kind: 'in', packing: b },
    ]);
    expect(groups).toHaveLength(2);
  });
});

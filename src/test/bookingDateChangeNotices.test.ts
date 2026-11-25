import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupBookingDateChanges, bookingDateNoticeLink } from '@/lib/warehouse/bookingDateChangeNotices';

const sql = readFileSync('supabase/migrations/20261125130340_a866c1a1-93ca-46a7-a887-42fdfb07bd7a.sql', 'utf8');

describe('lagernotis vid ändrade bokningsdatum', () => {
  it('grupperar per bokning och revision med gammalt → nytt i ordningen rigg/event/riv', () => {
    const g = groupBookingDateChanges([
      { id: '2', booking_id: 'b1', booking_number: '2611', packing_id: 'p1', field_name: 'rigdowndate', old_value: '2026-12-05', new_value: '2026-12-06', source_revision: '5', created_at: '2026-11-25T10:00:00Z' },
      { id: '1', booking_id: 'b1', booking_number: '2611', packing_id: 'p1', field_name: 'rigdaydate', old_value: '2026-12-01', new_value: '2026-12-03', source_revision: '5', created_at: '2026-11-25T10:00:00Z' },
      { id: '3', booking_id: 'b1', booking_number: '2611', packing_id: 'p1', field_name: 'rigdaydate', old_value: '2026-12-03', new_value: '2026-12-04', source_revision: '6', created_at: '2026-11-25T11:00:00Z' },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].ids).toEqual(['3']);
    expect(g[1].changes.map((c) => c.label)).toEqual(['Rigg', 'Riv']);
    expect(g[1].changes[0]).toEqual({ label: 'Rigg', oldValue: '2026-12-01', newValue: '2026-12-03' });
    expect(bookingDateNoticeLink(g[1])).toBe('/warehouse/packing/p1');
    expect(bookingDateNoticeLink({ packingId: null, bookingId: 'b 1' })).toBe('/warehouse/bookings/b%201');
  });

  it('triggern blockerar aldrig datumändringen och skapar ingen falsk notis vid första datum', () => {
    expect(sql).toMatch(/AFTER UPDATE OF rigdaydate, eventdate, rigdowndate ON public\.bookings/);
    expect(sql).not.toMatch(/RAISE EXCEPTION/);
    expect(sql).toMatch(/IF o IS NULL OR o IS NOT DISTINCT FROM n THEN CONTINUE/);
  });

  it('replay av samma revision ger ingen dubblett, ny revision ger ny notis', () => {
    expect(sql).toMatch(/concat_ws\('\|', 'date', NEW\.id, f, o, coalesce\(n,'∅'\), v_rev\)/);
    expect(sql).toMatch(/ON CONFLICT \(organization_id, dedupe_key\)/);
  });

  it('endast extern Booking-källa och samma organisation som packlistan', () => {
    expect(sql).toMatch(/NOT IN \('booking-import','booking-webhook'\)/);
    expect(sql).toMatch(/pp\.organization_id = NEW\.organization_id AND pp\.booking_id = NEW\.id/);
    expect(sql).not.toMatch(/UPDATE public\.packing_(projects|list_items)/);
  });
});

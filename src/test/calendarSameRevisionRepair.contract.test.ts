import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reserveSameRevisionCalendarRepair, reserveSameRevisionProductRepair } from '../../supabase/functions/_shared/productRepairReservation';

const inc = { sourceUpdatedAt: '2026-11-25T18:50:00.078877+00:00', sourceVersion: null, sourceStatus: 'CONFIRMED' } as any;
const sb = (data: any) => ({ rpc: vi.fn().mockResolvedValue({ data, error: null }) });

describe('same-revision calendar repair', () => {
  it('uses its own RPC (not the product repair RPC) and returns the token', async () => {
    const s = sb({ decision: 'reserved', reservation_token: 't1' });
    const r = await reserveSameRevisionCalendarRepair(s, { bookingId: 'b', organizationId: 'o', incoming: inc });
    expect(s.rpc).toHaveBeenCalledWith('reserve_booking_calendar_repair', expect.objectContaining({ p_booking_id: 'b', p_organization_id: 'o' }));
    expect(r).toEqual({ ok: true, decision: 'reserved', reservationToken: 't1' });
  });
  it('no pending baseline → not_pending (import stays a no-op)', async () => {
    const r = await reserveSameRevisionCalendarRepair(sb({ decision: 'not_pending' }), { bookingId: 'b', organizationId: 'o', incoming: inc });
    expect(r).toEqual({ ok: false, decision: 'not_pending' });
  });
  it('product repair still uses the product RPC', async () => {
    const s = sb({ decision: 'not_pending' });
    await reserveSameRevisionProductRepair(s, { bookingId: 'b', organizationId: 'o', incoming: inc });
    expect(s.rpc).toHaveBeenCalledWith('reserve_booking_product_repair', expect.anything());
  });
  it('import: calendar repair never grants product writes (productRepairRun only set by product repair)', () => {
    const src = readFileSync(join(__dirname, '../../supabase/functions/import-bookings/index.ts'), 'utf8');
    const block = src.slice(src.indexOf('Same-revision kalenderreparation'), src.indexOf("if (reserved.ok && reserved.decision === 'already_current')"));
    expect(block).toMatch(/reserveSameRevisionCalendarRepair\(/);
    expect(block).not.toMatch(/productRepairRun\s*=/);
    expect(block).not.toMatch(/productsAllowed\s*=/);
  });
});

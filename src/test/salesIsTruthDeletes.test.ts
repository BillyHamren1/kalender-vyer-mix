// Sales/Booking är facit: komplett produktlista får alltid ta bort rader.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createSyncCounters,
  checkDestructiveLimit,
  guardedDeleteByIds,
  SafetyCircuitBreakerError,
} from '../../supabase/functions/_shared/syncObservability.ts';

const client = () => {
  const b: any = { delete: () => b, eq: () => b, in: () => Promise.resolve({ error: null }) };
  return { from: () => b };
};
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe('produktborttagning när Booking är komplett', () => {
  it('31 borttagningar går igenom när källan är komplett', async () => {
    const counters = createSyncCounters();
    const res = await guardedDeleteByIds(client(), {
      table: 'packing_list_items', ids: ids(31), kind: 'product_deletes', counters, sourceComplete: true,
    });
    expect(res.deleted).toBe(31);
    expect(counters.product_deletes).toBe(31);
    expect(counters.deletes).toBe(0);
  });

  it('31 borttagningar blockeras när källan är okänd/ofullständig', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const counters = createSyncCounters();
    await expect(guardedDeleteByIds(client(), {
      table: 'packing_list_items', ids: ids(31), kind: 'product_deletes', counters,
    })).rejects.toBeInstanceOf(SafetyCircuitBreakerError);
  });

  it('komplett källa undantar inte kalenderborttagningar', () => {
    const counters = createSyncCounters();
    expect(checkDestructiveLimit(counters, 'calendar_deletes', 11, { sourceComplete: true }).allowed).toBe(false);
  });
});

describe('import-bookings och projektets sidhuvud', () => {
  const src = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
  it('bilagor sparas även när säkerhetsspärren stoppar packlistan', () => {
    expect(src).toMatch(/error instanceof SafetyCircuitBreakerError && !isDryRun[\s\S]{0,120}syncAttachmentsAfterBlockedSync/);
  });
  it('sidhuvudet läser bilagor live från Booking', () => {
    const header = readFileSync('src/components/project/BookingInfoHeader.tsx', 'utf8');
    expect(header).toContain('fetchBookingAttachments');
    expect(header).not.toContain(".from('booking_attachments')");
  });
});

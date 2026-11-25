import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  readWarehouseSync, readDeliverySignal, isProductScopeRestricted,
  mergeJobWarehouseSync, resolveProductSyncScope, toWarehouseSyncPayload,
} from '../../supabase/functions/_shared/productSyncScope';

const partial = (event: string) => ({
  event_type: event, booking_id: 'b1', delivery_scope: 'schedule_metadata',
  warehouse_sync: { status: 'attention_required', code: 'lifecycle_conflict', products_wms_accepted: false },
});

describe('Sales partial delivery contract (19ae78963)', () => {
  for (const ev of ['booking_updated', 'booking_time_updated']) {
    it(`${ev} with schedule_metadata blocks products`, () => {
      const s = readDeliverySignal(partial(ev));
      expect(isProductScopeRestricted(s)).toBe(true);
      expect(toWarehouseSyncPayload(s)).toMatchObject({ products_wms_accepted: false, delivery_scope: 'schedule_metadata' });
    });
  }
  it('delivery_scope alone restricts (fail-closed)', () => {
    expect(isProductScopeRestricted(readDeliverySignal({ delivery_scope: 'schedule_metadata' }))).toBe(true);
  });
  it('schedule_metadata wins over a contradictory accept', () => {
    const s = readDeliverySignal({ delivery_scope: 'schedule_metadata', warehouse_sync: { products_wms_accepted: true } });
    expect(isProductScopeRestricted(s)).toBe(true);
  });
  it('full delivery (both markers removed) is accepted and lifts earlier partial', () => {
    const full = readDeliverySignal({ event_type: 'booking_updated', booking_id: 'b1' });
    expect(isProductScopeRestricted(full)).toBe(false);
    expect(toWarehouseSyncPayload(full)).toMatchObject({ products_wms_accepted: true });
    const merged = mergeJobWarehouseSync(readDeliverySignal(partial('booking_time_updated')), full);
    expect(isProductScopeRestricted(merged)).toBe(false);
  });
  it('later partial after full restricts again', () => {
    const merged = mergeJobWarehouseSync(readDeliverySignal({}), readDeliverySignal(partial('booking_updated')));
    expect(isProductScopeRestricted(merged)).toBe(true);
  });
  it('older messages without fields keep previous full behavior', () => {
    expect(readWarehouseSync({ event_type: 'booking_updated' })).toBeNull();
    expect(resolveProductSyncScope({ job: null, canonical: null }).productsAllowed).toBe(true);
  });
  it('canonical meta.delivery_scope also restricts', () => {
    const scope = resolveProductSyncScope({ job: null, canonical: readWarehouseSync({ meta: { delivery_scope: 'schedule_metadata' } }) });
    expect(scope.productsAllowed).toBe(false);
  });
  it('receiver always records scope; coalescing ordered by created_at', () => {
    const rb = readFileSync('supabase/functions/receive-booking/index.ts', 'utf8');
    expect(rb).toContain('readDeliverySignal(body)');
    const ps = readFileSync('supabase/functions/process-sync-jobs/index.ts', 'utf8');
    expect(ps).toMatch(/orderedJobs[\s\S]*created_at/);
  });
});

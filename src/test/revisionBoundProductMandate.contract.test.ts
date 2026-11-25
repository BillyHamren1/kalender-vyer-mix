import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyDelivery, mandateToScope } from '../../supabase/functions/_shared/productSyncScope';

const base = {
  event_id: 'ev-1', source_updated_at: '2026-12-08T13:00:00.000Z', canonical_status: 'CONFIRMED',
  booking_id: 'b1', organization_id: 'o1', products: [{ id: 'p' }],
};
const partial = { ...base, event_type: 'booking_time_updated', delivery_scope: 'schedule_metadata',
  warehouse_sync: { status: 'attention_required', code: 'lifecycle_conflict', products_wms_accepted: false } };

describe('Revisionsbunden klassning av Sales-leveranser', () => {
  it('partial bär event_id + revision', () => {
    expect(classifyDelivery(partial)).toMatchObject({ scope: 'partial', eventId: 'ev-1', sourceUpdatedAt: base.source_updated_at, code: 'lifecycle_conflict' });
  });
  it('verifierad full leverans: markörer borttagna, ingen explicit accept krävs', () => {
    for (const ev of ['booking_updated', 'booking_time_updated']) {
      expect(classifyDelivery({ ...base, event_type: ev }).scope).toBe('full');
    }
  });
  it('legacy/neutral/inkrementell häver aldrig begränsning', () => {
    expect(classifyDelivery({ booking_id: 'b1', event_type: 'booking_updated' }).scope).toBe('neutral'); // saknar event_id/revision/products
    expect(classifyDelivery({ ...base, event_type: 'booking_updated', products: undefined }).scope).toBe('neutral');
    expect(classifyDelivery({ ...base, event_type: 'booking_updated', source_updated_at: 'nonsense' }).scope).toBe('neutral');
    expect(classifyDelivery({ ...base, event_type: 'poller_refresh' }).scope).toBe('neutral');
  });
  it('cancellation-markör utan scope ändrar inte cancellation-vägen', () => {
    const c = { ...base, event_type: 'booking_cancelled', canonical_status: 'CANCELLED', warehouse_sync: partial.warehouse_sync };
    expect(classifyDelivery(c).scope).toBe('neutral');
  });
  it('begränsande warehouse_sync utan scope (ej avbokad) = partial (fail-closed)', () => {
    const { delivery_scope: _d, ...noScope } = partial;
    expect(classifyDelivery(noScope).scope).toBe('partial');
  });
});

describe('Mandat → produktscope', () => {
  it('endast legacy eller exakt full revision tillåter produkter', () => {
    expect(mandateToScope({ decision: 'allowed_legacy', allowed: true }).productsAllowed).toBe(true);
    expect(mandateToScope({ decision: 'allowed_exact_full', allowed: true }).productsAllowed).toBe(true);
    for (const d of ['deferred_partial', 'deferred_no_mandate', 'deferred_invalid_revision', 'mandate_unavailable']) {
      expect(mandateToScope({ decision: d, allowed: false }).productsAllowed).toBe(false);
    }
    expect(mandateToScope({ decision: 'weird', allowed: true }).productsAllowed).toBe(false);
    expect(mandateToScope(null).productsAllowed).toBe(false);
  });
});

describe('Import-wiring', () => {
  const imp = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
  const recv = readFileSync('supabase/functions/receive-booking/index.ts', 'utf8');
  it('importen använder aldrig jobbets signal som mandat', () => {
    expect(imp).not.toMatch(/resolveProductSyncScope\(/);
    expect(imp).toMatch(/'product_write_mandate'/);
  });
  it('mandat prövas per bokning med canonical revision efter reservation', () => {
    expect(imp).toMatch(/bookingProductScope: ProductSyncScope = await productMandate\(\s*externalBooking\.id,\s*externalBooking\?\.source_updated_at/);
  });
  it('omprövning före commit markerar products_pending om delleverans kom under körning', () => {
    expect(imp).toMatch(/product_scope_changed_during_import = true;\s*singleProductScope = recheck;/);
  });
  it('mandat-RPC-fel = produkter skjuts upp (fail-closed), datum fortsätter', () => {
    expect(imp).toMatch(/mandate_unavailable', allowed: false/);
  });
  it('partial utan revision avvisas utan att jobb skapas', () => {
    expect(recv.indexOf("invalid_partial_delivery")).toBeLessThan(recv.indexOf("'enqueue_booking_sync_job_scoped'"));
  });
});

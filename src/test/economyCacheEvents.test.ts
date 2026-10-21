import { describe, expect, it } from 'vitest';
import { economyCacheRefreshBookingId } from '../../supabase/functions/_shared/economyCacheEvents';

const bookingId = '8e16aa4d-d865-4b02-b648-f43cbe2b1a5a';

describe('economy cache write events', () => {
  it.each(['budget', 'purchases', 'quotes', 'invoices', 'time_reports', 'product_costs', 'extra_costs', 'supplier_invoices'])(
    'refreshes only the affected booking for successful %s writes',
    (type) => {
      expect(economyCacheRefreshBookingId({
        type,
        method: 'PUT',
        ok: true,
        params: { booking_id: bookingId, id: 'source-row' },
      })).toBe(bookingId);
    },
  );

  it('covers creates, corrections, deletes, and a source response carrying the booking ID', () => {
    expect(economyCacheRefreshBookingId({
      type: 'purchases', method: 'POST', ok: true, params: { data: { booking_id: bookingId } },
    })).toBe(bookingId);
    expect(economyCacheRefreshBookingId({
      type: 'invoices', method: 'DELETE', ok: true, params: { booking_id: bookingId, id: 'invoice-1' },
    })).toBe(bookingId);
    expect(economyCacheRefreshBookingId({
      type: 'supplier_invoices', method: 'PUT', ok: true, params: { id: 'invoice-1' },
      responseData: { booking_id: bookingId },
    })).toBe(bookingId);
  });

  it('does not refresh for reads, failed writes, unrelated endpoints, or invalid IDs', () => {
    expect(economyCacheRefreshBookingId({ type: 'purchases', method: 'GET', ok: true, params: { booking_id: bookingId } })).toBeNull();
    expect(economyCacheRefreshBookingId({ type: 'purchases', method: 'DELETE', ok: false, params: { booking_id: bookingId } })).toBeNull();
    expect(economyCacheRefreshBookingId({ type: 'close_project', method: 'POST', ok: true, params: { booking_id: bookingId } })).toBeNull();
    expect(economyCacheRefreshBookingId({ type: 'purchases', method: 'DELETE', ok: true, params: { booking_id: 'other-tenant' } })).toBeNull();
  });
});

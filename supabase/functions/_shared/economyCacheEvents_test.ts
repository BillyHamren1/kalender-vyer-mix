import { economyCacheRefreshBookingId } from './economyCacheEvents.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const BOOKING = '8e16aa4d-d865-4b02-b648-f43cbe2b1a5a';
const BASE = { type: 'purchases', method: 'PUT', ok: true };

Deno.test('refreshar cache för skapande med booking_id i body', () => {
  assertEquals(economyCacheRefreshBookingId({ ...BASE, method: 'POST', params: { data: { booking_id: BOOKING } } }), BOOKING);
});

Deno.test('refreshar cache för ändring och borttagning med booking_id i requesten', () => {
  assertEquals(economyCacheRefreshBookingId({ ...BASE, params: { booking_id: BOOKING, id: 'purchase-1' } }), BOOKING);
  assertEquals(economyCacheRefreshBookingId({ ...BASE, method: 'DELETE', params: { booking_id: BOOKING, id: 'purchase-1' } }), BOOKING);
});

Deno.test('kan läsa booking_id från svaret när källan returnerar den', () => {
  assertEquals(economyCacheRefreshBookingId({
    type: 'supplier_invoices', method: 'PUT', ok: true, params: { id: 'invoice-1' },
    responseData: { booking_id: BOOKING },
  }), BOOKING);
});

Deno.test('refreshar efter produktkostnader och övriga kostnader', () => {
  assertEquals(economyCacheRefreshBookingId({ type: 'product_costs', method: 'PUT', ok: true, params: { booking_id: BOOKING } }), BOOKING);
  assertEquals(economyCacheRefreshBookingId({ type: 'extra_costs', method: 'PUT', ok: true, params: { booking_id: BOOKING } }), BOOKING);
});

Deno.test('ignorerar GET, misslyckade skrivningar, andra API-typer och felaktiga tenant-ID:n', () => {
  assertEquals(economyCacheRefreshBookingId({ ...BASE, method: 'GET', params: { booking_id: BOOKING } }), null);
  assertEquals(economyCacheRefreshBookingId({ ...BASE, ok: false, params: { booking_id: BOOKING } }), null);
  assertEquals(economyCacheRefreshBookingId({ ...BASE, type: 'close_project', params: { booking_id: BOOKING } }), null);
  assertEquals(economyCacheRefreshBookingId({ ...BASE, params: { booking_id: 'not-a-uuid' } }), null);
});

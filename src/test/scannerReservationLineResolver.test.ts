import { describe, expect, it } from 'vitest';
import { resolveExactReservationLine } from '@/lib/scanner/reservationLineResolver';

const lines = [
  {
    reservation_line_id: 'line-a',
    source_booking_product_id: 'booking-product-a',
    item_type_id: 'type-a',
    sku: 'SAME-SKU',
  },
  {
    reservation_line_id: 'line-b',
    source_booking_product_id: 'booking-product-b',
    item_type_id: 'type-b',
    sku: 'SAME-SKU',
  },
];

describe('exact reservation-line resolution', () => {
  it('resolves a unique booking-product relationship', () => {
    expect(resolveExactReservationLine(lines, [], { bookingProductId: 'booking-product-b' })).toEqual({
      ok: true,
      reservationLineId: 'line-b',
      sourceBookingProductId: 'booking-product-b',
    });
  });

  it('rejects duplicate SKU rows instead of selecting the first one', () => {
    expect(resolveExactReservationLine(lines, [], { sku: 'same-sku' })).toMatchObject({
      ok: false,
      code: 'RESERVATION_LINE_AMBIGUOUS',
    });
  });

  it('uses the exact line attached to a serialized allocation', () => {
    const allocations = [{ serial_number: 'EPC-7', reservation_line_id: 'line-a' }];
    expect(resolveExactReservationLine(lines, allocations, { serialNumber: ' epc-7 ' })).toMatchObject({
      ok: true,
      reservationLineId: 'line-a',
      sourceBookingProductId: 'booking-product-a',
    });
  });

  it('fails closed when WMS omits the local source relationship', () => {
    const incomplete = [{ reservation_line_id: 'line-x', source_booking_product_id: null, sku: 'X' }];
    expect(resolveExactReservationLine(incomplete, [], { reservationLineId: 'line-x' })).toMatchObject({
      ok: false,
      code: 'RESERVATION_LINE_MISSING',
    });
  });
});

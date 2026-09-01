import { reservationLinesFrom } from './reservation-line-identity.ts'

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

Deno.test('normalizes exact WMS reservation line identity', () => {
  const lines = reservationLinesFrom({
    current_state: {
      lines: [{
        id: 'line-1',
        source_booking_product_id: 'booking-product-1',
        item_type_id: 'type-1',
        sku: 'SKU-1',
        quantity: 4,
      }],
    },
  })
  assert(lines.length === 1, 'expected one line')
  assert(lines[0].reservationLineId === 'line-1', 'line id was not normalized')
  assert(lines[0].sourceBookingProductId === 'booking-product-1', 'source row was not normalized')
})

Deno.test('does not invent a line id from SKU or item type', () => {
  const lines = reservationLinesFrom({ lines: [{ sku: 'SKU-1', item_type_id: 'type-1' }] })
  assert(lines.length === 0, 'line without WMS line id must be rejected')
})

Deno.test('preserves duplicate source rows so callers can reject ambiguity', () => {
  const lines = reservationLinesFrom({
    reservation_lines: [
      { reservation_line_id: 'line-1', source_booking_product_id: 'bp-1' },
      { reservation_line_id: 'line-2', source_booking_product_id: 'bp-1' },
    ],
  })
  assert(lines.length === 2, 'ambiguous WMS rows must not be silently deduplicated')
})

import {
  isSameOperationReplay,
  mapScannerWmsStatus,
  wmsItemIdFrom,
  wmsOperationIdFrom,
  wmsReservationLineIdFrom,
} from './scanner-wms-result.ts'

const assertEquals = (actual: unknown, expected: unknown) => {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('success=false can never be inferred as accepted from HTTP 200', () => {
  assertEquals(mapScannerWmsStatus(200, { success: false, packed_quantity: 1 }), 'rejected')
  assertEquals(mapScannerWmsStatus(200, { success: false, code: 'OVER_CAPACITY' }), 'over_capacity')
})

Deno.test('transient HTTP status wins over contradictory accepted body', () => {
  assertEquals(mapScannerWmsStatus(503, { success: true, status: 'accepted', packed_quantity: 1 }), 'unknown')
  assertEquals(mapScannerWmsStatus(429, { status: 'duplicate', replayed: true }), 'unknown')
})

Deno.test('only explicit or canonical successful responses become accepted', () => {
  assertEquals(mapScannerWmsStatus(200, { success: true }), 'accepted')
  assertEquals(mapScannerWmsStatus(201, { status: 'accepted' }), 'accepted')
  assertEquals(mapScannerWmsStatus(202, { status: 'accepted' }), 'rejected')
})

Deno.test('known terminal rejection statuses remain terminal', () => {
  assertEquals(mapScannerWmsStatus(404, {}), 'not_found')
  assertEquals(mapScannerWmsStatus(409, { code: 'WRONG_BOOKING' }), 'wrong_booking')
  assertEquals(mapScannerWmsStatus(422, { code: 'OVER_CAPACITY' }), 'over_capacity')
})

Deno.test('replay proof requires marker and exact echoed operation id', () => {
  const expected = 'operation-1'
  assertEquals(isSameOperationReplay({ replayed: true, operation_id: expected }, expected), true)
  assertEquals(isSameOperationReplay({ same_operation: true, operationId: expected }, expected), true)
  assertEquals(isSameOperationReplay({ already_committed: true, operation_id: 'operation-2' }, expected), false)
  assertEquals(isSameOperationReplay({ replayed: true }, expected), false)
  assertEquals(isSameOperationReplay({ operation_id: expected }, expected), false)
})

Deno.test('operation id can be read from a nested WMS envelope', () => {
  assertEquals(wmsOperationIdFrom({ data: { operation_id: 'nested-op' } }), 'nested-op')
})

Deno.test('exact target ids can be read only from explicit WMS fields', () => {
  assertEquals(wmsItemIdFrom({ data: { itemId: 'item-1' } }), 'item-1')
  assertEquals(wmsReservationLineIdFrom({ reservation_line_id: 'line-1' }), 'line-1')
  assertEquals(wmsItemIdFrom({ sku: 'item-1' }), null)
  assertEquals(wmsReservationLineIdFrom({ source_booking_product_id: 'line-1' }), null)
})

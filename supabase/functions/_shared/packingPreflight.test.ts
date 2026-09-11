import {
  classifyPackingPreflightRow,
  collectPackingPackageHeaderIds,
  isPackingPreflightTarget,
  type PackingPreflightWmsMatch,
} from './packingPreflight.ts'

const assertEquals = (actual: unknown, expected: unknown) => {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const match = (id: string, sku: string, matchedBy = 'sku'): PackingPreflightWmsMatch => ({
  id,
  sku,
  name: sku,
  matchedBy,
})

Deno.test('stale id with one SKU match is repairable and never blocks packing', () => {
  const verdict = classifyPackingPreflightRow({
    inventoryItemTypeId: 'old-id',
    sku: 'MB-LEG',
    byItemTypeId: [],
    bySku: [match('canonical-id', 'MB-LEG')],
    byName: [],
  })
  assertEquals(verdict.status, 'WARNING')
  assertEquals(verdict.resolvedItemTypeId, 'canonical-id')
})

Deno.test('missing legacy identity is a warning, not a false physical blocker', () => {
  const verdict = classifyPackingPreflightRow({
    inventoryItemTypeId: null,
    sku: null,
    byItemTypeId: [],
    bySku: [],
    byName: [],
  })
  assertEquals(verdict.status, 'WARNING')
})

Deno.test('ambiguous SKU remains blocked', () => {
  const verdict = classifyPackingPreflightRow({
    inventoryItemTypeId: null,
    sku: 'DUPLICATE',
    byItemTypeId: [],
    bySku: [match('one', 'DUPLICATE'), match('two', 'DUPLICATE')],
    byName: [],
  })
  assertEquals(verdict.status, 'BLOCKED')
})

Deno.test('conflicting id and SKU remain blocked', () => {
  const verdict = classifyPackingPreflightRow({
    inventoryItemTypeId: 'one',
    sku: 'SKU-TWO',
    byItemTypeId: [match('one', 'SKU-ONE', 'item_type_id')],
    bySku: [match('two', 'SKU-TWO')],
    byName: [],
  })
  assertEquals(verdict.status, 'BLOCKED')
})

Deno.test('package headers, removed rows and zero quantity are not preflight targets', () => {
  const items = [
    { quantity_to_pack: 1, booking_products: { id: 'package', parent_product_id: null } },
    { quantity_to_pack: 2, booking_products: { id: 'part', parent_product_id: 'package' } },
  ]
  const headers = collectPackingPackageHeaderIds(items)
  assertEquals(isPackingPreflightTarget(items[0], headers), false)
  assertEquals(isPackingPreflightTarget(items[1], headers), true)
  assertEquals(isPackingPreflightTarget({ quantity_to_pack: 0 }, headers), false)
  assertEquals(isPackingPreflightTarget({ quantity_to_pack: 1, booking_products: { source_missing_since: '2026-09-11' } }, headers), false)
})

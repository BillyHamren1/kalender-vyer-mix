import { describe, it, expect } from 'vitest';
import { comparePackingSnapshot } from '@/lib/packing/packingIntegrity';

describe('packingIntegrity – paketrubriker', () => {
  const products = [
    { id: 'pkg', booking_id: 'b1', name: 'Multiflex 6x15', quantity: 1, parent_product_id: null },
    { id: 'c1', booking_id: 'b1', name: 'M Takbalk RÖD', quantity: 6, parent_product_id: 'pkg' },
    { id: 'c2', booking_id: 'b1', name: 'M Ben', quantity: 12, parent_product_id: 'pkg' },
  ];

  it('flaggar inte paketrubrik med egen packlisterad som avvikelse', () => {
    const result = comparePackingSnapshot(products, [
      { id: 'i0', booking_product_id: 'pkg', quantity_to_pack: 1 },
      { id: 'i1', booking_product_id: 'c1', quantity_to_pack: 6 },
      { id: 'i2', booking_product_id: 'c2', quantity_to_pack: 12 },
    ]);

    expect(result.blockingCount).toBe(0);
    expect(result.isExactMatch).toBe(true);
  });

  it('visar riktigt produktnamn när bokningsraden finns kvar men inte är packbar', () => {
    const result = comparePackingSnapshot(
      [{ id: 'x', booking_id: 'b1', name: 'Kranbil', quantity: 5, parent_product_id: null, source_missing_since: null }],
      [
        { id: 'i1', booking_product_id: 'x', quantity_to_pack: 5 },
        { id: 'i2', booking_product_id: 'ghost', quantity_to_pack: 2 },
      ],
    );

    const orphan = result.issues.find((issue) => issue.type === 'orphan_item');
    expect(orphan?.name).toBe('Artikel som inte längre finns i bokningen');
    expect(result.blockingCount).toBe(1);
  });

  it('tystar borttagna rader som hanteras av 14-dagarsflödet', () => {
    const result = comparePackingSnapshot(
      [{ id: 'x', booking_id: 'b1', name: 'F10', quantity: 2, parent_product_id: null, source_missing_since: '2026-08-19T10:00:00Z' }],
      [{ id: 'i1', booking_product_id: 'x', quantity_to_pack: 2 }],
    );

    expect(result.blockingCount).toBe(0);
  });
});

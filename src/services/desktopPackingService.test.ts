import { describe, expect, it } from 'vitest';
import { sortPackingItems } from './desktopPackingService';

describe('Operations WMS projection order', () => {
  it('keeps canonical WMS row order instead of alphabetizing it', () => {
    const rows = [
      { id: 'z', wms_line_id: 'line-z', manual_name: 'Tält' },
      { id: 'a', wms_line_id: 'line-a', manual_name: 'Golv' },
      { id: 'm', wms_line_id: 'line-m', manual_name: 'Transport', is_packable: false },
    ];

    expect(sortPackingItems(rows).map((row) => row.id)).toEqual(['z', 'a', 'm']);
  });

  it('keeps WMS-projected children directly below their parent', () => {
    const rows = [
      { id: 'parent-row', booking_products: { id: 'parent', sort_index: 1 } },
      { id: 'later-row', booking_products: { id: 'later', sort_index: 2 } },
      { id: 'child-row', booking_products: { id: 'child', parent_product_id: 'parent', sort_index: 3 } },
    ];

    expect(sortPackingItems(rows).map((row) => row.id)).toEqual([
      'parent-row',
      'child-row',
      'later-row',
    ]);
  });
});

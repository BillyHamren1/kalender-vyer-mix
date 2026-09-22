import { describe, expect, it } from 'vitest';
import { buildPackingHierarchy, readPackingRelationship } from './packingHierarchy';

describe('packingHierarchy', () => {
  it('visar paketnamn och håller paketmedlemmar skilda från tillbehör', () => {
    const items = [
      { id: 'member', wms_line_id: 'pkg-1::leg', notes: 'Paketmedlem i: Multiflex 6x15' },
      { id: 'accessory', wms_line_id: 'accessory-1', notes: 'Tillbehör till paket: Multiflex 6x15' },
      { id: 'standalone', wms_line_id: 'roof', notes: null },
    ];

    const hierarchy = buildPackingHierarchy(items);
    expect(hierarchy).toHaveLength(2);
    expect(hierarchy[0]).toMatchObject({
      kind: 'package',
      group: {
        packageName: 'Multiflex 6x15',
        members: [{ id: 'member' }],
        accessories: [{ id: 'accessory' }],
      },
    });
    expect(hierarchy[1]).toMatchObject({ kind: 'standalone', item: { id: 'standalone' } });
  });

  it('läser äldre Ingår i paket-rader som paketmedlemmar', () => {
    expect(readPackingRelationship({
      id: 'legacy',
      wms_line_id: 'pkg-2::part',
      notes: 'Ingår i paket: Apro 4x4',
    })).toEqual({ kind: 'package_member', packageName: 'Apro 4x4', parentKey: 'pkg-2' });
  });

  it('använder is_package_component för att skilja relationstyper', () => {
    const parent = { id: 'parent-row', booking_products: { id: 'parent', name: 'Tältpaket' } };
    const member = {
      id: 'member',
      booking_products: { id: 'member-product', parent_product_id: 'parent', is_package_component: true },
    };
    const accessory = {
      id: 'accessory',
      booking_products: { id: 'accessory-product', parent_product_id: 'parent', is_package_component: false },
    };
    const hierarchy = buildPackingHierarchy([parent, member, accessory]);
    expect(hierarchy[1]).toMatchObject({
      kind: 'package',
      group: { packageName: 'Tältpaket', members: [{ id: 'member' }], accessories: [{ id: 'accessory' }] },
    });
  });
});
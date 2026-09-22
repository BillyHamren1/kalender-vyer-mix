import { describe, expect, it } from 'vitest';
import {
  applyAccessoryRelationships,
  buildAccessoryIdentityKeys,
} from '../../supabase/functions/_shared/wmsPackingList.ts';

const rows = [
  {
    wmsLineId: 'g1::a',
    name: 'M Ben',
    quantity: 4,
    itemTypeId: 'it-ben',
    sku: 'M-BEN',
    packageName: 'Multiflex 6x15',
    relationshipKind: 'package_member' as const,
    productPackableDefault: true,
    bookingPackabilityOverride: null,
    warehousePackabilityOverride: null,
    isPackable: true,
    packabilitySource: 'product_default' as const,
    packabilityRevision: 1,
    packabilityUpdatedAt: null,
    packabilityUpdatedBy: null,
  },
  {
    wmsLineId: 'acc-1',
    name: 'M Takduk 6 meter - Vit',
    quantity: 5,
    itemTypeId: 'it-takduk',
    sku: 'M-TAKDUK-6M-VIT',
    packageName: 'Multiflex 6x15',
    relationshipKind: 'package_member' as const,
    productPackableDefault: true,
    bookingPackabilityOverride: null,
    warehousePackabilityOverride: null,
    isPackable: true,
    packabilitySource: 'product_default' as const,
    packabilityRevision: 1,
    packabilityUpdatedAt: null,
    packabilityUpdatedBy: null,
  },
];

describe('tillbehör vs paketmedlem', () => {
  it('märker booking-tillbehör som tillbehör och lämnar paketdelar orörda', () => {
    const keys = buildAccessoryIdentityKeys([
      { name: 'M Takduk 6 meter - Vit', sku: 'M-TAKDUK-6M-VIT', inventory_item_type_id: 'it-takduk', parent_product_id: 'p1', is_package_component: false },
      { name: 'M Ben', sku: 'M-BEN', inventory_item_type_id: 'it-ben', parent_product_id: 'p1', is_package_component: true },
    ]);
    const result = applyAccessoryRelationships(rows, keys);
    expect(result[0].relationshipKind).toBe('package_member');
    expect(result[1].relationshipKind).toBe('accessory');
  });

  it('ändrar ingenting när Booking saknar tillbehörsrader', () => {
    const keys = buildAccessoryIdentityKeys([]);
    expect(applyAccessoryRelationships(rows, keys)).toEqual(rows);
  });
});

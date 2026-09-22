import { describe, expect, it } from 'vitest';
import {
  applyAccessoryRelationships,
  buildAccessoryIdentityKeys,
} from '../../supabase/functions/_shared/wmsPackingList.ts';

const base = {
  quantity: 4,
  itemTypeId: null,
  productPackableDefault: true,
  bookingPackabilityOverride: null,
  warehousePackabilityOverride: null,
  isPackable: true,
  packabilitySource: 'product_default' as const,
  packabilityRevision: 1,
  packabilityUpdatedAt: null,
  packabilityUpdatedBy: null,
};

const rows = [
  {
    ...base,
    wmsLineId: 'g1::M-BEN',
    name: 'M Ben',
    sku: 'M-BEN',
    packageName: 'Multiflex 6x15',
    relationshipKind: 'package_member' as const,
  },
  {
    ...base,
    wmsLineId: 'acc-1',
    name: 'M Takduk 6 meter - Vit',
    sku: 'M-TAKDUK-6M-VIT',
    packageName: null,
    relationshipKind: 'standalone' as const,
  },
  {
    ...base,
    wmsLineId: 'free-1',
    name: 'Transport',
    sku: 'TRANSPORT',
    packageName: null,
    relationshipKind: 'standalone' as const,
  },
];

const bookingProducts = [
  { id: 'p1', name: 'Multiflex 6x15', sku: null, inventory_item_type_id: null, parent_product_id: null, is_package_component: false },
  { id: 'p2', name: 'M Takduk 6 meter - Vit', sku: 'M-TAKDUK-6M-VIT', inventory_item_type_id: 'it-takduk', parent_product_id: 'p1', is_package_component: false },
  { id: 'p3', name: 'M Ben', sku: 'M-BEN', inventory_item_type_id: 'it-ben', parent_product_id: 'p1', is_package_component: true },
];

describe('tillbehör vs paketmedlem', () => {
  it('kopplar fristående tillbehör till rätt paket', () => {
    const result = applyAccessoryRelationships(rows, buildAccessoryIdentityKeys(bookingProducts));
    expect(result[1].relationshipKind).toBe('accessory');
    expect(result[1].packageName).toBe('Multiflex 6x15');
  });

  it('lämnar paketkomponenter och fristående rader orörda', () => {
    const result = applyAccessoryRelationships(rows, buildAccessoryIdentityKeys(bookingProducts));
    expect(result[0].relationshipKind).toBe('package_member');
    expect(result[2].relationshipKind).toBe('standalone');
    expect(result[2].packageName).toBeNull();
  });

  it('ändrar ingenting när Booking saknar tillbehörsrader', () => {
    expect(applyAccessoryRelationships(rows, buildAccessoryIdentityKeys([]))).toEqual(rows);
  });
});

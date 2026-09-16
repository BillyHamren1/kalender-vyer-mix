import { describe, expect, it } from 'vitest';
import {
  buildPackabilityMutationItems,
  normalizeWmsInventoryItemType,
} from '../wmsInventoryService';

describe('wmsInventoryService packability contract', () => {
  it('shows the canonical WMS packability value and revision', () => {
    expect(normalizeWmsInventoryItemType({
      id: 'type-1', sku: 'OB-1', name: 'OB kväll',
      is_packable_default: false, packability_revision: 3,
    })).toMatchObject({ id: 'type-1', name: 'OB kväll', isPackableDefault: false, revision: 3 });
});
  it('defaults legacy products to packable without guessing from their names', () => {
    expect(normalizeWmsInventoryItemType({ id: 'transport', name: 'Transport' }).isPackableDefault).toBe(true);
    expect(normalizeWmsInventoryItemType({ id: 'ob', name: 'OB' }).isPackableDefault).toBe(true);
  });

  it('accepts canonical mutation receipts with revision', () => {
    expect(normalizeWmsInventoryItemType({
      item_type_id: 'type-1', name_sv: 'Bord',
      is_packable_default: false, revision: 4,
    })).toMatchObject({ id: 'type-1', isPackableDefault: false, revision: 4 });
  });

  it('builds deduplicated, revision-safe bulk updates', () => {
    expect(buildPackabilityMutationItems([
      { id: 'type-1', revision: 2 }, { id: 'type-2', revision: 4 }, { id: 'type-1', revision: 2 },
    ], false)).toEqual([
      { id: 'type-1', is_packable_default: false, expected_revision: 2 },
      { id: 'type-2', is_packable_default: false, expected_revision: 4 },
    ]);
  });

  it('rejects empty edits', () => {
    expect(() => buildPackabilityMutationItems([], true)).toThrow('Välj minst en produkt.');
  });
});

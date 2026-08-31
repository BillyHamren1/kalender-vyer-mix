/**
 * Regressionstest: booking product reconciliation identity.
 *
 * Booking-ägda orderrader matchas på stabilt Booking-rad-id (sync_key),
 * inte på namn. Det garanterar att:
 *  - flera rader med samma namn bevaras,
 *  - multipliciteten bevaras mellan synkar,
 *  - Planning-genererade paketkomponenter aldrig förväxlas med Booking-rader,
 *  - komponentexpansion är idempotent och aldrig expanderar historiska föräldrar,
 *  - explicit quantity: 0 bevaras.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSourceSyncKey,
  buildComponentSyncKey,
  planProductSyncIdentity,
  planPackageComponentExpansion,
  normalizeSyncQuantity,
  isPlanningGeneratedRow,
  BOOKING_SOURCE_SYNC_PREFIX,
  PLANNING_COMPONENT_SYNC_PREFIX,
} from '../../supabase/functions/_shared/productCompleteness';

describe('sync_key-identitet', () => {
  it('flera Booking-rader med samma namn får olika sync_key', () => {
    const a = buildSourceSyncKey({ id: 'row-1', name: 'Multiflex 6x6' }, 0);
    const b = buildSourceSyncKey({ id: 'row-2', name: 'Multiflex 6x6' }, 1);
    expect(a).toBe(`${BOOKING_SOURCE_SYNC_PREFIX}row-1`);
    expect(b).toBe(`${BOOKING_SOURCE_SYNC_PREFIX}row-2`);
    expect(a).not.toBe(b);
  });

  it('sync_key är stabil mellan körningar även utan externt id', () => {
    const p = { name: 'Bord 180' };
    expect(buildSourceSyncKey(p, 3)).toBe(buildSourceSyncKey({ ...p }, 3));
  });

  it('komponentnycklar är stabila och prefixade', () => {
    const parentKey = `${BOOKING_SOURCE_SYNC_PREFIX}row-1`;
    const k = buildComponentSyncKey(parentKey, { item_type_id: 'it-9', name: 'Ben' }, 0);
    expect(k).toBe(`${PLANNING_COMPONENT_SYNC_PREFIX}${parentKey}:it-9`);
    expect(buildComponentSyncKey(parentKey, { item_type_id: 'it-9', name: 'Ben' }, 5)).toBe(k);
  });
});

describe('planProductSyncIdentity', () => {
  it('bevarar multiplicitet för två rader med samma namn', () => {
    const external = [
      { id: 'row-1', name: 'Multiflex 6x6', quantity: 1 },
      { id: 'row-2', name: 'Multiflex 6x6', quantity: 1 },
    ];
    const existing = [
      { id: 'local-1', name: 'Multiflex 6x6', sync_key: `${BOOKING_SOURCE_SYNC_PREFIX}row-1` },
      { id: 'local-2', name: 'Multiflex 6x6', sync_key: `${BOOKING_SOURCE_SYNC_PREFIX}row-2` },
    ];
    const plan = planProductSyncIdentity(external, existing);
    expect(plan.matches.map((m) => m.existingId)).toEqual(['local-1', 'local-2']);
    expect(plan.unmatchedExisting).toEqual([]);
  });

  it('historiska rader utan sync_key matchas FIFO per namn (ingen överskrivning)', () => {
    const external = [
      { id: 'row-1', name: 'Bord', quantity: 1 },
      { id: 'row-2', name: 'Bord', quantity: 1 },
    ];
    const existing = [
      { id: 'local-a', name: 'Bord', sync_key: null },
      { id: 'local-b', name: 'Bord', sync_key: null },
    ];
    const plan = planProductSyncIdentity(external, existing);
    expect(plan.matches.map((m) => m.existingId)).toEqual(['local-a', 'local-b']);
  });

  it('ignorerar Planning-genererade paketkomponenter', () => {
    const external = [{ id: 'row-1', name: 'Paket A' }];
    const existing = [
      { id: 'local-1', name: 'Paket A', sync_key: `${BOOKING_SOURCE_SYNC_PREFIX}row-1` },
      { id: 'cmp-1', name: '  -- Ben', sync_key: `${PLANNING_COMPONENT_SYNC_PREFIX}x:1`, is_package_component: true },
      { id: 'cmp-2', name: '  -- Duk', is_package_component: true },
    ];
    const plan = planProductSyncIdentity(external, existing);
    expect(plan.ignoredPlanningRows.sort()).toEqual(['cmp-1', 'cmp-2']);
    expect(plan.matches[0].existingId).toBe('local-1');
    expect(plan.unmatchedExisting).toEqual([]);
  });

  it('isPlanningGeneratedRow skiljer Booking-rader från komponenter', () => {
    expect(isPlanningGeneratedRow({ sync_key: `${BOOKING_SOURCE_SYNC_PREFIX}row-1`, is_package_component: true })).toBe(false);
    expect(isPlanningGeneratedRow({ sync_key: `${PLANNING_COMPONENT_SYNC_PREFIX}a:b` })).toBe(true);
    expect(isPlanningGeneratedRow({ is_package_component: true })).toBe(true);
    expect(isPlanningGeneratedRow({ name: 'Bord' })).toBe(false);
  });
});

describe('planPackageComponentExpansion', () => {
  const parent = {
    id: 'local-1',
    sync_key: `${BOOKING_SOURCE_SYNC_PREFIX}row-1`,
    sort_index: 2,
    package_components: [
      { item_type_id: 'it-1', name: 'Ben', quantity: 4 },
      { item_type_id: 'it-2', name: 'Duk', quantity: 0 },
    ],
  };

  it('expanderar komponenter en gång och är idempotent', () => {
    const first = planPackageComponentExpansion([parent], []);
    expect(first).toHaveLength(2);
    const existing = first.map((r) => ({ sync_key: r.syncKey }));
    expect(planPackageComponentExpansion([parent], existing)).toHaveLength(0);
  });

  it('expanderar ALDRIG historiska föräldrar utan Booking-nyckel', () => {
    const historical = { ...parent, sync_key: null };
    expect(planPackageComponentExpansion([historical], [])).toEqual([]);
  });

  it('bevarar explicit quantity 0', () => {
    const rows = planPackageComponentExpansion([parent], []);
    expect(rows.find((r) => r.component.name === 'Duk')?.quantity).toBe(0);
    expect(rows.find((r) => r.component.name === 'Ben')?.quantity).toBe(4);
  });
});

describe('normalizeSyncQuantity', () => {
  it('bevarar 0 men gör saknad mängd till 1', () => {
    expect(normalizeSyncQuantity(0)).toBe(0);
    expect(normalizeSyncQuantity('0')).toBe(0);
    expect(normalizeSyncQuantity(null)).toBe(1);
    expect(normalizeSyncQuantity(undefined)).toBe(1);
    expect(normalizeSyncQuantity('')).toBe(1);
    expect(normalizeSyncQuantity('abc')).toBe(1);
    expect(normalizeSyncQuantity(3)).toBe(3);
  });
});

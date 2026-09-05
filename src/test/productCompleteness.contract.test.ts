/**
 * STEG 3D — contract: produktsync är fail-closed.
 *
 * 1) Ren logik i _shared/productCompleteness.ts
 * 2) Statisk verifiering att import-bookings inte har kvar oskyddade
 *    destruktiva produkt-/packing-operationer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readProductSourceCompleteness,
  canDeleteProducts,
  diffProducts,
  planPackingReconnect,
} from '../../supabase/functions/_shared/productCompleteness';

const importSrc = readFileSync(
  resolve(process.cwd(), 'supabase/functions/import-bookings/index.ts'),
  'utf8',
);

describe('readProductSourceCompleteness', () => {
  it('endast äkta boolean räknas', () => {
    expect(readProductSourceCompleteness({ products_complete: true })).toBe('complete');
    expect(readProductSourceCompleteness({ products_complete: false })).toBe('incomplete');
    expect(readProductSourceCompleteness({ products_complete: 'true' })).toBe('unknown');
    expect(readProductSourceCompleteness({ products_complete: 1 })).toBe('unknown');
    expect(readProductSourceCompleteness({})).toBe('unknown');
    expect(readProductSourceCompleteness(null)).toBe('unknown');
  });

  it('läser även meta.products_complete', () => {
    expect(readProductSourceCompleteness({ meta: { products_complete: true } })).toBe('complete');
  });

  it('delete kräver complete', () => {
    expect(canDeleteProducts('complete')).toBe(true);
    expect(canDeleteProducts('incomplete')).toBe(false);
    expect(canDeleteProducts('unknown')).toBe(false);
  });
});

describe('diffProducts fail-closed', () => {
  const local = [
    { id: 'a', name: 'Tält', quantity: 1, unit_price: 100 },
    { id: 'b', name: 'Bord', quantity: 2, unit_price: 50 },
  ];

  it('unknown → removals blockeras men add/update kvarstår', () => {
    const res = diffProducts(local, [{ name: 'Tält', quantity: 1, unit_price: 200 }], 'unknown');
    expect(res.deleteAllowed).toBe(false);
    expect(res.removed).toEqual([]);
    expect(res.blockedRemovals).toContain('Bord');
    expect(res.updated.length).toBe(1);
    expect(res.changed).toBe(true);
  });

  it('complete → removals tillåts', () => {
    const res = diffProducts(local, [{ name: 'Tält', quantity: 1, unit_price: 100 }], 'complete');
    expect(res.deleteAllowed).toBe(true);
    expect(res.removed).toContain('Bord');
    expect(res.blockedRemovals).toEqual([]);
  });

  it('tom extern lista raderar aldrig, ens vid complete', () => {
    const res = diffProducts(local, [], 'complete');
    expect(res.changed).toBe(false);
    expect(res.removed).toEqual([]);
  });
});

describe('planPackingReconnect', () => {
  const old = [{ id: 'o1', name: 'Tält', quantity: 1 }, { id: 'o2', name: 'Bord', quantity: 1 }];
  const fresh = [{ id: 'n1', name: 'Tält', quantity: 1 }];
  const items = [
    { id: 'i1', booking_product_id: 'o1' },
    { id: 'i2', booking_product_id: 'o2' },
    { id: 'i3', booking_product_id: null },
  ];

  it('unknown → inga deletes, bara remap', () => {
    const plan = planPackingReconnect(items, old, fresh, 'unknown');
    expect(plan.deletes).toEqual([]);
    expect(plan.blockedDeletes).toEqual(['i2']);
    expect(plan.updates).toEqual([{ itemId: 'i1', newProductId: 'n1' }]);
    expect(plan.untouched).toEqual(['i3']);
  });

  it('complete → orphans får raderas', () => {
    const plan = planPackingReconnect(items, old, fresh, 'complete');
    expect(plan.deletes).toEqual(['i2']);
    expect(plan.blockedDeletes).toEqual([]);
  });
});



describe('import-bookings destructive paths are gated', () => {
  it('läser completeness från extern bokning', () => {
    expect(importSrc).toContain('readProductSourceCompleteness(externalBooking)');
    expect(importSrc).toContain('const productDeleteAllowed = canDeleteProducts(productCompleteness)');
  });

  it('merge-delete av booking_products är gated + tenant-filtrerad', () => {
    expect(importSrc).toContain('externalProductCount > 0 && productDeleteAllowed');
    // STEG 3I: merge-delete går via guardedDeleteByIds med explicit ID-lista
    // och tenant-filter (booking_id + organization_id) i filters.
    expect(importSrc).toMatch(
      /guardedDeleteByIds\(supabase, \{\s*table: 'booking_products',\s*ids: idsToDelete,[\s\S]{0,300}organization_id: organizationId/,
    );
  });

  it('product recovery (clear + reimport) blockeras vid incomplete/unknown', () => {
    expect(importSrc).toMatch(/if \(!productDeleteAllowed\) \{[\s\S]{0,400}Product Recovery/);
  });

  it('varje delete på booking_products/packing_list_items ligger bakom en completeness-gate', () => {
    const lines = importSrc.split('\n');
    const unguarded: string[] = [];
    lines.forEach((line, i) => {
      if (!/from\('(booking_products|packing_list_items)'\)[\s\S]{0,80}\.delete\(\)/.test(line)) return;
      const window = lines.slice(Math.max(0, i - 60), i + 3).join('\n');
      const gated = /deleteAllowed|productDeleteAllowed|canDeleteProducts/.test(window);
      if (!gated) unguarded.push(line.trim());
    });
    expect(unguarded).toEqual([]);
  });

});

describe('planPackingReconnect — unique (packing_id, booking_product_id)', () => {
  it('reserverar varje nytt produkt-id till exakt en packrad', () => {
    const plan = planPackingReconnect(
      [
        { id: 'i1', booking_product_id: 'old-1' },
        { id: 'i2', booking_product_id: 'old-2' },
      ],
      [
        { id: 'old-1', name: 'Bord 120' },
        { id: 'old-2', name: 'Bord 120' },
      ],
      [{ id: 'new-1', name: 'Bord 120' }],
      'complete',
    );
    expect(plan.updates).toEqual([{ itemId: 'i1', newProductId: 'new-1' }]);
    expect(plan.untouched).toContain('i2');
    expect(plan.deletes).toHaveLength(0);
  });

  it('skriver inte om rader som redan pekar rätt och krockar inte med dem', () => {
    const plan = planPackingReconnect(
      [
        { id: 'i1', booking_product_id: 'new-1' },
        { id: 'i2', booking_product_id: 'old-2' },
      ],
      [
        { id: 'new-1', name: 'Stol' },
        { id: 'old-2', name: 'Stol' },
      ],
      [{ id: 'new-1', name: 'Stol' }],
      'complete',
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.untouched).toContain('i2');
  });
});

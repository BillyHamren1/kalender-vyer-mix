import { describe, it, expect } from 'vitest';
import {
  isWmsProjectionRow,
  withoutWmsProjectionRows,
  isSalesOwnedPackingItem,
  planProductDeletion,
} from '../../supabase/functions/_shared/productCompleteness';
import { applyOperatorRebuildAuthorization, type ProductSyncScope } from '../../supabase/functions/_shared/productSyncScope';
import { readFileSync } from 'node:fs';

const blocked: ProductSyncScope = { productsAllowed: false, reason: 'wms_products_not_accepted', code: 'export_wms_version_mismatch', restrictedBy: ['canonical'] };

describe('Sales-importen äger aldrig WMS-projektionens rader', () => {
  it('wms:-rader filtreras bort, Sales- och legacyrader behålls', () => {
    const rows = [{ id: 'a', sync_key: 'wms:1' }, { id: 'b', sync_key: 'src:x' }, { id: 'c', sync_key: null }];
    expect(isWmsProjectionRow(rows[0])).toBe(true);
    expect(withoutWmsProjectionRows(rows).map((r) => r.id)).toEqual(['b', 'c']);
  });
  it('raderingsplanen planerar aldrig WMS-rader när de filtrerats bort före planen', () => {
    const old = withoutWmsProjectionRows([{ id: 'w1', sync_key: 'wms:1' }, { id: 's1', sync_key: 'src:1' }]);
    expect(planProductDeletion(old, new Set()).sourceRowIds).toEqual(['s1']);
  });
  it('olänkade och WMS-länkade packrader räknas inte som Sales-ägda', () => {
    const wms = new Set(['w1']);
    expect(isSalesOwnedPackingItem({ booking_product_id: null }, wms)).toBe(false);
    expect(isSalesOwnedPackingItem({ booking_product_id: 'w1' }, wms)).toBe(false);
    expect(isSalesOwnedPackingItem({ booking_product_id: 's1' }, wms)).toBe(true);
  });
});

describe('Riktad operatörsreparation', () => {
  it('utan auktorisation förblir produkterna stoppade', () => {
    expect(applyOperatorRebuildAuthorization(blocked, null).productsAllowed).toBe(false);
  });
  it('med auktorisation tillåts produkter med spårbar orsak', () => {
    const s = applyOperatorRebuildAuthorization(blocked, { id: 'auth-1' });
    expect(s.productsAllowed).toBe(true);
    expect(s.reason).toBe('operator_rebuild_authorization');
    expect(s.code).toBe('operator_rebuild:auth-1');
  });
  it('importen slår upp auktorisation på exakt org + bokning + revision och skriver inget WMS-kvitto', () => {
    const src = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
    const i = src.indexOf("rpc('product_rebuild_authorization'");
    expect(i).toBeGreaterThan(0);
    const call = src.slice(i, i + 220);
    expect(call).toContain('p_organization_id: organizationId');
    expect(call).toContain('p_booking_id: String(bookingId)');
    expect(call).toContain('p_source_updated_at: rev');
    expect(src).not.toMatch(/operator_rebuild[\s\S]{0,400}booking_delivery_scope_receipts/);
  });
  it('Sales-importens packsynk och produktläsning filtrerar WMS-rader', () => {
    const src = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
    expect(src).toContain('oldProducts = oldProductsData ? withoutWmsProjectionRows(');
    expect(src).toContain('const existingItems = salesOwned(existingItemsRaw)');
    expect(src).toContain('const remaining = salesOwned(remainingRaw)');
  });
});

describe('Avstämningsverktyget rör aldrig WMS-projektionens rader', () => {
  it('hoppar över wms:-rader innan jämförelse och radering', () => {
    const src = readFileSync('supabase/functions/sync-reconciliation/index.ts', 'utf8');
    const loop = src.indexOf('for (const p of (localProducts || []))');
    expect(loop).toBeGreaterThan(0);
    expect(src.slice(loop, loop + 300)).toContain('if (isWmsProjectionRow(p)) continue;');
  });
});

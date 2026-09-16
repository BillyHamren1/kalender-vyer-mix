import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computePackingProgress, deriveStatusFromProgress } from '@/lib/packing/progress';

const item = (id: string, wanted: number, packed: number, isPackable?: boolean) => ({
  id,
  excluded: false,
  is_packable: isPackable,
  quantity_to_pack: wanted,
  quantity_packed: packed,
  booking_products: { id, parent_product_id: null },
});

describe('Scanner effective packability', () => {
  it('excludes non-packable lines from progress, missing and completion', () => {
    const rows = [
      item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, 3, true),
      item('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 50, 0, false),
    ];
    expect(computePackingProgress(rows)).toMatchObject({ total: 3, verified: 3, percentage: 100 });
    expect(deriveStatusFromProgress(rows)).toBe('packed');
  });

  it('keeps missing legacy projection fields backward-compatible as packable', () => {
    expect(computePackingProgress([item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 1)]))
      .toMatchObject({ total: 2, verified: 1, percentage: 50 });
  });

  it('lets authoritative WMS packability override the legacy excluded fallback', () => {
    const row = {
      ...item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 1, true),
      excluded: true,
    };
    expect(computePackingProgress([row]))
      .toMatchObject({ total: 2, verified: 1, percentage: 50 });
  });

  it('blocks item-targeted replay before WMS fetch, including offline queue recovery', () => {
    const gateway = readFileSync('supabase/functions/scanner-operation-v2/index.ts', 'utf8');
    const scopeStart = gateway.indexOf('async function assertPlanningScope');
    const scopeEnd = gateway.indexOf('const transientWmsStatus');
    const scope = gateway.slice(scopeStart, scopeEnd);
    const requestFlow = gateway.slice(gateway.indexOf('const auth = await authenticateScanner'));
    expect(scope).toMatch(/\.from\('packing_list_items'\)[\s\S]*is_packable/);
    expect(scope).toMatch(/item\.is_packable === false/);
    expect(scope).toMatch(/code: 'item_not_packable'/);
    expect(requestFlow.indexOf('await assertPlanningScope')).toBeLessThan(requestFlow.indexOf('await fetch(gatewayUrl'));
  });

  it('sends canonical Booking and WMS line identities, never Planning row IDs, to WMS', () => {
    const gateway = readFileSync('supabase/functions/scanner-operation-v2/index.ts', 'utf8');
    const body = gateway.slice(gateway.indexOf('body: JSON.stringify({'), gateway.indexOf('wmsStatus = resp.status'));
    expect(body).toMatch(/booking_id: scope\.packing\.booking_id/);
    expect(body).toMatch(/reservation_line_id: scope\.projectedItem\?\.wms_line_id/);
    expect(body).not.toMatch(/item_id: command\.itemId/);
  });

  it('never derives packability from booking_products and refuses local queueing', () => {
    const processor = readFileSync('src/hooks/scanner/useScanProcessor.ts', 'utf8');
    const progress = readFileSync('src/lib/packing/progress.ts', 'utf8');
    expect(processor).toMatch(/scan_blocked_before_persist_item_not_packable/);
    expect(processor).toMatch(/matchingItem\?\.is_packable === false/);
    expect(progress).toMatch(/item\.is_packable \?\? item\.excluded !== true/);
    expect(processor).not.toMatch(/booking_products\?\.(?:is_packable|packability_source)/);
  });
});

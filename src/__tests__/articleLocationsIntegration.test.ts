import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() }, functions: { invoke: vi.fn() }, from: vi.fn() } }));
vi.mock('@/services/mobileApiService', () => ({ getToken: () => 'tok', clearAuth: vi.fn() }));

import { resolveCanonicalItemTypeId } from '@/services/desktopPackingService';
import { normalizeIdentifyResult } from '@/services/scannerService';
import { classifyFailure } from '@/services/articleLocationsService';

const ID = '22222222-2222-4222-8222-222222222222';
const read = (p: string) => readFileSync(p, 'utf8');

describe('Operations desktop canonical item type', () => {
  it('prefers wms_item_type_id, falls back only to booking inventory_item_type_id', () => {
    expect(resolveCanonicalItemTypeId({ wms_item_type_id: ID, booking_products: { inventory_item_type_id: null } })).toBe(ID);
    expect(resolveCanonicalItemTypeId({ wms_item_type_id: null, booking_products: { inventory_item_type_id: ID } })).toBe(ID);
  });
  it('manual/unlinked rows get no location link (no name/SKU guessing)', () => {
    expect(resolveCanonicalItemTypeId({ wms_item_type_id: null, booking_products: null, manual_name: 'Tält', wms_sku: 'T-1' } as any)).toBeNull();
    expect(resolveCanonicalItemTypeId({ wms_item_type_id: 'UNIFLEX' })).toBeNull();
  });
  it('desktop query selects wms_item_type_id', () => {
    expect(read('src/services/desktopPackingService.ts')).toMatch(/wms_line_id, wms_item_type_id, wms_sku/);
  });
});

describe('Time Scan identify keeps canonical ids', () => {
  it('reads item_type_id / instance_id from scan-status rawData', () => {
    const r = normalizeIdentifyResult({ found: true, name: 'X', rawData: { data: { item_type_id: ID, instance_id: '33333333-3333-4333-8333-333333333333' } } });
    expect(r.itemTypeId).toBe(ID);
    expect(r.instanceId).toBe('33333333-3333-4333-8333-333333333333');
  });
  it('never derives ids from name/SKU', () => {
    expect(normalizeIdentifyResult({ found: true, name: ID.slice(0, 8), sku: 'ABC' }).itemTypeId).toBeNull();
  });
  it('camera overlay and manual/hardware path both open the same read-only map', () => {
    for (const f of ['src/components/scanner/IdentifyScannerOverlay.tsx', 'src/pages/MobileScannerApp.tsx']) {
      const s = read(f);
      expect(s).toContain('<ArticleLocationDialog');
      expect(s).toContain('fetcher={fetchArticleLocationsScanner}');
      expect(s).toContain('mapOpenRef.current');
    }
  });
  it('map fetch does not use callScannerApi (cannot clear session) and map files never mutate', () => {
    const svc = read('src/services/articleLocationsService.ts');
    expect(svc).not.toMatch(/callScannerApi|clearAuth/);
    for (const f of ['src/components/warehouse-map/ArticleLocationDialog.tsx', 'src/hooks/useArticleLocations.ts', 'src/services/articleLocationsService.ts']) {
      expect(read(f)).not.toMatch(/scanner-command-api|pack_item|localStorage|\.insert\(|\.update\(|\.upsert\(/);
    }
  });
  it('maps 401 / 403 / wrong org distinctly', () => {
    expect(classifyFailure(401, {}).kind).toBe('unauthorized');
    expect(classifyFailure(403, { code: 'wms_forbidden' }).kind).toBe('permission');
    expect(classifyFailure(502, { code: 'organization_mismatch' }).kind).toBe('bad_response');
    expect(classifyFailure(503, { code: 'wms_unavailable' }).kind).toBe('unavailable');
  });
});

describe('scanner-api get_article_locations', () => {
  const api = read('supabase/functions/scanner-api/index.ts');
  it('is a read-only contract action', () => {
    const allow = api.split('const SCANNER_CONTRACT_READ_ACTIONS = new Set([')[1].split('])')[0];
    expect(allow).toContain("'get_article_locations'");
  });
  it('binds org and actor from session, never from body', () => {
    const block = api.split("case 'get_article_locations': {")[1].split("case 'identify_product'")[0];
    expect(block).toContain('organizationId: ORG_ID');
    expect(block).toContain('personnelId: auth.staffId');
    expect(block).not.toMatch(/params as any\)\?\.organizationId|params\.organizationId/);
    expect(block).toContain("PLANNING_WMS_HMAC_SECRET");
  });
  it('desktop endpoint uses auth.getUser + profiles organization', () => {
    const fn = read('supabase/functions/warehouse-article-locations/index.ts');
    expect(fn).toContain('auth.getUser(jwt)');
    expect(fn).toContain("from('profiles').select('organization_id");
    expect(fn).not.toMatch(/body\?\.organizationId/);
  });
});

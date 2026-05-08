import { describe, it, expect, vi } from 'vitest';

// Mock supabase client to avoid env requirements
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

import { parseScanResult } from '@/services/scannerService';
import { legacyTogglePackingItemDesktopLocalOnly } from '@/services/desktopPackingService';

describe('scannerService.parseScanResult', () => {
  it('classifies a bare UUID as serial (must be resolved by WMS, not as packing_id)', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    const r = parseScanResult(uuid);
    expect(r.type).toBe('serial');
    expect(r.unique).toBe(true);
    // Must NOT be auto-classified as packing_id — that would skip WMS resolution
    expect((r as any).packingId).toBeUndefined();
  });

  it('classifies an explicit packing/verify URL as packing_id', () => {
    const url = 'https://example.com/warehouse/packing/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/verify';
    const r = parseScanResult(url);
    expect(r.type).toBe('packing_id');
    expect(r.packingId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('treats short SKUs as repeatable product_sku', () => {
    const r = parseScanResult('ABC-123');
    expect(r.type).toBe('product_sku');
    expect(r.unique).toBe(false);
  });

  it('handles trailing whitespace from hardware scanners', () => {
    const r = parseScanResult('  11111111-2222-3333-4444-555555555555\n');
    expect(r.type).toBe('serial');
    expect(r.value).toBe('11111111-2222-3333-4444-555555555555');
  });
});

describe('Ambiguous bare-UUID resolution order (WMS-first before duplicate-409)', () => {
  it('keeps bare UUIDs as serial so scanner-api can disambiguate via WMS BEFORE returning duplicate (WMS_409) errors', () => {
    // The contract: a bare UUID MUST be sent to WMS verify_product (serial) so
    // ambiguous_scan_code resolution happens before any duplicate (WMS_409)
    // logic kicks in. Local parser must not short-circuit it as packing_id.
    const uuid = '99999999-aaaa-bbbb-cccc-dddddddddddd';
    const r = parseScanResult(uuid);
    expect(r.type).toBe('serial');
    expect((r as any).packingId).toBeUndefined();
  });
});

describe('Desktop manual toggle is WMS-first (local-only path is neutralised)', () => {
  it('legacy local-only desktop toggle MUST fail and never update quantity_packed', async () => {
    const res = await legacyTogglePackingItemDesktopLocalOnly(
      'item-123',
      false,
      2,
      'Desktop',
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/scanner-api|togglePackingItemManually|forbjuden|förbjuden/i);
  });
});

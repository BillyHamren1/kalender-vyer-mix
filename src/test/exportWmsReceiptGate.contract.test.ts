import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  evaluateExportWmsReceipt, combineScopeWithExportReceipt, mandateToScope,
} from '../../supabase/functions/_shared/productSyncScope';

const legacy = mandateToScope({ decision: 'allowed_legacy', allowed: true });
const exactFull = mandateToScope({ decision: 'allowed_exact_full', allowed: true });
const partial = mandateToScope({ decision: 'deferred_partial', allowed: false, code: 'lifecycle_conflict' });
const row = (extra: Record<string, unknown>) => ({ id: 'b1', source_updated_at: '2026-12-08T13:00:00Z', ...extra });

describe('WMS-kvitto i canonical export', () => {
  it('fälten saknas → bakåtkompatibelt (deploymentordning)', () => {
    const r = evaluateExportWmsReceipt(row({}));
    expect(r.decision).toBe('absent');
    expect(combineScopeWithExportReceipt(legacy, r).productsAllowed).toBe(true);
  });
  it('inventory_synced_version = canonical_sync_version → produkter tillåts', () => {
    expect(evaluateExportWmsReceipt(row({ inventory_synced_version: 7, canonical_sync_version: 7 })).decision).toBe('accepted');
    expect(evaluateExportWmsReceipt(row({ inventory_synced_version: '7', canonical_sync_version: 7 })).productsAllowed).toBe(true);
  });
  it('legacybokning i tidsluckan: kvitto släpar → endast schema/metadata', () => {
    const r = evaluateExportWmsReceipt(row({ inventory_synced_version: 6, canonical_sync_version: 7 }));
    expect(r.decision).toBe('version_mismatch');
    const s = combineScopeWithExportReceipt(legacy, r);
    expect(s.productsAllowed).toBe(false);
    expect(s.code).toBe('export_wms_version_mismatch');
  });
  it('fälten uttryckligen med null → kan inte verifieras → fail-closed', () => {
    expect(evaluateExportWmsReceipt(row({ inventory_synced_version: null, canonical_sync_version: 7 })).decision).toBe('unverifiable');
    expect(evaluateExportWmsReceipt(row({ inventory_synced_version: 7 })).decision).toBe('unverifiable');
  });
  it('updated_at jämförs inte (flyttar sig när Sales sparar kvittot)', () => {
    const r = evaluateExportWmsReceipt(row({ updated_at: '2026-12-08T13:05:00Z', inventory_synced_version: 7, canonical_sync_version: 7 }));
    expect(r.productsAllowed).toBe(true);
  });
  it('status felmarkerad trots lika versioner → fail-closed; not_required → tillåtet', () => {
    expect(evaluateExportWmsReceipt(row({ inventory_synced_version: 7, canonical_sync_version: 7, inventory_sync_status: 'failed' })).productsAllowed).toBe(false);
    expect(evaluateExportWmsReceipt(row({ inventory_synced_version: null, canonical_sync_version: 7, inventory_sync_status: 'not_required' })).productsAllowed).toBe(true);
  });
  it('fälten kan ligga i meta', () => {
    expect(evaluateExportWmsReceipt(row({ meta: { inventory_synced_version: 3, canonical_sync_version: 4 } })).decision).toBe('version_mismatch');
  });
  it('kvittot kan aldrig häva revisionsmandatet (partial för exakt revision)', () => {
    const ok = evaluateExportWmsReceipt(row({ inventory_synced_version: 7, canonical_sync_version: 7 }));
    expect(combineScopeWithExportReceipt(partial, ok).productsAllowed).toBe(false);
  });
  it('full repair: senare export med giltigt kvitto + mandat → produkter tillåts', () => {
    const before = combineScopeWithExportReceipt(legacy, evaluateExportWmsReceipt(row({ inventory_synced_version: 6, canonical_sync_version: 7 })));
    const after = combineScopeWithExportReceipt(exactFull, evaluateExportWmsReceipt(row({ inventory_synced_version: 7, canonical_sync_version: 7 })));
    expect(before.productsAllowed).toBe(false);
    expect(after.productsAllowed).toBe(true);
  });
});

describe('Import-wiring av exportkvitto', () => {
  const imp = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
  it('alla tre mandatprövningar skickar med export-raden', () => {
    expect(imp).toMatch(/productMandate\(\s*normalizedSingleBookingId,\s*canonicalRow\?\.source_updated_at[^)]*canonicalRow,\s*\)/);
    expect(imp).toMatch(/productMandate\(\s*externalBooking\.id,[^;]*externalBooking,\s*\)/);
    expect(imp).toMatch(/recheck = await productMandate\([^;]*externalData\.data/);
  });
  it('kvitto kombineras med revisionsmandatet (aldrig ersätter)', () => {
    expect(imp).toMatch(/combineScopeWithExportReceipt\(scope, receipt\)/);
    expect(imp).toMatch(/'product_write_mandate'/);
  });
});

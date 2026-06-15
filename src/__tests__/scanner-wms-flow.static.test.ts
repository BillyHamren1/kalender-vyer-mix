import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Desktop checklist uses scannerService for manual checkoff (WMS-first)', () => {
  const src = read('src/components/packing/DesktopChecklistView.tsx');

  it('imports togglePackingItemManually from scannerService', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*togglePackingItemManually[^}]*\}\s*from\s*['"]@\/services\/scannerService['"]/,
    );
  });

  it('does NOT import the legacy local-only desktop toggle', () => {
    expect(src).not.toMatch(/togglePackingItemDesktop\b(?!Local)/);
    expect(src).not.toMatch(/legacyTogglePackingItemDesktopLocalOnly/);
  });

  it('does NOT directly UPDATE packing_list_items.quantity_packed from the component', () => {
    // Local toggle bypassing WMS is forbidden in DesktopChecklistView.
    // The only allowed Supabase mutations here are "excluded" toggle and manual-row insert.
    const updateMatches = src.match(/\.from\(['"]packing_list_items['"]\)\s*[\s\S]{0,200}?\.update\(([^)]*)\)/g) || [];
    for (const m of updateMatches) {
      expect(m).not.toMatch(/quantity_packed/);
    }
  });
});

describe('Desktop fetch hydrates inventory_item_type_id for WMS preflight', () => {
  it('desktopPackingService.fetchPackingListItemsForDesktop selects inventory_item_type_id on booking_products', () => {
    const src = read('src/services/desktopPackingService.ts');
    expect(src).toMatch(/booking_products\([^)]*inventory_item_type_id[^)]*\)/);
  });
});

describe('scannerService static contract', () => {
  const src = read('src/services/scannerService.ts');

  it('parseScanResult only treats explicit /packing/<uuid>/verify URLs as packing_id', () => {
    // Confirm regex shape so a bare UUID can never match the packing-URL branch.
    expect(src).toMatch(/packing\\\/\(\[a-f0-9-\]\+\)\\\/verify/);
  });

  it('togglePackingItemManually goes through scanner-api toggle_item action (WMS-first)', () => {
    expect(src).toMatch(/callScannerApi\(['"]toggle_item['"]/);
  });

  it('verify_product is the WMS-first entrypoint for bare-UUID/serial scans', () => {
    expect(src).toMatch(/callScannerApi\(['"]verify_product['"]/);
  });
});

describe('packing snapshot integrity', () => {
  it('scanner-api get_packing_items is read-only and never self-heals packing_list_items', () => {
    const src = read('supabase/functions/scanner-api/index.ts');
    const start = src.indexOf("case 'get_packing_items'");
    const end = src.indexOf("case 'get_item_parcels'");
    const section = src.slice(start, end);

    expect(section).not.toMatch(/\.from\('packing_list_items'\)\.insert\(/);
    expect(section).not.toMatch(/\.from\('packing_list_items'\)\.delete\(/);
    expect(section).not.toMatch(/\.from\('packing_list_items'\)\.update\(\{ quantity_to_pack/);
    expect(section).toMatch(/PACKING_SNAPSHOT_MISMATCH/);
  });

  it('import-bookings freezes quantity_to_pack after packing left planning', () => {
    const src = read('supabase/functions/import-bookings/index.ts');
    expect(src).toMatch(/if \(packingStatus === 'planning'\)/);
    expect(src).toMatch(/Frozen quantity_to_pack/);
  });

  it('sync-booking-to-packing freezes quantity_to_pack after packing left planning', () => {
    const src = read('supabase/functions/sync-booking-to-packing/index.ts');
    expect(src).toMatch(/if \(packingStatus === 'planning'\)/);
    expect(src).toMatch(/Frozen quantity_to_pack/);
  });
});

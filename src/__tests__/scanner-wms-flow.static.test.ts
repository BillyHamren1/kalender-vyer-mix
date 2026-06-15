import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('DesktopChecklistView is read-only — no packing mutations', () => {
  // SÄKERHETSREGEL: Packningsändringar MÅSTE gå via scanner-api med aktiv
  // packing_work_session. Tills desktop får ett eget session-flöde får den
  // här vyn inte importera muterande funktioner eller röra packing_list_items
  // / packing_parcels direkt.
  const src = read('src/components/packing/DesktopChecklistView.tsx');

  it('does NOT import any mutating scanner-api action helpers', () => {
    expect(src).not.toMatch(/togglePackingItemManually/);
    expect(src).not.toMatch(/decrementPackingItem\b/);
    expect(src).not.toMatch(/createParcel\b/);
    expect(src).not.toMatch(/assignItemToParcel\b/);
    expect(src).not.toMatch(/signPacking\b/);
  });

  it('does NOT import the legacy desktop mutator helpers', () => {
    expect(src).not.toMatch(/togglePackingItemDesktop\b(?!Local)/);
    expect(src).not.toMatch(/legacyTogglePackingItemDesktopLocalOnly/);
    expect(src).not.toMatch(/decrementPackingItemDesktop/);
    expect(src).not.toMatch(/createParcelDesktop/);
    expect(src).not.toMatch(/assignItemToParcelDesktop/);
    expect(src).not.toMatch(/signPackingDesktop/);
  });

  it('does NOT perform any update/insert/delete against packing_list_items or packing_parcels', () => {
    const forbidden = [
      /\.from\(['"]packing_list_items['"]\)[\s\S]{0,200}?\.update\(/,
      /\.from\(['"]packing_list_items['"]\)[\s\S]{0,200}?\.insert\(/,
      /\.from\(['"]packing_list_items['"]\)[\s\S]{0,200}?\.delete\(/,
      /\.from\(['"]packing_parcels['"]\)[\s\S]{0,200}?\.update\(/,
      /\.from\(['"]packing_parcels['"]\)[\s\S]{0,200}?\.insert\(/,
      /\.from\(['"]packing_parcels['"]\)[\s\S]{0,200}?\.delete\(/,
    ];
    for (const re of forbidden) {
      expect(src).not.toMatch(re);
    }
  });
});

describe('desktopPackingService blocks legacy mutators', () => {
  const src = read('src/services/desktopPackingService.ts');
  const BLOCK_MSG = 'Packningsändringar måste gå via scanner-api med aktiv session.';

  it('contains the exact block message', () => {
    expect(src).toContain(BLOCK_MSG);
  });

  it('decrementPackingItemDesktop / createParcelDesktop / assignItemToParcelDesktop / signPackingDesktop are neutralized', () => {
    for (const fn of [
      'decrementPackingItemDesktop',
      'createParcelDesktop',
      'assignItemToParcelDesktop',
      'signPackingDesktop',
    ]) {
      // Each function definition exists but no longer touches supabase tables.
      const idx = src.indexOf(`export const ${fn}`);
      expect(idx).toBeGreaterThan(-1);
      const body = src.slice(idx, idx + 600);
      expect(body).not.toMatch(/await supabase\s*\.from\(/);
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
    expect(section).not.toMatch(/PACKING_SNAPSHOT_MISMATCH/);
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

describe('usePackingList — direkta DB-writes är neutraliserade', () => {
  const src = read('src/hooks/usePackingList.tsx');
  const BLOCK_MSG = 'Packningsändringar måste gå via skannerappen';

  it('innehåller spärrmeddelandet', () => {
    expect(src).toContain(BLOCK_MSG);
  });

  it('updatePackingListItem rör inte längre supabase', () => {
    const idx = src.indexOf('const updatePackingListItem');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 400);
    expect(body).not.toMatch(/supabase\s*\.from\(/);
    expect(body).toMatch(/throw new Error\(PACKING_DIRECT_WRITE_ERROR\)/);
  });

  it('markAllItemsPacked rör inte längre supabase', () => {
    const idx = src.indexOf('const markAllItemsPacked');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 400);
    expect(body).not.toMatch(/supabase\s*\.from\(/);
    expect(body).toMatch(/throw new Error\(PACKING_DIRECT_WRITE_ERROR\)/);
  });
});

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

describe('MobileScannerApp — manual = VerificationView i avbocknings-läge (ingen kamera, +/-)', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/pages/MobileScannerApp.tsx'), 'utf8');

  it('importerar inte ManualChecklistView i aktivt flöde', () => {
    expect(src).not.toMatch(/^import\s+\{\s*ManualChecklistView\s*\}/m);
  });

  it('renderar inte ManualChecklistView (ingen JSX-användning)', () => {
    expect(src).not.toMatch(/<ManualChecklistView\b/);
  });

  it('AppState innehåller "manual" igen (men routas till VerificationView)', () => {
    const match = src.match(/type AppState\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/['"]manual['"]/);
    expect(match![1]).toMatch(/['"]verifying['"]/);
  });

  it('handleSelectPacking sätter state=manual när mode=manual för out-flow', () => {
    const idx = src.indexOf('const handleSelectPacking');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 800);
    expect(body).toMatch(/mode\s*===\s*['"]manual['"]/);
    expect(body).toMatch(/setState\(['"]manual['"]\)/);
    expect(body).toMatch(/setState\(['"]verifying['"]\)/);
  });

  it('båda manual- och verifying-state renderas av VerificationView med initialMode', () => {
    expect(src).toMatch(/state\s*===\s*['"]verifying['"]\s*\|\|\s*state\s*===\s*['"]manual['"]/);
    expect(src).toMatch(/initialMode=\{state\s*===\s*['"]manual['"]\s*\?\s*['"]manual['"]\s*:\s*['"]verifying['"]\}/);
  });
});

describe('VerificationView — manual-läge döljer kamera och visar +/-', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/scanner/VerificationView.tsx'), 'utf8');

  it('accepterar initialMode-prop', () => {
    expect(src).toMatch(/initialMode\?\:\s*['"]verifying['"]\s*\|\s*['"]manual['"]/);
    expect(src).toMatch(/const isManualMode\s*=\s*initialMode\s*===\s*['"]manual['"]/);
  });

  it('kameran (QRScanner always-mounted block) gates på !isManualMode', () => {
    expect(src).toMatch(/!isManualMode\s*&&\s*\(\s*<div[^>]*>\s*<QRScanner/);
  });

  it('manual-läge registrerar INTE enqueueScan som scan-handler', () => {
    expect(src).toMatch(/if\s*\(isManualMode\)\s*\{[\s\S]*?registerScanHandler\(\(\)\s*=>\s*\{\}\)/);
  });

  it('renderar +/- knappar (handleManualIncrement/Decrement) i manual-läge', () => {
    expect(src).toMatch(/handleManualIncrement\(item\.id/);
    expect(src).toMatch(/handleManualDecrement\(item\.id\)/);
    expect(src).toMatch(/isManualMode\s*&&\s*!info\.isParent/);
  });
});

describe('useScanProcessor — handleManualIncrement / handleManualDecrement med session-vakt', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/hooks/scanner/useScanProcessor.ts'), 'utf8');

  it('exporterar handleManualIncrement och handleManualDecrement', () => {
    expect(src).toMatch(/handleManualIncrement,/);
    expect(src).toMatch(/handleManualDecrement,/);
  });

  it('båda har session-vakt före backend-anrop', () => {
    const incIdx = src.indexOf('const handleManualIncrement');
    const decIdx = src.indexOf('const handleManualDecrement');
    expect(incIdx).toBeGreaterThan(-1);
    expect(decIdx).toBeGreaterThan(-1);
    const incGuard = src.indexOf('PACKING_SESSION_REQUIRED', incIdx);
    const decGuard = src.indexOf('PACKING_SESSION_REQUIRED', decIdx);
    const incCall = src.indexOf('togglePackingItemManually(', incIdx);
    const decCall = src.indexOf('decrementPackingItem(', decIdx);
    expect(incGuard).toBeGreaterThan(incIdx);
    expect(incGuard).toBeLessThan(incCall);
    expect(decGuard).toBeGreaterThan(decIdx);
    expect(decGuard).toBeLessThan(decCall);
  });
});

describe('useScanProcessor.handleManualToggle — session-vakt', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/hooks/scanner/useScanProcessor.ts'), 'utf8');

  it('avbryter manuell avbockning utan aktiv session med tydligt felmeddelande', () => {
    expect(src).toMatch(/PACKING_SESSION_REQUIRED:\s*Ingen aktiv packningssession/);
    expect(src).toMatch(/Starta packningssession först/);
  });

  it('guarden ligger före anrop till togglePackingItemManually/decrementPackingItem', () => {
    const handlerIdx = src.indexOf('const handleManualToggle');
    const guardIdx = src.indexOf('PACKING_SESSION_REQUIRED', handlerIdx);
    const toggleIdx = src.indexOf('togglePackingItemManually(', handlerIdx);
    const decrementIdx = src.indexOf('decrementPackingItem(', handlerIdx);
    expect(guardIdx).toBeGreaterThan(handlerIdx);
    expect(guardIdx).toBeLessThan(toggleIdx);
    expect(guardIdx).toBeLessThan(decrementIdx);
  });
});

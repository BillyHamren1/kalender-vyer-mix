/**
 * SCANNER HARDENING — STEG 1B: BASELINE CONTRACT TESTS
 *
 * Dessa tester ändrar INTE beteende. De låser fast nuvarande (delvis felaktiga)
 * scannerflöden så att steg 2+ inte kan ändra dem oavsiktligt eller tyst.
 *
 * Kedjan som låses:
 *   physical scan → DataWedge/keyboard/RFID → ScannerService → ScanQueue
 *   → useScanProcessor → scanner-api → WMS → packing_list_items /
 *     packing_list_item_allocations → UI feedback
 *
 * Varje test är märkt med den brist (1–8) det dokumenterar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const scannerApi = read('supabase/functions/scanner-api/index.ts');
const scanProcessor = read('src/hooks/scanner/useScanProcessor.ts');
const optimistic = read('src/hooks/scanner/useOptimisticPacking.ts');
const scanQueue = read('src/services/scanner/ScanQueue.ts');
const scannerService = read('src/services/scanner/ScannerService.ts');
const mobileScannerApp = read('src/pages/MobileScannerApp.tsx');

/** Klipper ut en `case '<action>':`-block ur scanner-api. */
const apiCase = (action: string): string => {
  const start = scannerApi.indexOf(`case '${action}':`);
  expect(start, `case '${action}' saknas i scanner-api`).toBeGreaterThan(-1);
  const next = scannerApi.slice(start + 10).search(/\n {6}case '/);
  return next === -1 ? scannerApi.slice(start) : scannerApi.slice(start, start + 10 + next);
};

describe('SCANNER_TRANSACTION_V2 flag', () => {
  it('är OFF och aktiverar ingen ny funktionalitet', async () => {
    const mod = await import('@/config/scannerFlags');
    expect(mod.SCANNER_TRANSACTION_V2).toBe(false);
    expect(mod.isScannerTransactionV2Enabled()).toBe(false);
  });
});

describe('1. Scanneroperationer som skriver lokalt UTAN WMS', () => {
  it('decrement_item muterar packing_list_items utan checkin-scan/WMS', () => {
    const block = apiCase('decrement_item');
    expect(block).toContain("from('packing_list_items')");
    expect(block).toContain('quantity_packed: newQty');
    // BASELINE-BRIST: ingen WMS-verifiering alls i denna operation.
    expect(block).not.toContain('checkin-scan');
    expect(block).not.toMatch(/bundle|verify_product/i);
  });

  it('return_toggle_item / return_decrement_item / reset_return_item är lokala', () => {
    for (const action of ['return_toggle_item', 'return_decrement_item', 'reset_return_item']) {
      expect(apiCase(action), action).not.toContain('checkin-scan');
    }
  });
});

describe('2. Lokala +1/-1 i stället för authoritative server result', () => {
  it('toggle_item beräknar currentQty + 1 lokalt i servern', () => {
    expect(apiCase('toggle_item')).toMatch(/Math\.min\(currentQty \+ 1, quantityToPack\)/);
  });

  it('decrement_item beräknar currentPacked - 1 lokalt', () => {
    expect(apiCase('decrement_item')).toContain('currentPacked - 1');
  });

  it('useOptimisticPacking gör klientsidig +1/-1 i stället för att sätta serverns värde', () => {
    expect(optimistic).toContain("(item.quantity_packed || 0) + 1");
    expect(optimistic).toContain("Math.max(0, (item.quantity_packed || 0) - 1)");
    // applyOptimisticSet (authoritative) finns men används inte av scanflödet.
    expect(optimistic).toContain('applyOptimisticSet');
    expect(scanProcessor).not.toContain('applyOptimisticSet');
    expect(scanProcessor).toContain('onOptimisticIncrement');
    expect(scanProcessor).toContain('onOptimisticDecrement');
  });
});

describe('3. checkin-scan används för att ångra packning', () => {
  it('decrement_by_serial ångrar packning via WMS checkin-scan', () => {
    const block = apiCase('decrement_by_serial');
    expect(block).toContain('checkin-scan');
    expect(block).toContain('quantity_packed');
  });

  it('physical_return_scan använder samma checkin-scan-endpoint', () => {
    expect(apiCase('physical_return_scan')).toContain('checkin-scan');
  });
});

describe('4./5. WMS och lokal mutation är inte atomiska', () => {
  it('toggle_item: WMS accepteras FÖRE lokal skrivning (WMS kan lyckas, lokalt misslyckas)', () => {
    const block = apiCase('toggle_item');
    const wmsIdx = block.search(/WMS accepted/);
    const localIdx = block.lastIndexOf("from('packing_list_items').update");
    expect(wmsIdx).toBeGreaterThan(-1);
    expect(localIdx).toBeGreaterThan(wmsIdx);
    // Ingen transaktion/rollback/kompensation kring den lokala skrivningen.
    expect(block).not.toMatch(/rollback|begin;|compensat/i);
  });

  it('decrement_by_serial: WMS först, lokal spegling efteråt utan rollback', () => {
    const block = apiCase('decrement_by_serial');
    expect(block.indexOf('checkin-scan')).toBeLessThan(block.indexOf('quantity_packed'));
    expect(block).not.toMatch(/rollback|compensat/i);
  });

  it('lokal mutation kan lyckas utan WMS (decrement_item saknar WMS helt)', () => {
    expect(apiCase('decrement_item')).not.toContain('checkin-scan');
  });
});

describe('6. Persistent ScanQueue är inte kopplad till operation replay', () => {
  it('ScanQueue persisterar i localStorage men har ingen registrerad sync handler i appen', () => {
    expect(scanQueue).toContain('eventflow_scan_queue');
    expect(scanQueue).toContain('registerSyncHandler');
    // ScannerService lägger bara in scans i kön...
    expect(scannerService).toContain("enqueueScan(scan, 'received')");
    // ...men ingen app-kod registrerar handler eller startar auto-sync.
    const appFiles = [scanProcessor, mobileScannerApp, read('src/components/scanner/VerificationView.tsx')];
    for (const f of appFiles) {
      expect(f).not.toContain('registerSyncHandler');
      expect(f).not.toContain('startAutoSync');
      expect(f).not.toContain('processQueue');
    }
  });
});

describe('7. In-memory kö kan tappa operationer vid reload/crash', () => {
  it('useScanProcessor-kön är en ref av strängar utan persistens', () => {
    expect(scanProcessor).toContain('const queueRef = useRef<string[]>([])');
    expect(scanProcessor).not.toContain('localStorage');
    expect(scanProcessor).not.toContain('indexedDB');
  });
});

describe('8. Komplett ScanEvent reduceras till scan.value', () => {
  it('MobileScannerApp skickar endast scan.value vidare till processorn', () => {
    expect(mobileScannerApp).toContain('handleBarcodeScan(scan.value)');
    expect(mobileScannerApp).toContain('handler(scan.value)');
  });

  it('useScanProcessor.enqueueScan tar en sträng, inte ett ScanEvent', () => {
    expect(scanProcessor).toContain('const enqueueScan = useCallback((value: string)');
    expect(scanProcessor).not.toContain('ScanEvent');
  });
});

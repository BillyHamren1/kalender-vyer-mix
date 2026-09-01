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
  it('decrement_item blockeras innan den historiska lokala implementationen kan nås', () => {
    const guard = scannerApi.indexOf('if (LEGACY_LOCAL_ONLY_MUTATIONS.has(action))');
    expect(scannerApi).toContain("'decrement_item'");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(scannerApi.indexOf('switch (action)'));
    expect(scannerApi).toContain('LEGACY_MUTATION_REQUIRES_TRANSACTIONAL_WMS');
  });

  it('lokala returåtgärder ligger samtliga i fail-closed-spärren', () => {
    for (const action of ['return_toggle_item', 'return_decrement_item', 'reset_return_item']) {
      const setStart = scannerApi.indexOf('const LEGACY_LOCAL_ONLY_MUTATIONS');
      const setEnd = scannerApi.indexOf('])', setStart);
      expect(scannerApi.slice(setStart, setEnd), action).toContain(`'${action}'`);
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
    // Legacy optimistic helpers finns kvar för flag OFF, men V2 har en separat
    // authoritative setter och tar V2-grenen före legacy mutationerna.
    expect(optimistic).toContain('applyOptimisticSet');
    expect(scanProcessor).toContain('onAuthoritativeSet');
    expect(scanProcessor).toContain('enqueueAndProcessScanOperation');
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
  it('den osäkra raw-scan-kön finns endast som legacykod och matas inte längre', () => {
    expect(scanQueue).toContain('eventflow_scan_queue');
    expect(scanQueue).toContain('registerSyncHandler');
    expect(scannerService).not.toContain("enqueueScan(scan, 'received')");
    expect(scannerService).not.toContain("from './ScanQueue'");
    const appFiles = [scanProcessor, mobileScannerApp, read('src/components/scanner/VerificationView.tsx')];
    for (const f of appFiles) {
      expect(f).not.toContain('registerSyncHandler');
      expect(f).not.toContain('startAutoSync');
      expect(f).not.toContain('processQueue');
    }
  });
});

describe('7. Legacy dispatch-kö finns kvar men V2 har durable operation replay', () => {
  it('useScanProcessor kan bära full ScanEvent och lämnar V2-operationen till den persistenta kön', () => {
    expect(scanProcessor).toContain('const queueRef = useRef<ProcessorQueueEntry[]>([])');
    expect(scanProcessor).toContain('enqueueScanOperation');
    expect(scanProcessor).toContain('processPersistedScanOperation');
    expect(scanProcessor).toContain('resumeAndDrain');
  });
});

describe('8. Komplett ScanEvent bevaras i det muterande scannerflödet', () => {
  it('Verification/Return får full ScanEvent; home-identifikation får fortfarande använda value', () => {
    expect(mobileScannerApp).toContain('handleBarcodeScan(scan.value)');
    expect(mobileScannerApp).toContain('activeScanHandler.current = handler');
    expect(mobileScannerApp).not.toContain('handler(scan.value)');
  });

  it('useScanProcessor.enqueueScan accepterar full ScanEvent', () => {
    expect(scanProcessor).toContain('const enqueueScan = useCallback((input: string | ScanEvent)');
    expect(scanProcessor).toContain("const scanEvent: ScanEvent | null = typeof rawInput === 'string' ? null : rawInput");
  });
});

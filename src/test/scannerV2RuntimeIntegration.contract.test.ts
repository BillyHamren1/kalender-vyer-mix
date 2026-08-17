/**
 * Scanner V2 runtime wiring guards.
 * These tests prevent the hardened V2 components from becoming dead/parallel code again.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Scanner V2 runtime integration', () => {
  it('useScanProcessor routes V2 through durable operation queue before legacy scanner API', () => {
    const src = read('src/hooks/scanner/useScanProcessor.ts');
    const branch = src.indexOf('// === TRANSACTIONAL V2 RUNTIME ===');
    const enqueue = src.indexOf('enqueueAndProcessScanOperation({', branch);
    const legacy = src.indexOf('decrementBySerial(', branch);
    expect(branch).toBeGreaterThan(-1);
    expect(enqueue).toBeGreaterThan(branch);
    expect(legacy).toBeGreaterThan(enqueue);
    expect(src).toContain("operation: ScannerOperationKind");
    expect(src).toContain("onAuthoritativeSet?.(itemId, result.packedQuantity)");
  });

  it('physical V2 scans are durably persisted before entering the in-memory processor', () => {
    const src = read('src/hooks/scanner/useScanProcessor.ts');
    const persist = src.indexOf('const persisted = await enqueueScanOperation({');
    const processorPush = src.indexOf('persistedOperationId: persisted.operation_id', persist);
    expect(persist).toBeGreaterThan(-1);
    expect(processorPush).toBeGreaterThan(persist);
    expect(src).toContain('processPersistedScanOperation(queueEntry.persistedOperationId)');
    expect(src).toContain('queueSequence');
  });

  it('full ScanEvent reaches VerificationView runtime instead of being reduced to value', () => {
    const app = read('src/pages/MobileScannerApp.tsx');
    const view = read('src/components/scanner/VerificationView.tsx');
    expect(app).toContain('activeScanHandler.current = handler');
    expect(app).not.toContain('handler(scan.value)');
    expect(view).toContain('registerScanHandler?: (handler: (scan: ScanEvent) => void)');
  });

  it('transport ambiguity is retryable UNKNOWN, never terminal REJECTED', () => {
    const service = read('src/services/scannerOperationV2Service.ts');
    const runner = read('src/lib/scanner/operationQueueRunner.ts');
    expect(service).toContain("debugCode: 'NETWORK_OUTCOME_UNKNOWN'");
    expect(service).toContain("status: 'unknown'");
    expect(runner).toContain("return store.transition(op.operation_id, 'UNKNOWN'");
  });

  it('scanner-operation-v2 is configured for custom mobile-token auth', () => {
    const config = read('supabase/config.toml');
    expect(config).toMatch(/\[functions\.scanner-operation-v2\]\s+verify_jwt\s*=\s*false/);
  });

  it('V2 gateway uses shared mobile-session auth and tenant-scoped projection', () => {
    const gateway = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(gateway).toContain("authenticateStaffRequest(req)");
    expect(gateway).toContain("authResult.auth.mode !== 'mobile'");
    expect(gateway).toContain(".eq('packing_id', command.packingId)");
    expect(gateway).toContain(".eq('organization_id', auth.organizationId)");
    expect(gateway).not.toContain('checkin-scan');
  });

  it('runtime readiness uses verified hardware health, not listener presence', () => {
    const service = read('src/services/scanner/ScannerService.ts');
    expect(service).toContain('const hardwareHealth = getHardwareHealth()');
    expect(service).toContain('isBarcodeReady: hardwareHealth.barcodeScannerReady');
    expect(service).toContain('isRfidReady: hardwareHealth.rfidReaderReady');
    expect(service).not.toContain('isBarcodeReady: isDataWedgeActive() || isKeyboardListenerActive()');
  });

  it('RFID duplicate handling is action/context aware in V2 runtime', () => {
    const app = read('src/pages/MobileScannerApp.tsx');
    const processor = read('src/hooks/scanner/useScanProcessor.ts');
    const returns = read('src/components/scanner/ReturnView.tsx');
    expect(app).toContain('scan.isDuplicate && !isScannerTransactionV2Enabled()');
    expect(processor).toContain('RfidDedupeTracker');
    expect(processor).toContain('action: operation');
    expect(processor).toContain('rfidDedupeRef.current.reset()');
    expect(returns).toContain("action: 'RETURN_INSTANCE'");
  });

  it('15B sends commands through Planning and uses WMS only for read-only state verification', () => {
    const execute = read('scripts/scanner-e2e/execute.ts');
    const driver = read('scripts/scanner-e2e/driver.ts');
    expect(execute).toContain('const gatewayUrl = env.SCANNER_E2E_PLANNING_URL!');
    expect(execute).toContain('const wmsControlUrl = env.SCANNER_E2E_WMS_URL!');
    expect(driver).toContain('fetch(this.config.gatewayUrl');
    expect(driver).toContain('`${this.config.wmsControlUrl}?action=state');
  });
});

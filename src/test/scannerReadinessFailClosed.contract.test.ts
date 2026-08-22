import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('scanner readiness is fail closed', () => {
  it('uses custom mobile-session auth for the read-only preflight endpoint', () => {
    const config = read('supabase/config.toml');
    const preflight = read('supabase/functions/packing-preflight-check/index.ts');
    expect(config).toMatch(/\[functions\.packing-preflight-check\]\s+verify_jwt\s*=\s*false/);
    expect(preflight).toContain("authenticateStaffRequest(req)");
    expect(preflight).toContain("authResult.auth.mode !== 'mobile'");
    expect(preflight).toContain('verifyScannerReadiness({');
  });

  it('requires tenant, staff, active session, booking, reservation, item identity and WMS state', () => {
    const gate = read('supabase/functions/_shared/scanner-readiness.ts');
    for (const evidence of [
      "eq('organization_id', organizationId)",
      "session.staff_id !== staffId",
      "session.status !== 'active'",
      "String(bookingNumber).trim() !== canonicalBookingNumber",
      "String(reservationId).trim() !== canonicalBookingNumber",
      'WMS_IDENTITY_UNVERIFIED',
      'WMS_RESERVATION_UNVERIFIED',
      'SHORT_NOTICE_ACK_REQUIRED',
    ]) {
      expect(gate, evidence).toContain(evidence);
    }
    expect(gate).not.toMatch(/https:\/\/[^'"`]+supabase\.co/);
  });

  it('runs the same server gate before every WMS mutation, including returns', () => {
    const gateway = read('supabase/functions/scanner-operation-v2/index.ts');
    const readiness = gateway.indexOf('await assertPlanningScope(admin, auth, command');
    const mutation = gateway.indexOf('fetch(gatewayUrl');
    expect(readiness).toBeGreaterThan(-1);
    expect(mutation).toBeGreaterThan(readiness);
    expect(gateway).toContain("'RETURN_INSTANCE', 'RETURN_QUANTITY'");
    expect(gateway).toContain("Deno.env.get('WMS_READINESS_BASE_URL')");
  });

  it('blocks durable enqueue and every manual pack action until readiness passes', () => {
    const processor = read('src/hooks/scanner/useScanProcessor.ts');
    const block = processor.indexOf('blockMutationIfNotReady(scannedValue)');
    const persist = processor.indexOf('const persisted = await enqueueScanOperation({');
    expect(block).toBeGreaterThan(-1);
    expect(persist).toBeGreaterThan(block);
    expect(processor).toContain('blockMutationIfNotReady(`MANUAL:${itemId}`)');
    expect(processor).toContain('blockMutationIfNotReady(`MANUAL_PLUS:${itemId}`)');
    expect(processor).toContain('blockMutationIfNotReady(`MANUAL_MINUS:${itemId}`)');
    expect(processor).toContain('reservationId: optRef.current.reservationId ?? null');
  });

  it('auto-runs UI preflight and disables pack/return controls while blocked', () => {
    const panel = read('src/components/scanner/PackingPreflightPanel.tsx');
    const packing = read('src/components/scanner/VerificationView.tsx');
    const returns = read('src/components/scanner/ReturnView.tsx');
    expect(panel).toContain('autoRun = true');
    expect(panel).toContain('{ sessionId, reservationId }');
    expect(packing).toContain('const mutationReady = getReadinessBlockReason() === null');
    expect(packing).toContain('disabled={!mutationReady || info.packed >= info.total}');
    expect(returns).toContain('const mutationReady = readinessBlockReason() === null');
    expect(returns).toContain('packingSessionId: activeSession?.id ?? null');
    expect(returns).toContain('disabled={!mutationReady || !scanInput.trim()}');
  });

  it('legacy return mutations also require the verified active session', () => {
    const api = read('supabase/functions/scanner-api/index.ts');
    const service = read('src/services/scannerService.ts');
    for (const action of [
      'return_scan_sku',
      'physical_return_scan',
      'return_toggle_item',
      'return_decrement_item',
      'reset_return_item',
    ]) {
      expect(api).toContain(`'${action}'`);
    }
    expect(service).toContain('activeSessionId: activeSessionId || null');
  });
});

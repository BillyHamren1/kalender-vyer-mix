/**
 * SCANNER HARDENING – STEG 15B: kontrakt för E2E-gaten.
 * Låser fail-closed preflight, NOT_EXECUTED ≠ PASS och produktionsspärren.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { runPreflight, PROD_MARKERS } from '../../scripts/scanner-e2e/preflight';
import { E2EHarness, makeScanEvent } from '../../scripts/scanner-e2e/driver';
import {
  SCENARIOS,
  isGreen,
  notExecutedResults,
} from '../../scripts/scanner-e2e/scenarios';

const safeEnv = {
  SCANNER_E2E_SAFE_TEST_ENV: 'true',
  SCANNER_E2E_ENVIRONMENT: 'local',
  SCANNER_E2E_WMS_URL: 'http://localhost:54322/functions/v1/scanner-e2e-control',
  SCANNER_E2E_WMS_APPROVED_TEST_TARGET: 'true',
  SCANNER_E2E_PLANNING_URL: 'http://localhost:54321/functions/v1/scanner-operation-v2',
  SCANNER_E2E_ENABLE_V2_FOR_RUN: 'true',
  SCANNER_E2E_ALLOW_MUTATIONS: 'true',
  SCANNER_E2E_FIXTURE_ORG_ID: 'fixture-org-a',
  SCANNER_E2E_RUN_ID: 'scanner-e2e-abc123',
  SCANNER_E2E_AUTH_TOKEN: 'test-mobile-token',
  SCANNER_E2E_FIXTURES_JSON: '{"packingId":"fixture-packing","packingSessionId":"fixture-session"}',
};

afterEach(() => vi.unstubAllGlobals());

describe('STEG 15B – fail-closed preflight', () => {
  it('tom miljö aborteras med exit 10', () => {
    const r = runPreflight({});
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(10);
    expect(r.abortReason).toContain('SAFE TEST CONFIGURATION NOT PROVIDED');
  });

  it('godkänd testmiljö passerar', () => {
    expect(runPreflight(safeEnv).ok).toBe(true);
  });

  it.each([
    'SCANNER_E2E_SAFE_TEST_ENV',
    'SCANNER_E2E_ENVIRONMENT',
    'SCANNER_E2E_WMS_APPROVED_TEST_TARGET',
    'SCANNER_E2E_ENABLE_V2_FOR_RUN',
    'SCANNER_E2E_ALLOW_MUTATIONS',
    'SCANNER_E2E_FIXTURE_ORG_ID',
    'SCANNER_E2E_RUN_ID',
    'SCANNER_E2E_AUTH_TOKEN',
    'SCANNER_E2E_FIXTURES_JSON',
  ])('saknad %s blockerar körningen', (key) => {
    const env = { ...safeEnv } as Record<string, string>;
    delete env[key];
    expect(runPreflight(env).ok).toBe(false);
  });

  it('produktionsmarkör ger exit 20', () => {
    for (const marker of PROD_MARKERS) {
      const r = runPreflight({ ...safeEnv, SCANNER_E2E_WMS_URL: `https://${marker}/x` });
      expect(r.exitCode).toBe(20);
      expect(r.abortReason).toContain('PRODUCTION TARGET BLOCKED');
    }
  });

  it('icke fixture-org blockeras', () => {
    expect(runPreflight({ ...safeEnv, SCANNER_E2E_FIXTURE_ORG_ID: 'org-live-1' }).ok).toBe(false);
  });
});

describe('STEG 15B – scenario-register', () => {
  it('täcker spec-sektion 3–22', () => {
    const sections = new Set(SCENARIOS.map((s) => s.specSection));
    for (let i = 3; i <= 22; i += 1) expect(sections.has(i)).toBe(true);
  });

  it('NOT_EXECUTED räknas aldrig som PASS', () => {
    expect(isGreen(notExecutedResults('abort'))).toBe(false);
  });

  it('GREEN kräver PASS på alla obligatoriska scenarier', () => {
    const all = SCENARIOS.map((s) => ({ id: s.id, status: 'PASS' as const, reason: 'ok' }));
    expect(isGreen(all)).toBe(true);
    all[0].status = 'FAIL' as never;
    expect(isGreen(all)).toBe(false);
  });
});

describe('STEG 15B – exact target driver', () => {
  const harness = () => new E2EHarness({
    runId: 'scanner-e2e-driver',
    organizationId: 'fixture-org-a',
    gatewayUrl: 'http://localhost:54321/functions/v1/scanner-operation-v2',
    wmsControlUrl: 'http://localhost:54322/functions/v1/scanner-e2e-control',
    packingSessionId: 'session-1',
  });

  it('bevarar exakt reservation och reservationsrad genom gateway-payloaden', async () => {
    let gatewayCommand: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      gatewayCommand = body.command;
      return new Response(JSON.stringify({
        status: 'accepted',
        operationId: body.command.operationId,
        itemId: body.command.itemId,
        packedQuantity: 1,
        requiredQuantity: 2,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const h = harness();
    const queued = await h.scan({
      operation: 'pack_quantity',
      packingId: 'packing-1',
      itemId: 'item-1',
      reservationId: 'reservation-1',
      reservationLineId: 'line-1',
      quantityDelta: 1,
      deviceId: 'device-a',
      scanEvent: makeScanEvent({ value: 'SKU-1' }),
    });
    await h.drain();

    expect(queued.reservation_id).toBe('reservation-1');
    expect(queued.reservation_line_id).toBe('line-1');
    expect(gatewayCommand).toMatchObject({
      itemId: 'item-1',
      reservationId: 'reservation-1',
      reservationLineId: 'line-1',
      deviceId: 'device-a',
    });
  });

  it('failar stängt innan köning när exakt target saknas', async () => {
    await expect(harness().scan({
      operation: 'pack_quantity',
      packingId: 'packing-1',
      itemId: 'item-1',
      quantityDelta: 1,
      deviceId: 'device-a',
      scanEvent: makeScanEvent({ value: 'SKU-1' }),
    } as never)).rejects.toThrow('SCANNER_E2E_EXACT_TARGET_REQUIRED');
  });
});

/**
 * SCANNER HARDENING – STEG 8 contract tests: Planning becomes WMS-first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyAuthoritativeResult,
  emptyProjectionState,
  formatProgress,
  type ScannerProjectionState,
} from '@/lib/scanner/authoritativeProjection';
import { OPERATION_TO_COMMAND, commandForOperation } from '@/lib/scanner/commandTypes';
import { buildScannerCommand, newOperationId } from '@/services/scannerOperationV2Service';
import { SCANNER_TRANSACTION_V2 } from '@/config/scannerFlags';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const stateWith = (itemId: string, packed: number, required: number): ScannerProjectionState => ({
  items: { [itemId]: { itemId, packedQuantity: packed, requiredQuantity: required } },
  appliedOperationIds: [],
});

describe('STEG 8 – flag', () => {
  it('SCANNER_TRANSACTION_V2 är fortfarande OFF som default', () => {
    expect(SCANNER_TRANSACTION_V2).toBe(false);
  });
});

describe('STEG 8 – command mapping', () => {
  it('decrement_by_serial använder UNPACK_INSTANCE, inte fysisk return', () => {
    expect(commandForOperation('decrement_by_serial')).toBe('UNPACK_INSTANCE');
    expect(OPERATION_TO_COMMAND.decrement_by_serial).not.toBe('RETURN_INSTANCE');
  });

  it('physical_return_scan använder RETURN_INSTANCE och return_quantity RETURN_QUANTITY', () => {
    expect(commandForOperation('physical_return_scan')).toBe('RETURN_INSTANCE');
    expect(commandForOperation('return_quantity')).toBe('RETURN_QUANTITY');
  });

  it('legacy aliases mappar endast till canonical pack/unpack commands', () => {
    expect(commandForOperation('increment')).toBe('PACK_QUANTITY');
    expect(commandForOperation('decrement')).toBe('UNPACK_QUANTITY');
    expect(commandForOperation('decrement_item')).toBe('UNPACK_QUANTITY');
    expect(commandForOperation('toggle')).toBe('PACK_QUANTITY');
    expect(Object.values(OPERATION_TO_COMMAND)).not.toContain('RESET_ITEM' as any);
    expect(Object.values(OPERATION_TO_COMMAND)).not.toContain('VERIFY_PRODUCT' as any);
  });

  it('operation_id är alltid UUID-format även utan servergenererat id', () => {
    expect(newOperationId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('kommandot bär delta, aldrig en lokalt beräknad ny total', () => {
    const cmd = buildScannerCommand({
      operation: 'increment',
      packingId: 'p1',
      itemId: 'i1',
      reservationLineId: 'line-1',
      quantityDelta: 1,
    });
    expect(cmd.quantityDelta).toBe(1);
    expect(cmd.reservationLineId).toBe('line-1');
    expect((cmd as any).newQuantity).toBeUndefined();
    expect(cmd.operationId).toBeTruthy();
  });
});

describe('STEG 8 – authoritative projection', () => {
  it('WMS 0→1: Planning visar 1', () => {
    const next = applyAuthoritativeResult(stateWith('i1', 0, 10), {
      status: 'accepted', operationId: 'op1', itemId: 'i1', packedQuantity: 1, requiredQuantity: 10,
    });
    expect(formatProgress(next.items.i1)).toBe('1/10');
  });

  it('WMS authoritative 7 vinner över gammal lokal cache (6)', () => {
    const next = applyAuthoritativeResult(stateWith('i1', 6, 10), {
      status: 'accepted', operationId: 'op2', itemId: 'i1', packedQuantity: 7, requiredQuantity: 10,
    });
    expect(next.items.i1.packedQuantity).toBe(7);
    expect(formatProgress(next.items.i1)).toBe('7/10');
  });

  it('WMS auktoritativ 7 sätts även när lokal cache var 99', () => {
    const next = applyAuthoritativeResult(stateWith('i1', 99, 10), {
      status: 'accepted', operationId: 'op3', itemId: 'i1', packedQuantity: 7, requiredQuantity: 10,
    });
    expect(next.items.i1.packedQuantity).toBe(7);
  });

  it('rejected → lokal quantity ändras inte', () => {
    const before = stateWith('i1', 3, 10);
    const next = applyAuthoritativeResult(before, {
      status: 'rejected', operationId: 'op4', itemId: 'i1', packedQuantity: 9,
    });
    expect(next).toBe(before);
    expect(next.items.i1.packedQuantity).toBe(3);
  });

  it('wrong_booking → lokal state ändras inte', () => {
    const before = stateWith('i1', 3, 10);
    const next = applyAuthoritativeResult(before, {
      status: 'wrong_booking', operationId: 'op5', itemId: 'i1', packedQuantity: 4,
    });
    expect(next.items.i1.packedQuantity).toBe(3);
  });

  it('over_capacity → lokal state ändras inte', () => {
    const before = stateWith('i1', 10, 10);
    const next = applyAuthoritativeResult(before, {
      status: 'over_capacity', operationId: 'op6', itemId: 'i1', packedQuantity: 11,
    });
    expect(next.items.i1.packedQuantity).toBe(10);
  });

  it('not_found → lokal state ändras inte', () => {
    const before = stateWith('i1', 2, 10);
    expect(applyAuthoritativeResult(before, { status: 'not_found', operationId: 'op7', itemId: 'i1', packedQuantity: 5 })).toBe(before);
  });

  it('generic duplicate utan replay-bevis projiceras aldrig som success', () => {
    const before = stateWith('i1', 3, 10);
    const next = applyAuthoritativeResult(before, {
      status: 'duplicate', operationId: 'new-op', replayed: false, itemId: 'i1', packedQuantity: 4, requiredQuantity: 10,
    });
    expect(next).toBe(before);
  });

  it('retry med samma operationId ger ingen dubbel increment', () => {
    const result = { status: 'accepted' as const, operationId: 'op8', itemId: 'i1', packedQuantity: 4, requiredQuantity: 10 };
    const once = applyAuthoritativeResult(stateWith('i1', 3, 10), result);
    const twice = applyAuthoritativeResult(once, { ...result, status: 'duplicate' as const, replayed: true });
    expect(once.items.i1.packedQuantity).toBe(4);
    expect(twice.items.i1.packedQuantity).toBe(4);
  });

  it('svar utan packedQuantity gissar aldrig', () => {
    const before = stateWith('i1', 3, 10);
    expect(applyAuthoritativeResult(before, { status: 'accepted', operationId: 'op9', itemId: 'i1' })).toBe(before);
  });
});

describe('STEG 8 – V2-koden innehåller ingen lokal aritmetik', () => {
  const files = [
    'src/lib/scanner/authoritativeProjection.ts',
    'src/lib/scanner/commandTypes.ts',
    'src/services/scannerOperationV2Service.ts',
    'supabase/functions/scanner-operation-v2/index.ts',
  ];

  it('ingen currentQty +1 / -1-aritmetik i V2-filerna', () => {
    for (const f of files) {
      const src = read(f);
      expect(/current(Qty|Quantity)\s*[+-]\s*1/.test(src), f).toBe(false);
      expect(/quantity_packed\s*[+-]\s*1/.test(src), f).toBe(false);
    }
  });

  it('gatewayen anropar WMS före all lokal skrivning', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    const wmsIdx = src.indexOf('fetch(gatewayUrl');
    // Endast skrivningen (update) får ligga efter WMS; scope-läsningar sker före.
    const writeIdx = src.indexOf('.update(');
    expect(wmsIdx).toBeGreaterThan(0);
    expect(writeIdx).toBeGreaterThan(wmsIdx);
    expect(src).toContain("status === 'accepted'");
  });

  it('gatewayen verifierar och skickar exakt reservationsrad före WMS-mutation', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    const readinessIdx = src.indexOf('requireReservationLine: true');
    const linePayloadIdx = src.indexOf('reservation_line_id: command.reservationLineId');
    const wmsIdx = src.indexOf('fetch(gatewayUrl');
    expect(readinessIdx).toBeGreaterThan(-1);
    expect(wmsIdx).toBeGreaterThan(readinessIdx);
    expect(linePayloadIdx).toBeGreaterThan(wmsIdx);
  });


  it('gatewayen skriver endast WMS packed_quantity som projection', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src).toContain('patch.quantity_packed = packedQuantity');
    expect(src).toContain('patch.quantity_returned = returnedQuantity');
  });



  it('gatewayen autentiserar via shared staff-auth och tenant-scope:ar service-role projection', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src).toContain("authenticateStaffRequest(req)");
    expect(src).toContain("authResult.auth.mode !== 'mobile'");
    expect(src).toContain(".eq('packing_id', command.packingId)");
    expect(src).toContain(".eq('organization_id', auth.organizationId)");
    expect(src).not.toContain("const { token, command }");
  });

  it('generic WMS duplicate kräver explicit same-operation replay proof', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src).toContain('DUPLICATE_WITHOUT_REPLAY_PROOF');
    expect(src).toContain('isSameOperationReplay(wmsBody, command.operationId)');
    expect(src).toContain('WMS_OPERATION_ID_MISMATCH');
    expect(src).not.toContain("replayed: Boolean(wmsBody?.replayed || status === 'duplicate')");
  });

  it('WMS success=false och terminal status över 5xx tolkas fail-closed', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    const mapping = read('supabase/functions/_shared/scanner-wms-result.ts');
    expect(src).toContain('mapScannerWmsStatus(wmsStatus, wmsBody)');
    expect(mapping).toContain("body?.success === false");
    expect(mapping.indexOf('transientWmsStatus(httpStatus)')).toBeLessThan(mapping.indexOf("body?.success === false"));
  });

  it('WMS-framgång måste eka exakt operation, artikel och reservationsrad', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src).toContain('terminalSuccess && returnedOperationId !== command.operationId');
    expect(src).toContain("debugCode: 'WMS_OPERATION_ID_MISSING'");
    expect(src).toContain('terminalSuccess && returnedItemId !== command.itemId');
    expect(src).toContain("debugCode: 'WMS_ITEM_ID_MISMATCH'");
    expect(src).toContain('terminalSuccess && returnedReservationLineId !== command.reservationLineId');
    expect(src).toContain("debugCode: 'WMS_RESERVATION_LINE_ID_MISMATCH'");
    expect(src).not.toContain('const itemId = wmsBody?.item_id ?? command.itemId');
  });

  it('accepted utan authoritative state får aldrig bli grönt utan blir UNKNOWN', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src).toContain('AUTHORITATIVE_STATE_MISSING');
    expect(src).toContain('missingAuthoritativeState');
  });

  it('gatewayen har ingen hårdkodad WMS fallback och transportfel blir UNKNOWN', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src).toContain("Deno.env.get('WMS_COMMAND_GATEWAY_URL')");
    expect(src).toContain("status: 'unknown'");
    expect(src).toContain('WMS_OUTCOME_UNKNOWN');
    expect(src).not.toMatch(/https:\/\/[^'"]+\/functions\/v1\/scanner-command-gateway/);
  });

  it('V2 använder inte checkin-scan för unpack', () => {
    const src = read('supabase/functions/scanner-operation-v2/index.ts');
    expect(src.includes('checkin-scan')).toBe(false);
  });
});

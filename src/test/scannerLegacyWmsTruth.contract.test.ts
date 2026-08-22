import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isLegacyWmsCommit,
  legacyOutcomeMessage,
  type LegacyWmsResult,
} from '@/lib/scanner/legacyWmsOutcome';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const api = read('supabase/functions/scanner-api/index.ts');
const processor = read('src/hooks/scanner/useScanProcessor.ts');
const returns = read('src/components/scanner/ReturnView.tsx');
const client = read('src/services/scannerService.ts');
const orchestrator = read('src/services/scanner/ScannerService.ts');

describe('legacy WMS truth contract', () => {
  it('accepts success only with an explicit WMS commit and operation id', () => {
    expect(isLegacyWmsCommit({
      success: true,
      outcome: 'committed',
      authority: 'wms',
      operationId: 'op-1',
    })).toBe(true);

    const unsafe: LegacyWmsResult[] = [
      { success: true },
      { success: true, outcome: 'committed', authority: null, operationId: 'op-1' },
      { success: true, outcome: 'unknown', authority: 'wms', operationId: 'op-1' },
      { success: false, outcome: 'committed', authority: 'wms', operationId: 'op-1' },
    ];
    unsafe.forEach((result) => expect(isLegacyWmsCommit(result)).toBe(false));
  });

  it('renders transport ambiguity as UNKNOWN, never success', () => {
    const result: LegacyWmsResult = {
      success: false,
      outcome: 'unknown',
      authority: 'wms',
      operationId: 'op-lost-response',
      outcomeUnknown: true,
    };
    expect(isLegacyWmsCommit(result)).toBe(false);
    expect(legacyOutcomeMessage(result)).toMatch(/osäkert/i);
  });

  it('blocks every local-only legacy mutation before dispatch', () => {
    const setStart = api.indexOf('const LEGACY_LOCAL_ONLY_MUTATIONS');
    const setEnd = api.indexOf('])', setStart);
    const blocked = api.slice(setStart, setEnd);
    for (const action of [
      'decrement_item', 'add_unknown_product', 'return_scan_sku',
      'return_toggle_item', 'return_decrement_item', 'reset_return_item',
    ]) expect(blocked, action).toContain(`'${action}'`);

    const guard = api.indexOf('if (LEGACY_LOCAL_ONLY_MUTATIONS.has(action))');
    expect(guard).toBeGreaterThan(setEnd);
    expect(guard).toBeLessThan(api.indexOf('switch (action)'));
    expect(api.slice(guard, api.indexOf('switch (action)'))).toContain("), 409)");
  });

  it('requires operation id and forwards it as WMS idempotency metadata', () => {
    expect(api).toContain('OPERATION_ID_REQUIRED');
    expect(api.match(/'x-idempotency-key': operationId/g)).toHaveLength(4);
    expect(api.match(/operation_id: operationId/g)?.length).toBeGreaterThanOrEqual(4);
    expect(client).toContain('operationId: string = newOperationId()');
  });

  it('maps network/tappat svar to UNKNOWN with HTTP 503', () => {
    expect(api).toContain("outcome: 'unknown'");
    expect(api).toContain("'WMS_OUTCOME_UNKNOWN'");
    expect(api.match(/WMS_OUTCOME_UNKNOWN/g)?.length).toBeGreaterThanOrEqual(4);
    expect(api.match(/\), 503\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(api).toContain('networkError ? 503 : 409');
    expect(client).toContain('LEGACY_WMS_MUTATION_ACTIONS.has(action)');
    expect(client).toContain("err.outcome = wmsOutcomeUnknown ? 'unknown' : undefined");
    expect(client).toContain('err.outcomeUnknown = wmsOutcomeUnknown');
  });

  it('does not select a first local row when WMS commit maps ambiguously', () => {
    expect(api).toContain('AMBIGUOUS_LOCAL_PROJECTION_AFTER_WMS');
    expect(api).toContain('AMBIGUOUS_LOCAL_RETURN_AFTER_WMS');
    expect(api).not.toContain('const target = [...matched].sort');
  });

  it('marks failed local/parcel projections UNKNOWN after a WMS commit', () => {
    expect(api.match(/LOCAL_PROJECTION_WRITE_FAILED_AFTER_WMS/g)?.length)
      .toBeGreaterThanOrEqual(4);
    expect(api.match(/PARCEL_PROJECTION_WRITE_FAILED_AFTER_WMS/g)?.length)
      .toBeGreaterThanOrEqual(4);
    expect(api).toContain(".eq('id', (selectedItem as any).id).eq('organization_id', ORG_ID)");
  });

  it('legacy UI performs no optimistic quantity mutation', () => {
    expect(processor).not.toContain('onOptimisticIncrement(');
    expect(processor).not.toContain('onOptimisticDecrement(');
    expect(processor).not.toContain('Packad lokalt');
    expect(returns).not.toContain('Legacy optimistic path');
    expect(returns).toContain('isLegacyWmsCommit(res)');
  });

  it('raw localStorage scan queue is no longer fed by the scanner orchestrator', () => {
    expect(orchestrator).not.toContain("from './ScanQueue'");
    expect(orchestrator).not.toContain('enqueueScan(');
  });
});

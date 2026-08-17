/**
 * SCANNER HARDENING – STEG 14: kontrakt för READ-ONLY reconciliation.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  runReconciliation,
  assertReadOnly,
  isReconciliationReadOnly,
  RECONCILIATION_MODE,
  RECONCILIATION_REPAIR_ENABLED,
  ReconciliationRepairForbiddenError,
  type ReconciliationReason,
} from '@/lib/scanner/reconciliation';
import * as fx from './fixtures/wmsPlanningReconciliation.fixtures';

const reasons = (input: Parameters<typeof runReconciliation>[0]): ReconciliationReason[] =>
  runReconciliation(input).findings.map((f) => f.reason);

describe('STEG 14 – read-only guard', () => {
  it('är permanent read only', () => {
    expect(RECONCILIATION_MODE).toBe('read_only');
    expect(RECONCILIATION_REPAIR_ENABLED).toBe(false);
    expect(isReconciliationReadOnly()).toBe(true);
  });

  it('assertReadOnly kastar alltid', () => {
    expect(() => assertReadOnly('repair')).toThrow(ReconciliationRepairForbiddenError);
  });

  it('rapporten deklarerar read_only-läget', () => {
    expect(runReconciliation(fx.cleanFixture()).mode).toBe('read_only');
  });

  it('reconciliation-koden innehåller inga write-anrop', () => {
    const dir = path.resolve(__dirname, '../lib/scanner/reconciliation');
    const src = fs
      .readdirSync(dir)
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
      .join('\n');
    for (const forbidden of ['supabase', '.insert(', '.update(', '.delete(', '.upsert(', 'fetch(']) {
      expect(src.includes(forbidden)).toBe(false);
    }
  });
});

describe('STEG 14 – mismatch-detektorer', () => {
  it('ren värld ger noll findings', () => {
    const report = runReconciliation(fx.cleanFixture());
    expect(report.findings).toHaveLength(0);
  });

  it('1. quantity mismatch', () => {
    expect(reasons(fx.quantityMismatchFixture())).toContain('quantity_mismatch');
  });

  it('2. WMS-allokering utan Planning-projektion', () => {
    expect(reasons(fx.allocationWithoutProjectionFixture())).toContain(
      'wms_allocation_without_planning_projection',
    );
  });

  it('3. Planning packed utan WMS canonical state', () => {
    expect(reasons(fx.planningPackedWithoutWmsFixture())).toContain(
      'planning_packed_without_wms_state',
    );
  });

  it('4. instans allokerad till flera reservationsrader', () => {
    expect(reasons(fx.instanceDoubleAllocationFixture())).toContain(
      'instance_allocated_to_multiple_reservations',
    );
  });

  it('5. allokering på fel organisation', () => {
    expect(reasons(fx.wrongOrganizationFixture())).toContain('allocation_wrong_organization');
  });

  it('6. packed > required', () => {
    expect(reasons(fx.packedExceedsRequiredFixture())).toContain('packed_exceeds_required');
  });

  it('7. orphan allocation', () => {
    expect(reasons(fx.orphanAllocationFixture())).toContain('orphan_allocation');
  });

  it('8. committed operation utan canonical effekt', () => {
    expect(reasons(fx.committedWithoutEffectFixture())).toContain(
      'committed_operation_without_canonical_effect',
    );
  });

  it('9. Planning-local allokering utan WMS truth', () => {
    expect(reasons(fx.planningLocalAllocationFixture())).toContain(
      'planning_local_allocation_without_wms_truth',
    );
  });
});

describe('STEG 14 – outputformat', () => {
  it('varje finding har org, booking, item, states, severity och reason', () => {
    const f = runReconciliation(fx.quantityMismatchFixture()).findings[0];
    expect(f.organizationId).toBe('org-1');
    expect(f.bookingId).toBe('bk-1');
    expect(f.reservationLineId).toBe('line-1');
    expect(f.itemId).toBe('item-1');
    expect(f.wmsState).toContain('packed=3');
    expect(f.planningState).toContain('packed=1');
    expect(['critical', 'high', 'medium', 'low']).toContain(f.severity);
    expect(f.detail.length).toBeGreaterThan(0);
  });

  it('instans-findings bär itemInstanceId', () => {
    const f = runReconciliation(fx.instanceDoubleAllocationFixture()).findings.find(
      (x) => x.reason === 'instance_allocated_to_multiple_reservations',
    );
    expect(f?.itemInstanceId).toBe('inst-1');
  });

  it('counts täcker alla nio reasons', () => {
    const counts = runReconciliation(fx.cleanFixture()).counts;
    expect(Object.keys(counts)).toHaveLength(9);
  });
});

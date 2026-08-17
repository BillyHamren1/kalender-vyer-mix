/**
 * SCANNER HARDENING – STEG 14: publik READ-ONLY entrypoint.
 *
 * runReconciliation är en ren funktion: in = snapshots, ut = rapport.
 * Den skriver aldrig, reparerar aldrig och rör aldrig databasen.
 */

import { detectFindings } from './detect';
import { RECONCILIATION_MODE, isReconciliationReadOnly, assertReadOnly } from './guard';
import type {
  ReconciliationInput,
  ReconciliationReason,
  ReconciliationReport,
} from './types';

const ALL_REASONS: ReconciliationReason[] = [
  'quantity_mismatch',
  'wms_allocation_without_planning_projection',
  'planning_packed_without_wms_state',
  'instance_allocated_to_multiple_reservations',
  'allocation_wrong_organization',
  'packed_exceeds_required',
  'orphan_allocation',
  'committed_operation_without_canonical_effect',
  'planning_local_allocation_without_wms_truth',
];

export const runReconciliation = (
  input: ReconciliationInput,
  options?: { nowIso?: string },
): ReconciliationReport => {
  if (!isReconciliationReadOnly()) {
    // Fail closed: om någon försöker slå på repair-läge stoppas körningen.
    assertReadOnly('runReconciliation');
  }

  const findings = detectFindings(input);
  const counts = ALL_REASONS.reduce(
    (acc, reason) => {
      acc[reason] = findings.filter((f) => f.reason === reason).length;
      return acc;
    },
    {} as Record<ReconciliationReason, number>,
  );

  return {
    mode: RECONCILIATION_MODE,
    organizationId: input.organizationId,
    generatedAtIso: options?.nowIso ?? new Date().toISOString(),
    findings,
    counts,
  };
};

export * from './types';
export * from './guard';
export { detectFindings };

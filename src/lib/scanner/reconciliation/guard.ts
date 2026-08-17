/**
 * SCANNER HARDENING – STEG 14: hårt skydd mot att reconciliation glider
 * över till automatisk repair.
 *
 * Regler (låsta av wmsPlanningReconciliation.contract.test.ts):
 * - RECONCILIATION_MODE är permanent 'read_only'.
 * - RECONCILIATION_REPAIR_ENABLED är permanent false.
 * - Om repair någonsin byggs krävs SEPARAT implementation med egen
 *   dry-run + explicit approval — den får inte återanvända detta läge.
 */

export const RECONCILIATION_MODE = 'read_only' as const;
export const RECONCILIATION_REPAIR_ENABLED = false as const;

export class ReconciliationRepairForbiddenError extends Error {
  constructor(action: string) {
    super(
      `Reconciliation är READ ONLY. Åtgärden "${action}" är blockerad. ` +
        'Repair kräver separat explicit implementation med dry-run och approval.',
    );
    this.name = 'ReconciliationRepairForbiddenError';
  }
}

/** Anropas av alla eventuella framtida mutationsvägar. Kastar alltid. */
export const assertReadOnly = (action: string): never => {
  throw new ReconciliationRepairForbiddenError(action);
};

export const isReconciliationReadOnly = (): boolean =>
  RECONCILIATION_MODE === 'read_only' && RECONCILIATION_REPAIR_ENABLED === false;

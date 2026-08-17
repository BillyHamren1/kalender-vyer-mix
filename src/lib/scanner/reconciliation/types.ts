/**
 * SCANNER HARDENING – STEG 14: WMS ↔ PLANNING RECONCILIATION.
 *
 * READ ONLY. Denna modul får ALDRIG mutera data, anropa write-endpoints
 * eller schemaläggas som auto-repair. Se reconciliation/guard.ts.
 */

export type ReconciliationSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ReconciliationReason =
  | 'quantity_mismatch'
  | 'wms_allocation_without_planning_projection'
  | 'planning_packed_without_wms_state'
  | 'instance_allocated_to_multiple_reservations'
  | 'allocation_wrong_organization'
  | 'packed_exceeds_required'
  | 'orphan_allocation'
  | 'committed_operation_without_canonical_effect'
  | 'planning_local_allocation_without_wms_truth';

/** WMS canonical state för en reservationsrad (item på en bokning). */
export interface WmsItemState {
  organizationId: string;
  bookingId: string;
  reservationLineId: string;
  itemId: string;
  packedQuantity: number;
  requiredQuantity: number;
  revision?: number | null;
}

/** WMS canonical allokering av en fysisk instans. */
export interface WmsInstanceAllocation {
  organizationId: string;
  bookingId: string;
  reservationLineId: string;
  itemId: string;
  itemInstanceId: string;
  active: boolean;
}

/** Planning-sidans projicerade state (read model). */
export interface PlanningItemState {
  organizationId: string;
  bookingId: string;
  reservationLineId: string;
  itemId: string;
  packedQuantity: number;
  requiredQuantity: number;
  /** Instanser som Planning tror är allokerade lokalt. */
  allocatedInstanceIds?: string[];
}

/** Scanner-operation som klienten anser COMMITTED. */
export interface CommittedScannerOperation {
  operationId: string;
  organizationId: string;
  bookingId: string;
  reservationLineId: string;
  itemId: string;
  itemInstanceId?: string | null;
  /** Förväntad canonical effekt: packedQuantity efter operationen. */
  expectedPackedQuantity?: number | null;
}

export interface ReconciliationInput {
  /** Organisation som körningen är scopad till (multi-tenant guard). */
  organizationId: string;
  wmsItems: WmsItemState[];
  wmsAllocations: WmsInstanceAllocation[];
  planningItems: PlanningItemState[];
  committedOperations?: CommittedScannerOperation[];
}

export interface ReconciliationFinding {
  organizationId: string;
  bookingId: string | null;
  reservationLineId: string | null;
  itemId: string | null;
  itemInstanceId: string | null;
  wmsState: string;
  planningState: string;
  severity: ReconciliationSeverity;
  reason: ReconciliationReason;
  detail: string;
}

export interface ReconciliationReport {
  /** Alltid 'read_only'. Finns för att göra läget explicit i loggar/UI. */
  mode: 'read_only';
  organizationId: string;
  generatedAtIso: string;
  findings: ReconciliationFinding[];
  counts: Record<ReconciliationReason, number>;
}

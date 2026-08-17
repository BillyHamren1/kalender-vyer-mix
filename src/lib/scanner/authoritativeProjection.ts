/**
 * SCANNER HARDENING – STEG 8.
 *
 * Ren projektion av WMS auktoritativa svar → lokal read model.
 *
 * Regler (låsta av scannerWmsFirstV2.contract.test.ts):
 * - Ingen aritmetik: vi sätter ALLTID WMS packedQuantity rakt av.
 * - rejected / wrong_booking / over_capacity / not_found → state orört.
 * - Retry (samma operationId) får aldrig ge dubbel effekt.
 * - Saknar svaret packedQuantity lämnas raden orörd (ingen gissning).
 */

import type { ScannerCommandResult } from './commandTypes';

export interface ItemProjection {
  itemId: string;
  packedQuantity: number;
  requiredQuantity: number;
  returnedQuantity?: number;
  productName?: string | null;
}

export interface ScannerProjectionState {
  items: Record<string, ItemProjection>;
  /** operationIds som redan projicerats (idempotens vid retry). */
  appliedOperationIds: string[];
}

export const emptyProjectionState = (): ScannerProjectionState => ({
  items: {},
  appliedOperationIds: [],
});

export const applyAuthoritativeResult = (
  state: ScannerProjectionState,
  result: ScannerCommandResult,
): ScannerProjectionState => {
  const accepted = result.status === 'accepted' || result.status === 'duplicate';
  if (!accepted) return state;

  if (result.operationId && state.appliedOperationIds.includes(result.operationId)) {
    // Retry av redan projicerad operation → idempotent no-op.
    return state;
  }

  const itemId = result.itemId || null;
  const packed = result.packedQuantity;
  if (!itemId || typeof packed !== 'number' || !Number.isFinite(packed)) {
    return state;
  }

  const prev = state.items[itemId];
  const next: ItemProjection = {
    itemId,
    // WMS är sanning — ingen prev.packedQuantity + 1 här. Någonsin.
    packedQuantity: packed,
    requiredQuantity:
      typeof result.requiredQuantity === 'number'
        ? result.requiredQuantity
        : prev?.requiredQuantity ?? 0,
    returnedQuantity:
      typeof result.returnedQuantity === 'number'
        ? result.returnedQuantity
        : prev?.returnedQuantity,
    productName: result.productName ?? prev?.productName ?? null,
  };

  return {
    items: { ...state.items, [itemId]: next },
    appliedOperationIds: result.operationId
      ? [...state.appliedOperationIds, result.operationId]
      : state.appliedOperationIds,
  };
};

export const formatProgress = (p: ItemProjection | undefined): string =>
  p ? `${p.packedQuantity}/${p.requiredQuantity}` : '0/0';

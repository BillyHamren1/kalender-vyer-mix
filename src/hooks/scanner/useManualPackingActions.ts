/**
 * Shared packing actions hook.
 *
 * Both the manual checklist (ManualChecklistView) and the scanner verification
 * view (VerificationView) used to inline their own copy of the toggle/decrement
 * + parcel-assignment flow. This hook is the ONE place that talks to
 * scanner-api for those mutations and applies optimistic UI updates.
 *
 * Components are responsible only for rendering — they call:
 *   manualIncrement(itemId, quantityToPack)
 *   manualDecrement(itemId)
 * and the hook handles server call + optimistic state + (optional) parcel
 * assignment when kolli mode is active.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  togglePackingItemManually,
  decrementPackingItem,
} from '@/services/scannerService';

interface ManualPackingActionsArgs {
  verifierName: string;
  applyOptimisticIncrement: (itemId: string) => void;
  applyOptimisticDecrement: (itemId: string) => void;
  /** Optional: when kolli mode is active, pass the active parcel id. */
  getActiveParcelId?: () => string | null;
  /** Optional: assign the freshly-incremented unit to the active parcel. */
  assignToKolli?: (itemId: string, quantity?: number) => Promise<void> | void;
}

export const useManualPackingActions = ({
  verifierName,
  applyOptimisticIncrement,
  applyOptimisticDecrement,
  getActiveParcelId,
  assignToKolli,
}: ManualPackingActionsArgs) => {
  const manualIncrement = useCallback(async (
    itemId: string,
    quantityToPack: number,
    isParent: boolean,
  ) => {
    if (isParent) return;
    const activeParcelId = getActiveParcelId?.() ?? null;
    const result = await togglePackingItemManually(
      itemId,
      false,
      quantityToPack,
      verifierName,
      activeParcelId,
    );
    if (!result.success) {
      toast.error(result.error || 'Could not update');
      return;
    }
    applyOptimisticIncrement(itemId);
    if (activeParcelId && assignToKolli) {
      try { await assignToKolli(itemId, 1); } catch { /* surfaced by service */ }
    }
  }, [verifierName, applyOptimisticIncrement, getActiveParcelId, assignToKolli]);

  const manualDecrement = useCallback(async (
    itemId: string,
    isParent: boolean,
  ) => {
    if (isParent) return;
    const result = await decrementPackingItem(itemId, verifierName);
    if (!result.success) {
      toast.error(result.error || 'Could not update');
      return;
    }
    applyOptimisticDecrement(itemId);
  }, [verifierName, applyOptimisticDecrement]);

  return { manualIncrement, manualDecrement };
};

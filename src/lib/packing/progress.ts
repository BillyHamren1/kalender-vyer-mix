/**
 * packing/progress — SINGLE SOURCE OF TRUTH for packing list progress.
 * ====================================================================
 *
 * This file is mirrored 1:1 by `supabase/functions/_shared/packing-progress.ts`.
 * Any change to the rules below MUST be applied to that file in the same commit.
 *
 * --- The rule ---
 *
 * A `packing_list_items` row is COUNTABLE in the progress totals iff:
 *   1. `excluded` is not true, AND
 *   2. The row's product is NOT a "package header".
 *
 * A row is a PACKAGE HEADER iff its `booking_products.id` is referenced as
 * `parent_product_id` by at least one other row in the SAME packing list.
 * (We use the in-list relationship rather than the boolean
 * `is_package_component` flag because the latter is set inconsistently
 * across imports and creates the historical drift between scanner-api and
 * the UI views.)
 *
 * Children of a package (rows where `parent_product_id` points at a row in
 * the same list) are countable on their own — the package header row only
 * exists as a visual grouping in the UI and must not double-count.
 *
 * Rows without a `booking_product_id` (manual items added in the UI) are
 * always countable.
 *
 * --- Aggregation ---
 *
 *   total    = Σ quantity_to_pack             over countable rows
 *   verified = Σ min(quantity_packed, quantity_to_pack)  over countable rows
 *   percent  = total > 0 ? round(verified / total * 100) : 0
 *
 * Over-packing (quantity_packed > quantity_to_pack) is clamped in `verified`
 * so it never drives percent above 100. UI surfaces the over-pack visually.
 *
 * --- Status mapping (used by checkIfAllPacked) ---
 *
 *   total === 0           → leave status untouched (empty list)
 *   verified >= total     → 'packed'
 *   verified <  total     → 'in_progress'
 *
 * `pending` is never set by progress logic — it is the initial state set on
 * creation and is only flipped to `in_progress` on the first scan/check by
 * upstream code; this helper does not touch `pending`.
 */

export interface ProgressItemInput {
  /** From packing_list_items.id */
  id: string;
  excluded?: boolean | null;
  quantity_to_pack: number;
  quantity_packed: number | null;
  booking_products?: {
    id?: string | null;
    parent_product_id?: string | null;
  } | null;
}

export interface PackingProgressResult {
  /** Sum of quantity_to_pack over countable rows. */
  total: number;
  /** Sum of clamped quantity_packed over countable rows. */
  verified: number;
  /** 0–100, rounded. 0 when total === 0. */
  percentage: number;
  /** Stable snapshot of which row ids were considered countable. */
  countableIds: string[];
}

/** Build the set of product ids that act as package headers in this list. */
function buildPackageHeaderProductIds(items: ProgressItemInput[]): Set<string> {
  const headers = new Set<string>();
  for (const it of items) {
    const pid = it.booking_products?.parent_product_id;
    if (pid) headers.add(pid);
  }
  return headers;
}

/** True if this row should contribute to total/verified. */
export function isCountable(
  item: ProgressItemInput,
  packageHeaderProductIds: Set<string>,
): boolean {
  if (item.excluded === true) return false;
  const productId = item.booking_products?.id;
  if (!productId) return true; // manual / orphan row
  return !packageHeaderProductIds.has(productId);
}

/** Compute total, verified, percentage for a packing list. */
export function computePackingProgress(items: ProgressItemInput[]): PackingProgressResult {
  const headers = buildPackageHeaderProductIds(items);
  let total = 0;
  let verified = 0;
  const countableIds: string[] = [];
  for (const it of items) {
    if (!isCountable(it, headers)) continue;
    countableIds.push(it.id);
    const want = Math.max(0, it.quantity_to_pack | 0);
    const packed = Math.max(0, (it.quantity_packed ?? 0) | 0);
    total += want;
    verified += Math.min(packed, want);
  }
  const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;
  return { total, verified, percentage, countableIds };
}

/** True iff the list is fully packed (and non-empty). */
export function isAllPacked(items: ProgressItemInput[]): boolean {
  const { total, verified } = computePackingProgress(items);
  return total > 0 && verified >= total;
}

/**
 * Map the same progress to a packing_projects.status value.
 * Returns null when the list is empty so callers know to leave status alone.
 */
export function deriveStatusFromProgress(
  items: ProgressItemInput[],
): 'packed' | 'in_progress' | null {
  const { total, verified } = computePackingProgress(items);
  if (total === 0) return null;
  return verified >= total ? 'packed' : 'in_progress';
}

/**
 * Per-row visual breakdown for views that render package headers as
 * collapsible groups (e.g. VerificationView). The header row is reported
 * as "1/1 packed" iff every child in the same list is fully packed.
 *
 * NOTE: this intentionally does NOT contribute to aggregate progress —
 * `computePackingProgress` is the only authority for totals/percent.
 */
export function getDisplayedProgressForRow(
  item: ProgressItemInput,
  allItems: ProgressItemInput[],
): { displayedPacked: number; displayedTotal: number; isHeader: boolean } {
  const headers = buildPackageHeaderProductIds(allItems);
  const productId = item.booking_products?.id ?? null;
  const isHeader = !!productId && headers.has(productId);

  if (!isHeader) {
    return {
      displayedPacked: Math.max(0, item.quantity_packed ?? 0),
      displayedTotal: Math.max(0, item.quantity_to_pack | 0),
      isHeader: false,
    };
  }

  const children = allItems.filter(
    (i) => i.booking_products?.parent_product_id === productId && i.excluded !== true,
  );
  const allChildrenPacked =
    children.length > 0 &&
    children.every((c) => (c.quantity_packed ?? 0) >= c.quantity_to_pack);
  return {
    displayedPacked: allChildrenPacked ? 1 : 0,
    displayedTotal: 1,
    isHeader: true,
  };
}

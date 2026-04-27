/**
 * packing-progress (edge-functions mirror) — SINGLE SOURCE OF TRUTH for
 * server-side packing list progress and status.
 *
 * This file is mirrored 1:1 by `src/lib/packing/progress.ts`. Any change
 * here MUST be applied to that file in the same commit. Both sides
 * evaluate the same rule against the same shape so the UI and the
 * `packing_projects.status` value never drift.
 *
 * Rule recap (see `src/lib/packing/progress.ts` for full prose):
 *   • Countable iff `excluded !== true` AND not a "package header".
 *   • Package header = a row whose `booking_products.id` is referenced
 *     as `parent_product_id` by ≥1 other row in the same packing list.
 *   • total = Σ quantity_to_pack; verified = Σ min(packed, want).
 *   • Status: total === 0 → leave alone; verified >= total → 'packed';
 *     otherwise → 'in_progress'.
 */

export interface ProgressItemInput {
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
  total: number;
  verified: number;
  percentage: number;
  countableIds: string[];
}

function buildPackageHeaderProductIds(items: ProgressItemInput[]): Set<string> {
  const headers = new Set<string>();
  for (const it of items) {
    const pid = it.booking_products?.parent_product_id;
    if (pid) headers.add(pid);
  }
  return headers;
}

export function isCountable(
  item: ProgressItemInput,
  packageHeaderProductIds: Set<string>,
): boolean {
  if (item.excluded === true) return false;
  const productId = item.booking_products?.id;
  if (!productId) return true;
  return !packageHeaderProductIds.has(productId);
}

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

export function deriveStatusFromProgress(
  items: ProgressItemInput[],
): 'packed' | 'in_progress' | null {
  const { total, verified } = computePackingProgress(items);
  if (total === 0) return null;
  return verified >= total ? 'packed' : 'in_progress';
}

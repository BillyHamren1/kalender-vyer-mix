/**
 * STEG 3D – Produktsource-completeness (fail-closed).
 *
 * Ren TypeScript utan Deno-API:er så att modulen kan enhetstestas från vitest
 * och importeras av edge functions.
 *
 * REGEL: Planning får ALDRIG gissa completeness utifrån antal produkter.
 * Destruktiva produktoperationer (delete / clear / replace / packing-item
 * delete) kräver att Booking-kontraktet EXPLICIT säger `products_complete: true`.
 * Saknas fältet (unknown) eller är det false → add/update tillåts, delete
 * blockeras.
 */

export type ProductSourceCompleteness = 'complete' | 'incomplete' | 'unknown';

/** Logg-nyckel som används när en destruktiv operation blockeras. */
export const PRODUCT_DESTRUCTIVE_BLOCKED_LOG = 'product_destructive_sync_blocked_incomplete_source';

/**
 * Läser canonical completeness-fältet ur Booking-kontraktet.
 * Endast en äkta boolean räknas. Strängar, siffror, null och saknat fält
 * ger 'unknown' (fail-closed).
 */
export function readProductSourceCompleteness(source: unknown): ProductSourceCompleteness {
  if (!source || typeof source !== 'object') return 'unknown';
  const root = source as Record<string, unknown>;
  const candidates: unknown[] = [root.products_complete];
  const meta = root.meta;
  if (meta && typeof meta === 'object') {
    candidates.push((meta as Record<string, unknown>).products_complete);
  }
  for (const value of candidates) {
    if (value === true) return 'complete';
    if (value === false) return 'incomplete';
  }
  return 'unknown';
}

/** Destruktiva produktoperationer är endast tillåtna vid verifierat komplett källa. */
export function canDeleteProducts(completeness: ProductSourceCompleteness): boolean {
  return completeness === 'complete';
}

const normName = (v: unknown): string => (v ?? '').toString().trim().toLowerCase();
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const str = (v: unknown): string => (v ?? '').toString().trim();
const tagsSig = (v: unknown): string => (Array.isArray(v) ? [...v].map(str).sort().join(',') : '');
const componentsSig = (v: unknown): string => {
  if (!Array.isArray(v)) return '';
  return v
    .map((c: any) => `${normName(c?.name)}|${num(c?.quantity ?? 1)}|${normName(c?.sku)}`)
    .sort()
    .join(';');
};

export interface ProductDiffResult {
  changed: boolean;
  added: string[];
  removed: string[];
  updated: string[];
  /** true endast när products_complete === true. */
  deleteAllowed: boolean;
  /** Produkter som SKULLE tagits bort men blockerades av fail-closed-regeln. */
  blockedRemovals: string[];
}

/**
 * Ren diff mellan lokala och externa produkter.
 * `removed` populeras ENDAST när completeness === 'complete'.
 */
export function diffProducts(
  existingProducts: any[],
  externalProducts: any[],
  completeness: ProductSourceCompleteness,
): ProductDiffResult {
  const deleteAllowed = canDeleteProducts(completeness);

  // GUARD: tom extern lista = transient/missing source, aldrig raderingsintention.
  if ((externalProducts || []).length === 0) {
    return {
      changed: false,
      added: [],
      removed: [],
      updated: [],
      deleteAllowed: false,
      blockedRemovals: (existingProducts || []).map((p: any) => p?.name).filter(Boolean),
    };
  }

  const existingMap = new Map((existingProducts || []).map((p: any) => [normName(p?.name), p]));
  const externalMap = new Map(
    (externalProducts || []).map((p: any) => [normName(p?.name ?? p?.product_name), p]),
  );


  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const blockedRemovals: string[] = [];

  for (const [name, extProduct] of externalMap as Map<string, any>) {
    const existing = existingMap.get(name) as any;
    if (!existing) {
      added.push(extProduct?.name || extProduct?.product_name || 'Unknown');
      continue;
    }

    const extQty = extProduct?.quantity ?? 1;
    const extUnitPriceRaw =
      extProduct?.unit_price ?? extProduct?.price ?? extProduct?.rental_price ?? extProduct?.cost ?? null;
    const extTotalPrice = extProduct?.total ?? (extUnitPriceRaw != null ? extUnitPriceRaw * extQty : null);
    const extNotes = extProduct?.notes ?? extProduct?.description ?? null;
    const extSku = extProduct?.sku ?? extProduct?.article_number ?? null;

    const diffs: string[] = [];
    if ((existing.quantity ?? 0) !== extQty) diffs.push(`qty ${existing.quantity}→${extQty}`);
    if (num(existing.unit_price) !== num(extUnitPriceRaw)) diffs.push(`unit ${existing.unit_price}→${extUnitPriceRaw}`);
    if (num(existing.total_price) !== num(extTotalPrice)) diffs.push(`total ${existing.total_price}→${extTotalPrice}`);
    if (str(existing.notes) !== str(extNotes)) diffs.push('notes');
    if (str(existing.sku) !== str(extSku)) diffs.push('sku');
    if (extProduct?.vat_rate != null && num(existing.vat_rate) !== num(extProduct.vat_rate)) diffs.push('vat');
    if (extProduct?.discount != null && num(existing.discount) !== num(extProduct.discount)) diffs.push('discount');
    if (extProduct?.tags != null && tagsSig(existing.tags) !== tagsSig(extProduct.tags)) diffs.push('tags');
    if (
      extProduct?.package_components != null &&
      componentsSig(existing.package_components) !== componentsSig(extProduct.package_components)
    ) {
      diffs.push('package_components');
    }

    if (diffs.length > 0) {
      updated.push(`${extProduct?.name || extProduct?.product_name}: ${diffs.join(', ')}`);
    }
  }

  for (const [name, existingProduct] of existingMap as Map<string, any>) {
    if (!externalMap.has(name)) {
      if (deleteAllowed) removed.push(existingProduct.name);
      else blockedRemovals.push(existingProduct.name);
    }
  }

  return {
    changed: added.length > 0 || removed.length > 0 || updated.length > 0,
    added,
    removed,
    updated,
    deleteAllowed,
    blockedRemovals,
  };
}

export interface PackingReconnectPlan {
  /** Items som ska peka om till nytt produkt-id. */
  updates: Array<{ itemId: string; newProductId: string }>;
  /** Items som får raderas (endast vid complete source). */
  deletes: string[];
  /** Items som skulle ha raderats men behålls p.g.a. incomplete/unknown source. */
  blockedDeletes: string[];
  /** Items vars gamla produkt inte gick att identifiera — rörs aldrig. */
  untouched: string[];
}

/**
 * Ren planerare för packing-reconnect. Raderar aldrig något om källan inte
 * är verifierat komplett.
 */
export function planPackingReconnect(
  packingItems: Array<{ id: string; booking_product_id: string | null }>,
  oldProducts: any[],
  newProducts: any[],
  completeness: ProductSourceCompleteness,
): PackingReconnectPlan {
  const deleteAllowed = canDeleteProducts(completeness);
  const oldIdToName = new Map((oldProducts || []).map((p: any) => [p.id, normName(p?.name)]));
  const newNameToId = new Map((newProducts || []).map((p: any) => [normName(p?.name), p.id]));

  const plan: PackingReconnectPlan = { updates: [], deletes: [], blockedDeletes: [], untouched: [] };

  for (const item of packingItems || []) {
    const oldName = item.booking_product_id ? oldIdToName.get(item.booking_product_id) : undefined;
    if (!oldName) {
      plan.untouched.push(item.id);
      continue;
    }
    const newProductId = newNameToId.get(oldName);
    if (newProductId) {
      plan.updates.push({ itemId: item.id, newProductId });
    } else if (deleteAllowed) {
      plan.deletes.push(item.id);
    } else {
      plan.blockedDeletes.push(item.id);
    }
  }

  return plan;
}

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

/* ==========================================================================
 * BOOKING PRODUCT SYNC IDENTITY
 * --------------------------------------------------------------------------
 * Booking-ägda orderrader identifieras med ett STABILT sync_key som härleds
 * ur Bookings egna rad-id (inte namnet). Det gör att:
 *  - flera orderrader med samma namn bevaras som separata rader,
 *  - multipliciteten bevaras vid varje sync,
 *  - Planning-genererade paketkomponenter aldrig förväxlas med Booking-rader,
 *  - expansion av paketkomponenter blir idempotent.
 * ========================================================================== */

/** Prefix för Booking-ägda orderrader. */
export const BOOKING_SOURCE_SYNC_PREFIX = 'src:';
/** Prefix för Planning-genererade paketkomponenter. */
export const PLANNING_COMPONENT_SYNC_PREFIX = 'cmp:';

const slug = (v: unknown): string =>
  (v ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** Läser Bookings stabila rad-id om det finns. */
export function readExternalProductId(product: any): string | null {
  if (!product || typeof product !== 'object') return null;
  const candidates = [
    product.id,
    product.external_id,
    product.booking_product_id,
    product.order_row_id,
    product.row_id,
    product.line_id,
  ];
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}

/**
 * Bygger stabilt sync_key för en Booking-ägd orderrad.
 * Med externt id → helt stabilt. Utan id → deterministisk position+namn-nyckel
 * (fortfarande unik per rad, så multiplicitet bevaras).
 */
export function buildSourceSyncKey(product: any, index: number): string {
  const extId = readExternalProductId(product);
  if (extId) return `${BOOKING_SOURCE_SYNC_PREFIX}${extId}`;
  const name = slug(product?.name ?? product?.product_name);
  return `${BOOKING_SOURCE_SYNC_PREFIX}pos:${index}:${name}`;
}

/** Bygger stabilt sync_key för en Planning-genererad paketkomponent. */
export function buildComponentSyncKey(
  parentKey: string,
  component: any,
  index: number,
): string {
  const compId =
    component?.item_type_id ?? component?.id ?? component?.sku ?? null;
  const suffix =
    compId !== null && compId !== undefined && String(compId).trim()
      ? String(compId).trim()
      : `pos:${index}:${slug(component?.name)}`;
  return `${PLANNING_COMPONENT_SYNC_PREFIX}${parentKey}:${suffix}`;
}

/** true om raden skapats av Planning (paketkomponent), inte av Booking. */
export function isPlanningGeneratedRow(row: any): boolean {
  const key = (row?.sync_key ?? '').toString();
  if (key.startsWith(PLANNING_COMPONENT_SYNC_PREFIX)) return true;
  if (key.startsWith(BOOKING_SOURCE_SYNC_PREFIX)) return false;
  return row?.is_package_component === true;
}

/**
 * Bevarar explicit quantity: 0. Endast saknad/ogiltig mängd blir 1.
 */
export function normalizeSyncQuantity(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 1;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return n;
}

export interface SyncIdentityMatch {
  syncKey: string;
  external: any;
  existingId: string | null;
}

export interface SyncIdentityPlan {
  /** En post per extern orderrad, i inkommande ordning. */
  matches: SyncIdentityMatch[];
  /** Booking-ägda lokala rader som inte matchades av någon extern rad. */
  unmatchedExisting: string[];
  /** Planning-genererade rader — rörs aldrig av Booking-matchningen. */
  ignoredPlanningRows: string[];
}

/**
 * Matchar externa orderrader mot lokala rader via sync_key först och
 * (för historiska rader utan sync_key) namn med bevarad multiplicitet.
 * Planning-genererade komponenter ignoreras helt.
 */
export function planProductSyncIdentity(
  externalProducts: any[],
  existingRows: Array<{ id: string; name?: string | null; sync_key?: string | null; is_package_component?: boolean | null }>,
): SyncIdentityPlan {
  const ignoredPlanningRows: string[] = [];
  const bookingRows: typeof existingRows = [];
  for (const row of existingRows || []) {
    if (isPlanningGeneratedRow(row)) ignoredPlanningRows.push(row.id);
    else bookingRows.push(row);
  }

  const byKey = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const row of bookingRows) {
    const key = (row.sync_key ?? '').toString();
    if (key) {
      if (!byKey.has(key)) byKey.set(key, row.id);
      continue;
    }
    const nameKey = slug(row.name);
    const list = byName.get(nameKey) ?? [];
    list.push(row.id);
    byName.set(nameKey, list);
  }

  const used = new Set<string>();
  const matches: SyncIdentityMatch[] = [];

  (externalProducts || []).forEach((external, index) => {
    const syncKey = buildSourceSyncKey(external, index);
    let existingId: string | null = null;

    const keyed = byKey.get(syncKey);
    if (keyed && !used.has(keyed)) {
      existingId = keyed;
    } else {
      // Fallback: historisk rad utan sync_key. FIFO per namn så att flera
      // rader med samma namn behåller sin multiplicitet.
      const nameKey = slug(external?.name ?? external?.product_name);
      const queue = byName.get(nameKey);
      while (queue && queue.length > 0) {
        const candidate = queue.shift() as string;
        if (!used.has(candidate)) {
          existingId = candidate;
          break;
        }
      }
    }

    if (existingId) used.add(existingId);
    matches.push({ syncKey, external, existingId });
  });

  const unmatchedExisting = bookingRows
    .map((r) => r.id)
    .filter((id) => !used.has(id));

  return { matches, unmatchedExisting, ignoredPlanningRows };
}

export interface ComponentExpansionRow {
  parentId: string;
  syncKey: string;
  component: any;
  quantity: number;
  sortIndex: number;
}

export interface ComponentUpdateRow extends ComponentExpansionRow {
  /** Lokalt rad-id för den redan genererade komponentraden. */
  existingId: string;
  /** Nuvarande mängd på den lokala raden (för loggning/diff). */
  currentQuantity: number;
  /**
   * True när raden är en historisk genererad komponentrad UTAN cmp:-nyckel som
   * adopteras (får nyckeln) i stället för att en dubblett skapas.
   */
  adoptSyncKey?: boolean;
}

export interface ComponentReconciliationPlan {
  /** Saknade komponentrader som ska skapas. */
  inserts: ComponentExpansionRow[];
  /** Befintliga cmp:-rader vars mängd avviker från önskad mängd. */
  updates: ComponentUpdateRow[];
  /** Befintliga cmp:-rader som redan är korrekta (ingen skrivning). */
  unchanged: string[];
}

export interface ComponentParentInput {
  id: string;
  sync_key?: string | null;
  package_components?: any;
  sort_index?: number | null;
  is_package_component?: boolean | null;
  quantity?: unknown;
}

export interface ComponentExistingRowInput {
  id?: string;
  sync_key?: string | null;
  quantity?: unknown;
  name?: string | null;
  parent_product_id?: string | null;
  is_package_component?: boolean | null;
}


/**
 * Icke-destruktiv avstämningsplan för package_components.
 *
 * package_components på källraden är en PER-PAKET-definition, så önskad mängd
 * för varje genererad komponentrad är:
 *   normalizeSyncQuantity(parent.quantity) × normalizeSyncQuantity(component.quantity)
 *
 * - Föräldrar utan Booking-nyckel (historiska) expanderas ALDRIG.
 * - Stabil cmp:-nyckel skiljer saknad rad (insert) från befintlig rad (update).
 * - Ingen radering planeras någonsin här.
 */
export function planPackageComponentReconciliation(
  parents: ComponentParentInput[],
  existingRows: ComponentExistingRowInput[],
): ComponentReconciliationPlan {
  const existingByKey = new Map<string, ComponentExistingRowInput>();
  /** Historiska genererade komponentrader utan cmp:-nyckel, per förälder + namn. */
  const legacyByParentName = new Map<string, ComponentExistingRowInput[]>();
  const legacyKey = (parentId: string, name: unknown) =>
    `${parentId}::${slug(String(name ?? '').replace(/^\s*--\s*/, ''))}`;

  for (const row of existingRows || []) {
    const key = (row?.sync_key ?? '').toString();
    if (key.startsWith(PLANNING_COMPONENT_SYNC_PREFIX)) {
      if (!existingByKey.has(key)) existingByKey.set(key, row);
      continue;
    }
    if (key) continue; // src:-rad → Booking-ägd, aldrig komponentkandidat
    if (row?.is_package_component !== true) continue;
    if (!row?.parent_product_id) continue;
    const lk = legacyKey(row.parent_product_id, row.name);
    const list = legacyByParentName.get(lk) ?? [];
    list.push(row);
    legacyByParentName.set(lk, list);
  }

  const plan: ComponentReconciliationPlan = { inserts: [], updates: [], unchanged: [] };
  const seen = new Set<string>();

  for (const parent of parents || []) {
    const parentKey = (parent.sync_key ?? '').toString();
    if (!parentKey.startsWith(BOOKING_SOURCE_SYNC_PREFIX)) continue; // historisk/okopplad
    if (parent.is_package_component === true) continue;
    const parentQty = normalizeSyncQuantity(parent.quantity);
    const comps = Array.isArray(parent.package_components) ? parent.package_components : [];

    comps.forEach((comp: any, i: number) => {
      const syncKey = buildComponentSyncKey(parentKey, comp, i);
      if (seen.has(syncKey)) return; // aldrig dubbletter inom samma plan
      seen.add(syncKey);

      const desiredQuantity = parentQty * normalizeSyncQuantity(comp?.quantity);
      const base: ComponentExpansionRow = {
        parentId: parent.id,
        syncKey,
        component: comp,
        quantity: desiredQuantity,
        sortIndex: (parent.sort_index ?? 0) + (i + 1) * 0.001,
      };

      const existing = existingByKey.get(syncKey);
      if (!existing) {
        // Adoptera historisk komponentrad (samma förälder + namn) i stället för
        // att skapa en dubblett. Ingen radering; raden får sin stabila nyckel.
        const queue = legacyByParentName.get(legacyKey(parent.id, comp?.name));
        const legacy = queue && queue.length > 0 ? queue.shift() : undefined;
        if (legacy) {
          plan.updates.push({
            ...base,
            existingId: (legacy.id ?? '').toString(),
            currentQuantity: normalizeSyncQuantity(legacy.quantity),
            adoptSyncKey: true,
          });
          return;
        }
        plan.inserts.push(base);
        return;
      }

      const currentQuantity = normalizeSyncQuantity(existing.quantity);
      if (currentQuantity !== desiredQuantity) {
        plan.updates.push({
          ...base,
          existingId: (existing.id ?? '').toString(),
          currentQuantity,
        });
      } else {
        plan.unchanged.push((existing.id ?? '').toString());
      }
    });
  }


  return plan;
}

/**
 * Bakåtkompatibel vy: endast de komponentrader som saknas (inserts).
 */
export function planPackageComponentExpansion(
  parents: ComponentParentInput[],
  existingRows: ComponentExistingRowInput[],
): ComponentExpansionRow[] {
  return planPackageComponentReconciliation(parents, existingRows).inserts;
}


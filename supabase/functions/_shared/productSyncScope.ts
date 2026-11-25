/**
 * Mottagarkontrakt för Sales `warehouse_sync` (partial scope).
 *
 * Sales kan skicka en full snapshot där WMS inte accepterat produktändringen:
 *   warehouse_sync: { status: 'attention_required', code, products_wms_accepted: false }
 * Då får Planning uppdatera canonical datum/tider och säker metadata, men
 * ALDRIG skriva/ersätta/radera produkter eller packrader, och aldrig
 * rapportera produktsynken som fullständig. En senare accepterad
 * produktsynk på samma revision ska kunna reparera produkterna.
 *
 * Ren TS utan Deno-API:er (testas från vitest).
 */

export interface WarehouseSyncSignal {
  status: string | null;
  code: string | null;
  /** true/false endast när Sales uttryckligen angav boolean, annars null. */
  productsAccepted: boolean | null;
  /** Sales delivery_scope ('schedule_metadata' = endast datum/tider/metadata). */
  deliveryScope?: string | null;
}

/** Sales-kontrakt 19ae78963: partial delivery = endast schema/metadata. */
export const PARTIAL_DELIVERY_SCOPE = 'schedule_metadata';

export type ProductScopeReason =
  | 'products_allowed'
  | 'wms_products_not_accepted';

export interface ProductSyncScope {
  productsAllowed: boolean;
  reason: ProductScopeReason;
  code: string | null;
  /** Källor som begränsade scope (job = webhook-signal, canonical = refetch). */
  restrictedBy: Array<'job' | 'canonical'>;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

export function parseWarehouseSync(raw: unknown): WarehouseSyncSignal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const accepted = r.products_wms_accepted;
  return {
    status: str(r.status)?.toLowerCase() ?? null,
    code: str(r.code),
    productsAccepted: accepted === true ? true : accepted === false ? false : null,
    deliveryScope: str(r.delivery_scope)?.toLowerCase() ?? null,
  };
}

/** Läs signalen ur ett webhook-body/canonical-objekt (rot eller meta). */
export function readWarehouseSync(source: unknown): WarehouseSyncSignal | null {
  if (!source || typeof source !== 'object') return null;
  const root = source as Record<string, unknown>;
  const meta = (root.meta && typeof root.meta === 'object' ? root.meta : {}) as Record<string, unknown>;
  const sig = parseWarehouseSync(root.warehouse_sync) ?? parseWarehouseSync(meta.warehouse_sync);
  const scope = str(root.delivery_scope ?? meta.delivery_scope)?.toLowerCase() ?? null;
  if (!sig && !scope) return null;
  const base: WarehouseSyncSignal = sig ?? { status: null, code: null, productsAccepted: null };
  return { ...base, deliveryScope: scope };
}

/**
 * Signal för en mottagen Sales-leverans. Saknas BÅDA markörerna är det en
 * full leverans (Sales tar bort dem efter WMS-success) — även äldre
 * meddelanden utan fälten är fulla, precis som före kontraktet.
 */
export function readDeliverySignal(body: unknown): WarehouseSyncSignal {
  return readWarehouseSync(body)
    ?? { status: 'full', code: null, productsAccepted: true, deliveryScope: 'full' };
}

export function isProductScopeRestricted(sig: WarehouseSyncSignal | null): boolean {
  if (!sig) return false;
  if (sig.deliveryScope === PARTIAL_DELIVERY_SCOPE) return true;
  if (sig.productsAccepted === false) return true;
  // attention_required utan uttryckligt accept = fail-closed för produkter.
  return sig.status === 'attention_required' && sig.productsAccepted !== true;
}

/**
 * Coalescing av webhook-signaler på samma jobb. En begränsning är "sticky"
 * tills en SENARE händelse uttryckligen säger products_wms_accepted: true.
 * Händelser utan signal ändrar inget (behåller begränsningen).
 */
export function mergeJobWarehouseSync(
  prev: WarehouseSyncSignal | null,
  next: WarehouseSyncSignal | null,
): WarehouseSyncSignal | null {
  if (!next) return prev;
  if (isProductScopeRestricted(next)) return next;
  if (next.productsAccepted === true) return next;
  return prev ?? next;
}

/**
 * Slutligt scope för en import. Båda källor måste tillåta produkter.
 * Saknad signal överallt = bakåtkompatibelt tillåtet (befintliga
 * products_complete-regler gäller fortfarande för destruktiva operationer).
 */
export function resolveProductSyncScope(input: {
  job: WarehouseSyncSignal | null;
  canonical: WarehouseSyncSignal | null;
}): ProductSyncScope {
  const restrictedBy: Array<'job' | 'canonical'> = [];
  if (isProductScopeRestricted(input.job)) restrictedBy.push('job');
  if (isProductScopeRestricted(input.canonical)) restrictedBy.push('canonical');
  if (restrictedBy.length === 0) {
    return { productsAllowed: true, reason: 'products_allowed', code: null, restrictedBy };
  }
  return {
    productsAllowed: false,
    reason: 'wms_products_not_accepted',
    code: input.job?.code ?? input.canonical?.code ?? null,
    restrictedBy,
  };
}

/** Serialiserbar form för jobbkolumn / import-body. */
export function toWarehouseSyncPayload(sig: WarehouseSyncSignal | null): Record<string, unknown> | null {
  if (!sig) return null;
  const restricted = isProductScopeRestricted(sig);
  // Begränsning serialiseras alltid som products_wms_accepted:false så att
  // DB-funktionen record_booking_sync_job_scope känner igen den.
  const accepted = restricted ? false : sig.productsAccepted;
  return {
    status: sig.status,
    code: sig.code,
    ...(sig.deliveryScope ? { delivery_scope: sig.deliveryScope } : {}),
    ...(accepted === null ? {} : { products_wms_accepted: accepted }),
  };
}

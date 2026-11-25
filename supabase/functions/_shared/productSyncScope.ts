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
  | 'wms_products_not_accepted'
  /** Engångs, auditerad operatörsreparation för exakt (org, bokning, revision). */
  | 'operator_rebuild_authorization';

/**
 * Riktad, auditerad återuppbyggnad: en service-role-only auktorisation för
 * exakt (organisation, bokning, canonical revision) tillåter produktskrivning
 * för just den revisionen. Den registrerar aldrig något WMS-kvitto och kan inte
 * gälla en annan revision, bokning eller tenant.
 */
export function applyOperatorRebuildAuthorization(
  scope: ProductSyncScope,
  authorization: { id: string } | null,
): ProductSyncScope {
  if (scope.productsAllowed || !authorization?.id) return scope;
  return {
    productsAllowed: true,
    reason: 'operator_rebuild_authorization',
    code: `operator_rebuild:${authorization.id}`,
    restrictedBy: [],
  };
}

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

// ─────────────────────────────────────────────────────────────────────────
// Revisionsbundet mottagarkontrakt (ersätter jobbsignal som beslutsunderlag).
//
// INVARIANT: Planning skriver produkter/packrader för canonical revision R
// endast om (a) Sales levererat en VERIFIERAD full leverans för exakt R
// (kvitto i booking_delivery_scope_receipts), eller (b) bokningen aldrig fått
// en delleverans (oförändrat legacybeteende). Kvittot sparas i samma
// transaktion som synkjobbet (enqueue_booking_sync_job_scoped), och mandatet
// prövas per revision i importen — aldrig från jobbets signal.
// ─────────────────────────────────────────────────────────────────────────

export type DeliveryScope = 'partial' | 'full' | 'neutral';

export interface DeliveryClassification {
  scope: DeliveryScope;
  eventId: string | null;
  sourceUpdatedAt: string | null;
  code: string | null;
  reason: string;
}

/** Sales-händelser som levererar full canonical snapshot (19ae78963). */
const FULL_DELIVERY_EVENTS = new Set([
  'booking_updated', 'booking_time_updated', 'booking_confirmed', 'booking_status_changed',
  'booking_created', 'booking_cancelled',
]);

const validIso = (v: unknown): string | null => {
  const s = str(v);
  return s && Number.isFinite(Date.parse(s)) ? s : null;
};

const normEvent = (v: unknown) => (str(v) ?? '').toLowerCase().replace(/\./g, '_');

/**
 * Klassning av en mottagen Sales-leverans.
 * - partial: delivery_scope='schedule_metadata', eller begränsande
 *   warehouse_sync utan scope (utom cancellation-vägen som Sales själv
 *   behåller som full). Kräver event_id + source_updated_at (annars ogiltig).
 * - full: INGA markörer + event_id + giltig source_updated_at + products-array
 *   + känd Sales-händelse. Endast detta kan ge produktmandat.
 * - neutral: allt annat (legacy, poller, inkrementellt, ofullständigt) — häver
 *   aldrig en begränsning och ger aldrig mandat.
 */
export function classifyDelivery(body: unknown): DeliveryClassification {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const sig = readWarehouseSync(b);
  const eventId = str(b.event_id);
  const sourceUpdatedAt = validIso(b.source_updated_at);
  const cancelled = (str(b.canonical_status) ?? str(b.status) ?? '').toUpperCase() === 'CANCELLED';
  const hasScope = sig?.deliveryScope === PARTIAL_DELIVERY_SCOPE;
  if (hasScope || (isProductScopeRestricted(sig) && !cancelled)) {
    return { scope: 'partial', eventId, sourceUpdatedAt, code: sig?.code ?? null, reason: 'sales_partial_delivery' };
  }
  if (sig) {
    return { scope: 'neutral', eventId, sourceUpdatedAt, code: sig.code, reason: cancelled ? 'cancellation_marker' : 'marker_without_restriction' };
  }
  const verified = !!eventId && !!sourceUpdatedAt && Array.isArray(b.products)
    && FULL_DELIVERY_EVENTS.has(normEvent(b.event_type));
  return verified
    ? { scope: 'full', eventId, sourceUpdatedAt, code: null, reason: 'verified_full_delivery' }
    : { scope: 'neutral', eventId, sourceUpdatedAt, code: null, reason: 'unverified_or_legacy' };
}

export type MandateDecision =
  | 'allowed_legacy' | 'allowed_exact_full'
  | 'deferred_partial' | 'deferred_no_mandate' | 'deferred_invalid_revision'
  | 'mandate_unavailable';

/** Mandat → produktscope. Okänt/fel = fail-closed för spårade bokningar. */
export function mandateToScope(m: { decision?: string; allowed?: boolean; code?: string | null } | null): ProductSyncScope {
  const allowed = m?.allowed === true
    && (m.decision === 'allowed_legacy' || m.decision === 'allowed_exact_full');
  return allowed
    ? { productsAllowed: true, reason: 'products_allowed', code: null, restrictedBy: [] }
    : { productsAllowed: false, reason: 'wms_products_not_accepted', code: m?.code ?? m?.decision ?? 'mandate_unavailable', restrictedBy: ['job'] };
}

// ─────────────────────────────────────────────────────────────────────────
// WMS-kvitto i canonical export (Sales: inventory_synced_version +
// canonical_sync_version, ev. inventory_sync_status).
//
// Stänger tidsluckan för bokningar utan partialhistorik: innehåller den
// hämtade exporten UTTRYCKLIGEN fälten får produkter bara skrivas när
// inventory_synced_version motsvarar canonical_sync_version för den hämtade
// revisionen. Annars endast schema/metadata + products_pending. updated_at
// jämförs aldrig här (kan flytta sig när Sales sparar kvittot).
// Saknas fälten helt = bakåtkompatibelt (deploymentordning).
// ─────────────────────────────────────────────────────────────────────────

export type ExportWmsReceiptDecision =
  | 'absent' | 'accepted' | 'version_mismatch' | 'unverifiable' | 'status_failed';

export interface ExportWmsReceipt {
  decision: ExportWmsReceiptDecision;
  productsAllowed: boolean;
  inventorySyncedVersion: string | null;
  canonicalSyncVersion: string | null;
  status: string | null;
}

const has = (o: Record<string, unknown> | null, k: string) =>
  !!o && Object.prototype.hasOwnProperty.call(o, k);

const versionValue = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'bigint') return v.toString();
  return str(v);
};

const sameVersion = (a: string, b: string): boolean => {
  if (a === b) return true;
  const na = Number(a), nb = Number(b);
  return /^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b) && na === nb;
};

const NOT_REQUIRED_STATUSES = new Set(['not_required', 'not_applicable']);
const FAILED_STATUSES = new Set(['failed', 'error', 'attention_required', 'rejected', 'conflict']);

/** Läser kvittot ur en export-rad (rot, eller meta/sync-objekt). */
export function evaluateExportWmsReceipt(row: unknown): ExportWmsReceipt {
  const r = (row && typeof row === 'object' && !Array.isArray(row) ? row : {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
  const containers = [r, obj(r.meta), obj(r.sync), obj(r.inventory_sync)].filter(Boolean) as Record<string, unknown>[];
  const src = containers.find((c) => has(c, 'inventory_synced_version') || has(c, 'canonical_sync_version')) ?? null;
  const statusSrc = containers.find((c) => has(c, 'inventory_sync_status')) ?? null;
  const status = statusSrc ? str(statusSrc.inventory_sync_status)?.toLowerCase() ?? null : null;
  if (!src) {
    return { decision: 'absent', productsAllowed: true, inventorySyncedVersion: null, canonicalSyncVersion: null, status };
  }
  const inv = versionValue(src.inventory_synced_version);
  const can = versionValue(src.canonical_sync_version);
  const base = { inventorySyncedVersion: inv, canonicalSyncVersion: can, status };
  // Sales anger uttryckligen att bokningen inte ska till WMS → inget kvitto krävs.
  if (status && NOT_REQUIRED_STATUSES.has(status)) return { ...base, decision: 'accepted', productsAllowed: true };
  if (!inv || !can) return { ...base, decision: 'unverifiable', productsAllowed: false };
  if (!sameVersion(inv, can)) return { ...base, decision: 'version_mismatch', productsAllowed: false };
  if (status && FAILED_STATUSES.has(status)) return { ...base, decision: 'status_failed', productsAllowed: false };
  return { ...base, decision: 'accepted', productsAllowed: true };
}

/** Revisionsmandat OCH exportkvitto måste båda tillåta produkter. */
export function combineScopeWithExportReceipt(scope: ProductSyncScope, receipt: ExportWmsReceipt): ProductSyncScope {
  if (!scope.productsAllowed || receipt.productsAllowed) return scope;
  return {
    productsAllowed: false,
    reason: 'wms_products_not_accepted',
    code: `export_wms_${receipt.decision}`,
    restrictedBy: ['canonical'],
  };
}

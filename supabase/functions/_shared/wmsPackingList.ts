// @ts-nocheck
/**
 * wmsPackingList — KANONISK källa för packlistan.
 *
 * Regel (fastställd av användaren):
 *   Lagersystemets (WMS) reservation är sanningen för VAD som ska packas.
 *   Planning speglar reservationsraderna till `packing_list_items` och får
 *   aldrig hitta på egna rader när WMS är åtkomligt.
 *
 * Identitet:
 *   - Reservationen slås ALLTID upp via `get-reservation?external_id=<booking_number>`
 *     och identifieras därefter med reservationens UUID. Bokningsnumret används
 *     aldrig som reservation_id.
 *   - Varje speglad rad bär `wms_line_id` (stabil nyckel) → idempotent synk.
 *
 * Aldrig:
 *   - Raderar aldrig rader. Rader som försvunnit ur WMS markeras `excluded`
 *     (endast om inget är packat) så att historik och packat arbete bevaras.
 *   - Skriver aldrig över `quantity_packed`, `packed_*`, `parcel_id`.
 *   - Döljer aldrig fel: WMS-fel returneras som kod, ingen tyst fallback.
 */

export const WMS_BASE_URL = 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1';

export interface WmsCallDeps {
  apiKey: string;
  organizationId: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export type WmsFailureCode =
  | 'wms_not_configured'
  | 'wms_reservation_not_found'
  | 'wms_unavailable'
  | 'wms_bad_response';

export interface WmsReservationResult {
  ok: boolean;
  reservationId?: string;
  externalId?: string;
  code?: WmsFailureCode;
  error?: string;
  /**
   * ADDITIVT (scanner-read-contract-v1): exakta värden från WMS get-reservation.
   * Aldrig tolkade, aldrig fallback — saknas de i svaret blir de null.
   */
  status?: string | null;
  updatedAt?: string | null;
  syncedAt?: string | null;
}

function headers(deps: WmsCallDeps) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${deps.apiKey}`,
    'x-organization-id': deps.organizationId,
  };
}

/** Slår upp WMS-reservationens UUID från bokningsnumret. */
export async function resolveWmsReservation(
  bookingNumber: string,
  deps: WmsCallDeps,
): Promise<WmsReservationResult> {
  if (!deps.apiKey) {
    return { ok: false, code: 'wms_not_configured', error: 'PRICELIST_API_KEY saknas' };
  }
  if (!bookingNumber) {
    return { ok: false, code: 'wms_reservation_not_found', error: 'Bokningsnummer saknas' };
  }
  const f = deps.fetchImpl || fetch;
  const base = deps.baseUrl || WMS_BASE_URL;
  let resp: Response;
  try {
    resp = await f(
      `${base}/get-reservation?external_id=${encodeURIComponent(bookingNumber)}`,
      { headers: headers(deps) },
    );
  } catch (err: any) {
    return { ok: false, code: 'wms_unavailable', error: err?.message || 'network_error' };
  }
  const text = await resp.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { /* ignore */ }

  if (resp.status === 404 || body?.code === 'reservation_not_found') {
    return {
      ok: false,
      code: 'wms_reservation_not_found',
      error: `Ingen WMS-reservation för bokning ${bookingNumber}`,
    };
  }
  if (!resp.ok) {
    return { ok: false, code: 'wms_unavailable', error: body?.error || `HTTP ${resp.status}` };
  }
  const reservationId = body?.data?.reservation?.id || body?.reservation?.id || null;
  if (!reservationId) {
    return { ok: false, code: 'wms_bad_response', error: 'Reservationssvar saknar id' };
  }
  const reservation = body?.data?.reservation ?? body?.reservation ?? null;
  return {
    ok: true,
    reservationId,
    externalId: bookingNumber,
    status: typeof reservation?.status === 'string' ? reservation.status : null,
    updatedAt: typeof reservation?.updated_at === 'string' ? reservation.updated_at : null,
    syncedAt: typeof reservation?.synced_at === 'string' ? reservation.synced_at : null,
  };
}

export interface WmsPackingRow {
  /** Stabil nyckel i packing_list_items.wms_line_id */
  wmsLineId: string;
  name: string;
  quantity: number;
  itemTypeId: string | null;
  sku: string | null;
  /** Paketnamn när raden är en paketkomponent. */
  packageName: string | null;
  productPackableDefault: boolean;
  bookingPackabilityOverride: boolean | null;
  warehousePackabilityOverride: boolean | null;
  isPackable: boolean;
  packabilitySource: 'product_default' | 'booking_override' | 'warehouse_override';
  packabilityRevision: number;
  packabilityUpdatedAt: string | null;
  packabilityUpdatedBy: string | null;
}

export interface PackabilitySnapshot {
  productPackableDefault: boolean;
  bookingPackabilityOverride: boolean | null;
  warehousePackabilityOverride: boolean | null;
  isPackable: boolean;
  packabilitySource: 'product_default' | 'booking_override' | 'warehouse_override';
  packabilityRevision: number;
  packabilityUpdatedAt: string | null;
  packabilityUpdatedBy: string | null;
}

const nullableBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

/**
 * Normalizes the additive WMS wire contract. Older WMS responses contain none
 * of these keys and therefore remain packable, preserving existing behaviour.
 */
export function normalizePackability(node: any, inherited?: any): PackabilitySnapshot {
  const productPackableDefault =
    typeof node?.product_packable_default === 'boolean'
      ? node.product_packable_default
      : typeof node?.is_packable_default === 'boolean'
        ? node.is_packable_default
        : typeof inherited?.product_packable_default === 'boolean'
          ? inherited.product_packable_default
          : true;
  const bookingPackabilityOverride = nullableBoolean(
    node?.booking_packability_override ?? inherited?.booking_packability_override,
  );
  const warehousePackabilityOverride = nullableBoolean(
    node?.warehouse_packability_override ?? inherited?.warehouse_packability_override,
  );
  const derivedSource = warehousePackabilityOverride !== null
    ? 'warehouse_override'
    : bookingPackabilityOverride !== null
      ? 'booking_override'
      : 'product_default';
  const source = ['product_default', 'booking_override', 'warehouse_override'].includes(
    String(node?.packability_source),
  )
    ? node.packability_source
    : derivedSource;
  const derivedEffective = warehousePackabilityOverride
    ?? bookingPackabilityOverride
    ?? productPackableDefault;
  const revision = Number(node?.packability_revision ?? inherited?.packability_revision ?? 1);
  return {
    productPackableDefault,
    bookingPackabilityOverride,
    warehousePackabilityOverride,
    isPackable: typeof node?.is_packable === 'boolean' ? node.is_packable : derivedEffective,
    packabilitySource: source,
    packabilityRevision: Number.isSafeInteger(revision) && revision > 0 ? revision : 1,
    packabilityUpdatedAt: typeof node?.packability_updated_at === 'string'
      ? node.packability_updated_at
      : typeof inherited?.packability_updated_at === 'string'
        ? inherited.packability_updated_at
        : null,
    packabilityUpdatedBy: typeof node?.packability_updated_by === 'string'
      ? node.packability_updated_by
      : typeof inherited?.packability_updated_by === 'string'
        ? inherited.packability_updated_by
        : null,
  };
}

/**
 * Plattar ut WMS-packlistans rader till fysiskt packbara rader.
 * Paketrubriker skapas ALDRIG som egna rader (skulle dubbelräknas i progress);
 * i stället speglas paketets komponenter med paketnamnet som kontext.
 */
export function flattenWmsPackingLines(body: any): WmsPackingRow[] {
  const lines: any[] = body?.lines || body?.data?.lines || [];
  const rows: WmsPackingRow[] = [];

  for (const line of lines) {
    const lineId = String(line?.line_id ?? line?.id ?? '');
    if (!lineId) continue;
    const components: any[] = Array.isArray(line?.components) ? line.components : [];

    if (line?.type === 'package' && components.length > 0) {
      const packageName = String(line?.name ?? 'Paket');
      for (const c of components) {
        const key = c?.item_type_id || c?.sku || c?.line_id || c?.id;
        if (!key) continue;
        const rawName = String(c?.name ?? c?.name_sv ?? packageName);
        // WMS ger ibland komponenten samma namn som paketet — särskilj med SKU
        // så att golvet ser vilken fysisk del raden gäller.
        const displayName = rawName === packageName && c?.sku ? `${rawName} (${c.sku})` : rawName;
        const packability = normalizePackability(c, line);
        rows.push({
          wmsLineId: `${lineId}::${key}`,
          name: displayName,
          quantity: Number(c?.required_qty ?? c?.quantity ?? 0) || 0,
          itemTypeId: c?.item_type_id ?? null,
          sku: c?.sku ?? null,
          packageName,
          ...packability,
        });
      }
      continue;
    }

    const packability = normalizePackability(line);
    rows.push({
      wmsLineId: lineId,
      name: String(line?.name ?? 'Okänd artikel'),
      quantity: Number(line?.required_qty ?? line?.quantity ?? 0) || 0,
      itemTypeId: line?.item_type_id ?? null,
      sku: line?.sku ?? null,
      packageName: null,
      ...packability,
    });
  }

  return rows.filter((r) => r.quantity > 0);
}

export interface ExistingPackingRow {
  id: string;
  wms_line_id: string | null;
  quantity_to_pack: number;
  quantity_packed: number | null;
  manual_name: string | null;
  excluded?: boolean | null;
  /**
   * Satt när raden exkluderats manuellt från Planning. WMS får ALDRIG
   * återställa (excluded=false) en sådan rad — bara Planning kan ångra.
   */
  planning_excluded_at?: string | null;
  source_booking_id?: string | null;
  booking_product_id?: string | null;
  booking_products?: { booking_id?: string | null } | null;
  product_packable_default?: boolean | null;
  booking_packability_override?: boolean | null;
  warehouse_packability_override?: boolean | null;
  is_packable?: boolean | null;
  packability_source?: string | null;
  packability_revision?: number | null;
  packability_updated_at?: string | null;
  packability_updated_by?: string | null;
}

export interface WmsSyncPlan {
  inserts: Array<Record<string, unknown>>;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
  /** Rader som inte längre finns i WMS och kan markeras excluded (inget packat). */
  staleIds: string[];
  /** Rader som försvunnit ur WMS men redan är packade — kräver mänsklig hantering. */
  conflictIds: string[];
}

/** Ren, testbar diff mellan WMS-sanningen och befintliga packrader. */
export function planWmsPackingSync(
  wmsRows: WmsPackingRow[],
  existing: ExistingPackingRow[],
  ctx: {
    packingId: string;
    organizationId: string;
    sourceBookingId: string;
    claimUnscopedLegacyRows?: boolean;
  },
): WmsSyncPlan {
  const belongsToBooking = (row: ExistingPackingRow) =>
    row.source_booking_id === ctx.sourceBookingId ||
    row.booking_products?.booking_id === ctx.sourceBookingId ||
    (
      ctx.claimUnscopedLegacyRows === true &&
      !row.source_booking_id
    );

  const byLineId = new Map<string, ExistingPackingRow>();
  for (const row of existing) {
    if (row.wms_line_id && belongsToBooking(row)) byLineId.set(row.wms_line_id, row);
  }

  const inserts: WmsSyncPlan['inserts'] = [];
  const updates: WmsSyncPlan['updates'] = [];
  const seen = new Set<string>();

  for (const row of wmsRows) {
    seen.add(row.wmsLineId);
    const name = row.packageName ? `${row.name}` : row.name;
    const notes = row.packageName ? `Ingår i paket: ${row.packageName}` : null;
    const existingRow = byLineId.get(row.wmsLineId);

    if (!existingRow) {
      inserts.push({
        packing_id: ctx.packingId,
        organization_id: ctx.organizationId,
        booking_product_id: null,
        source_booking_id: ctx.sourceBookingId,
        wms_line_id: row.wmsLineId,
        manual_name: name,
        notes,
        quantity_to_pack: row.quantity,
        quantity_packed: 0,
        excluded: false,
        wms_item_type_id: row.itemTypeId,
        wms_sku: row.sku,
        wms_identity_source: row.itemTypeId ? 'wms_reservation' : 'wms_reservation_sku_only',
        wms_identity_needs_repair: !row.itemTypeId,
        product_packable_default: row.productPackableDefault,
        booking_packability_override: row.bookingPackabilityOverride,
        warehouse_packability_override: row.warehousePackabilityOverride,
        is_packable: row.isPackable,
        packability_source: row.packabilitySource,
        packability_revision: row.packabilityRevision,
        packability_updated_at: row.packabilityUpdatedAt,
        packability_updated_by: row.packabilityUpdatedBy,
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (existingRow.quantity_to_pack !== row.quantity) patch.quantity_to_pack = row.quantity;
    if ((existingRow.manual_name || null) !== name) patch.manual_name = name;
    if ((existingRow.product_packable_default ?? true) !== row.productPackableDefault) {
      patch.product_packable_default = row.productPackableDefault;
    }
    if ((existingRow.booking_packability_override ?? null) !== row.bookingPackabilityOverride) {
      patch.booking_packability_override = row.bookingPackabilityOverride;
    }
    // A local warehouse override has the highest precedence and is preserved
    // until WMS returns the same/newer canonical revision.
    const incomingWins = row.packabilityRevision > (existingRow.packability_revision || 1);
    const warehouseOverride = incomingWins
      ? row.warehousePackabilityOverride
      : existingRow.warehouse_packability_override ?? row.warehousePackabilityOverride;
    const effective = warehouseOverride
      ?? row.bookingPackabilityOverride
      ?? row.productPackableDefault;
    const effectiveSource = warehouseOverride !== null
      ? 'warehouse_override'
      : row.bookingPackabilityOverride !== null
        ? 'booking_override'
        : 'product_default';
    if ((existingRow.is_packable ?? true) !== effective) patch.is_packable = effective;
    if ((existingRow.packability_source ?? 'product_default') !== effectiveSource) {
      patch.packability_source = effectiveSource;
    }
    if ((existingRow.packability_revision || 1) < row.packabilityRevision) {
      patch.packability_revision = row.packabilityRevision;
      patch.warehouse_packability_override = row.warehousePackabilityOverride;
      patch.packability_updated_at = row.packabilityUpdatedAt;
      patch.packability_updated_by = row.packabilityUpdatedBy;
    }
    // Planning-exkluderade rader återställs aldrig av WMS.
    if (existingRow.excluded && !existingRow.planning_excluded_at) patch.excluded = false;
    if (Object.keys(patch).length > 0) {
      // Aldrig skriva över packat arbete: minska aldrig under redan packat antal.
      if (typeof patch.quantity_to_pack === 'number') {
        const packed = existingRow.quantity_packed || 0;
        if ((patch.quantity_to_pack as number) < packed) delete patch.quantity_to_pack;
      }
      if (Object.keys(patch).length > 0) updates.push({ id: existingRow.id, patch });
    }
  }

  const staleIds: string[] = [];
  const conflictIds: string[] = [];
  for (const row of existing) {
    if (!belongsToBooking(row) || row.excluded) continue;
    if (row.wms_line_id && seen.has(row.wms_line_id)) continue;
    // Cutover rule: unscoped legacy Booking/Planning rows are stale once the
    // WMS snapshot for this booking has been resolved. Never delete packed work.
    if ((row.quantity_packed || 0) > 0) conflictIds.push(row.id);
    else staleIds.push(row.id);
  }

  return { inserts, updates, staleIds, conflictIds };
}

export interface WmsPackingSyncResult {
  ok: boolean;
  code?: WmsFailureCode | 'db_error';
  error?: string;
  reservationId?: string;
  inserted?: number;
  updated?: number;
  excluded?: number;
  conflicts?: number;
  total?: number;
}

/**
 * Speglar WMS-reservationens packlista till packing_list_items (idempotent).
 */
export async function syncPackingListFromWms(
  supabase: any,
  args: {
    packingId: string;
    organizationId: string;
    bookingNumber: string;
    sourceBookingId: string;
    apiKey: string;
    fetchImpl?: typeof fetch;
    baseUrl?: string;
  },
): Promise<WmsPackingSyncResult> {
  const deps: WmsCallDeps = {
    apiKey: args.apiKey,
    organizationId: args.organizationId,
    fetchImpl: args.fetchImpl,
    baseUrl: args.baseUrl,
  };

  const reservation = await resolveWmsReservation(args.bookingNumber, deps);
  if (!reservation.ok) {
    return { ok: false, code: reservation.code, error: reservation.error };
  }

  const f = args.fetchImpl || fetch;
  const base = args.baseUrl || WMS_BASE_URL;
  let body: any;
  try {
    const resp = await f(
      `${base}/get-packing-list?reservation_id=${encodeURIComponent(reservation.reservationId!)}`,
      { headers: headers(deps) },
    );
    const text = await resp.text();
    try { body = JSON.parse(text); } catch { body = null; }
    if (!resp.ok) {
      return {
        ok: false,
        code: 'wms_unavailable',
        error: body?.error || `HTTP ${resp.status}`,
        reservationId: reservation.reservationId,
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      code: 'wms_unavailable',
      error: err?.message || 'network_error',
      reservationId: reservation.reservationId,
    };
  }

  const wmsRows = flattenWmsPackingLines(body);
  const { data: existing, error: readErr } = await supabase
    .from('packing_list_items')
    .select('id, wms_line_id, quantity_to_pack, quantity_packed, manual_name, excluded, planning_excluded_at, source_booking_id, booking_product_id, product_packable_default, booking_packability_override, warehouse_packability_override, is_packable, packability_source, packability_revision, packability_updated_at, packability_updated_by, booking_products(booking_id)')
    .eq('packing_id', args.packingId)
    .eq('organization_id', args.organizationId);
  if (readErr) {
    return { ok: false, code: 'db_error', error: readErr.message, reservationId: reservation.reservationId };
  }

  const { count: linkedBookingCount } = await supabase
    .from('packing_project_bookings')
    .select('booking_id', { count: 'exact', head: true })
    .eq('packing_id', args.packingId);

  const plan = planWmsPackingSync(wmsRows, (existing || []) as ExistingPackingRow[], {
    packingId: args.packingId,
    organizationId: args.organizationId,
    sourceBookingId: args.sourceBookingId,
    // A single-booking packing owns every unscoped legacy row. Consolidated
    // packings are only allowed to claim rows that can be tied to this booking.
    claimUnscopedLegacyRows: (linkedBookingCount ?? 0) <= 1,
  });

  if (plan.inserts.length > 0) {
    const { error } = await supabase.from('packing_list_items').insert(plan.inserts);
    if (error) {
      return { ok: false, code: 'db_error', error: error.message, reservationId: reservation.reservationId };
    }
  }
  for (const u of plan.updates) {
    const { error } = await supabase
      .from('packing_list_items')
      .update(u.patch)
      .eq('id', u.id)
      .eq('organization_id', args.organizationId);
    if (error) {
      return { ok: false, code: 'db_error', error: error.message, reservationId: reservation.reservationId };
    }
  }
  if (plan.staleIds.length > 0) {
    await supabase
      .from('packing_list_items')
      .update({ excluded: true })
      .in('id', plan.staleIds)
      .eq('organization_id', args.organizationId);
  }

  return {
    ok: true,
    reservationId: reservation.reservationId,
    inserted: plan.inserts.length,
    updated: plan.updates.length,
    excluded: plan.staleIds.length,
    conflicts: plan.conflictIds.length,
    total: wmsRows.length,
  };
}


export interface WmsProjectProduct {
  syncKey: string;
  /** WMS identity for the parent reservation line, resolved to a local UUID during sync. */
  parentSyncKey: string | null;
  name: string;
  quantity: number;
  itemTypeId: string | null;
  packageId: string | null;
  sku: string | null;
  isPackageComponent: boolean;
  sortIndex: number;
  productPackableDefault: boolean;
  bookingPackabilityOverride: boolean | null;
  isPackable: boolean;
  packabilitySource: 'product_default' | 'booking_override' | 'warehouse_override';
  packabilityRevision: number;
  packabilityUpdatedAt: string | null;
  packabilityUpdatedBy: string | null;
}

/**
 * Project view projection. WMS is canonical, but Planning still needs the
 * presentation hierarchy: top-level reservation line -> accessories/package
 * components. The WMS line id is the stable identity for both parent and child.
 */
export function flattenWmsProjectProducts(body: any): WmsProjectProduct[] {
  const lines: any[] = body?.lines || body?.data?.lines || [];
  const rows: WmsProjectProduct[] = [];
  const childrenByParent = new Map<string, any[]>();
  const topLevelLines: any[] = [];
  const responseIndexByLine = new Map<any, number>();

  const sourceOrder = (line: any, fallback: number) => {
    const value = Number(line?.source_sort_index);
    return Number.isFinite(value) ? value : fallback;
  };

  for (const [responseIndex, line] of lines.entries()) {
    // Keep the response position only as a transition fallback. The durable
    // contract is source_sort_index stored and returned by WMS.
    responseIndexByLine.set(line, responseIndex);
    const parentLineId = String(line?.parent_line_id ?? '');
    if (line?.is_accessory || parentLineId) {
      if (parentLineId) {
        const children = childrenByParent.get(parentLineId) || [];
        children.push(line);
        childrenByParent.set(parentLineId, children);
      } else {
        // Never hide malformed/orphaned WMS demand.
        topLevelLines.push(line);
      }
    } else {
      topLevelLines.push(line);
    }
  }

  topLevelLines.sort((a, b) =>
    sourceOrder(a, responseIndexByLine.get(a) ?? 0) - sourceOrder(b, responseIndexByLine.get(b) ?? 0)
  );
  for (const children of childrenByParent.values()) {
    children.sort((a, b) =>
      sourceOrder(a, responseIndexByLine.get(a) ?? 0) - sourceOrder(b, responseIndexByLine.get(b) ?? 0)
    );
  }

  const packageCounts = new Map<string, number>();
  for (const line of topLevelLines) {
    if (line?.type === 'package' && line?.package_id) {
      const key = String(line.package_id);
      packageCounts.set(key, (packageCounts.get(key) || 0) + 1);
    }
  }
  const packageNumbers = new Map<string, number>();
  let sortIndex = 0;

  for (const line of topLevelLines) {
    const lineId = String(line?.line_id ?? line?.id ?? '');
    if (!lineId) continue;
    const quantity = Number(line?.quantity ?? line?.required_qty ?? 0) || 0;
    if (quantity <= 0) continue;

    const syncKey = `wms:${lineId}`;
    const packageId = line?.package_id ?? (line?.type === 'package' ? line?.id ?? null : null);
    let name = String(line?.source_display_name ?? line?.name ?? line?.name_sv ?? 'Okänd artikel');
    if (
      line?.type === 'package' &&
      packageId &&
      (packageCounts.get(String(packageId)) || 0) > 1 &&
      !/\(#\d+\)\s*$/.test(name)
    ) {
      const occurrence = (packageNumbers.get(String(packageId)) || 0) + 1;
      packageNumbers.set(String(packageId), occurrence);
      name = `${name} (#${occurrence})`;
    }

    const linePackability = normalizePackability(line);
    rows.push({
      syncKey,
      parentSyncKey: null,
      name,
      quantity,
      itemTypeId: line?.item_type_id ?? null,
      packageId,
      sku: line?.sku ?? null,
      isPackageComponent: false,
      sortIndex: sortIndex++,
      productPackableDefault: linePackability.productPackableDefault,
      bookingPackabilityOverride: linePackability.bookingPackabilityOverride,
      isPackable: linePackability.isPackable,
      packabilitySource: linePackability.packabilitySource,
      packabilityRevision: linePackability.packabilityRevision,
      packabilityUpdatedAt: linePackability.packabilityUpdatedAt,
      packabilityUpdatedBy: linePackability.packabilityUpdatedBy,
    });

    for (const accessory of childrenByParent.get(lineId) || []) {
      const childId = String(accessory?.line_id ?? accessory?.id ?? '');
      const childQuantity = Number(accessory?.quantity ?? accessory?.required_qty ?? 0) || 0;
      if (!childId || childQuantity <= 0) continue;
      const accessoryPackability = normalizePackability(accessory, line);
      rows.push({
        syncKey: `wms:${childId}`,
        parentSyncKey: syncKey,
        name: String(accessory?.source_display_name ?? accessory?.name ?? accessory?.name_sv ?? 'Okänt tillbehör'),
        quantity: childQuantity,
        itemTypeId: accessory?.item_type_id ?? null,
        packageId: null,
        sku: accessory?.sku ?? null,
        isPackageComponent: false,
        sortIndex: sortIndex++,
        productPackableDefault: accessoryPackability.productPackableDefault,
        bookingPackabilityOverride: accessoryPackability.bookingPackabilityOverride,
        isPackable: accessoryPackability.isPackable,
        packabilitySource: accessoryPackability.packabilitySource,
        packabilityRevision: accessoryPackability.packabilityRevision,
        packabilityUpdatedAt: accessoryPackability.packabilityUpdatedAt,
        packabilityUpdatedBy: accessoryPackability.packabilityUpdatedBy,
      });
    }

    if (line?.type === 'package' && Array.isArray(line?.components)) {
      const components = [...line.components].sort((a: any, b: any) =>
        sourceOrder(a, 0) - sourceOrder(b, 0)
      );
      for (const component of components) {
        const key = component?.item_type_id || component?.sku || component?.line_id || component?.id;
        const componentQuantity = Number(component?.required_qty ?? component?.quantity ?? 0) || 0;
        if (!key || componentQuantity <= 0) continue;
        const componentPackability = normalizePackability(component, line);
        rows.push({
          syncKey: `${syncKey}::${key}`,
          parentSyncKey: syncKey,
          name: String(component?.source_display_name ?? component?.name ?? component?.name_sv ?? component?.sku ?? 'Okänd paketdel'),
          quantity: componentQuantity,
          itemTypeId: component?.item_type_id ?? null,
          packageId,
          sku: component?.sku ?? null,
          isPackageComponent: true,
          sortIndex: sortIndex++,
          productPackableDefault: componentPackability.productPackableDefault,
          bookingPackabilityOverride: componentPackability.bookingPackabilityOverride,
          isPackable: componentPackability.isPackable,
          packabilitySource: componentPackability.packabilitySource,
          packabilityRevision: componentPackability.packabilityRevision,
          packabilityUpdatedAt: componentPackability.packabilityUpdatedAt,
          packabilityUpdatedBy: componentPackability.packabilityUpdatedBy,
        });
      }
    }
  }

  // Keep orphaned accessories visible even if WMS returned a broken parent id.
  const emittedLineIds = new Set(topLevelLines.map((line) => String(line?.line_id ?? line?.id ?? '')));
  for (const [parentLineId, orphaned] of childrenByParent) {
    if (emittedLineIds.has(parentLineId)) continue;
    for (const accessory of orphaned) {
      const childId = String(accessory?.line_id ?? accessory?.id ?? '');
      const quantity = Number(accessory?.quantity ?? accessory?.required_qty ?? 0) || 0;
      if (!childId || quantity <= 0) continue;
      const accessoryPackability = normalizePackability(accessory);
      rows.push({
        syncKey: `wms:${childId}`,
        parentSyncKey: null,
        name: String(accessory?.source_display_name ?? accessory?.name ?? accessory?.name_sv ?? 'Okänt tillbehör'),
        quantity,
        itemTypeId: accessory?.item_type_id ?? null,
        packageId: null,
        sku: accessory?.sku ?? null,
        isPackageComponent: false,
        sortIndex: sortIndex++,
        productPackableDefault: accessoryPackability.productPackableDefault,
        bookingPackabilityOverride: accessoryPackability.bookingPackabilityOverride,
        isPackable: accessoryPackability.isPackable,
        packabilitySource: accessoryPackability.packabilitySource,
        packabilityRevision: accessoryPackability.packabilityRevision,
        packabilityUpdatedAt: accessoryPackability.packabilityUpdatedAt,
        packabilityUpdatedBy: accessoryPackability.packabilityUpdatedBy,
      });
    }
  }

  return rows;
}

async function fetchWmsPackingBody(
  bookingNumber: string,
  deps: WmsCallDeps,
): Promise<{ ok: boolean; body?: any; reservationId?: string; code?: WmsFailureCode; error?: string }> {
  const reservation = await resolveWmsReservation(bookingNumber, deps);
  if (!reservation.ok) return reservation;
  const f = deps.fetchImpl || fetch;
  const base = deps.baseUrl || WMS_BASE_URL;
  try {
    const resp = await f(
      `${base}/get-packing-list?reservation_id=${encodeURIComponent(reservation.reservationId!)}`,
      { headers: headers(deps) },
    );
    const text = await resp.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* handled below */ }
    if (!resp.ok) {
      return {
        ok: false,
        code: 'wms_unavailable',
        error: body?.error || `HTTP ${resp.status}`,
        reservationId: reservation.reservationId,
      };
    }
    if (!body) {
      return {
        ok: false,
        code: 'wms_bad_response',
        error: 'WMS packlista kunde inte tolkas',
        reservationId: reservation.reservationId,
      };
    }
    return { ok: true, body, reservationId: reservation.reservationId };
  } catch (err: any) {
    return {
      ok: false,
      code: 'wms_unavailable',
      error: err?.message || 'network_error',
      reservationId: reservation.reservationId,
    };
  }
}

/**
 * Mirrors WMS order-level reservation lines into Planning's read projection.
 * Existing src:/cmp:/legacy rows are soft-retired only after a complete,
 * non-empty WMS snapshot has been obtained. Stable wms:<line_id> keys make the
 * operation idempotent and prevent add-without-remove partial imports.
 */
export async function syncBookingProductsFromWms(
  supabase: any,
  args: {
    bookingId: string;
    organizationId: string;
    bookingNumber: string;
    apiKey: string;
    fetchImpl?: typeof fetch;
    baseUrl?: string;
  },
): Promise<{ ok: boolean; code?: WmsFailureCode | 'db_error'; error?: string; total?: number; inserted?: number; updated?: number; retired?: number; reservationId?: string }> {
  const snapshot = await fetchWmsPackingBody(args.bookingNumber, {
    apiKey: args.apiKey,
    organizationId: args.organizationId,
    fetchImpl: args.fetchImpl,
    baseUrl: args.baseUrl,
  });
  if (!snapshot.ok) return snapshot as any;

  const products = flattenWmsProjectProducts(snapshot.body);
  const { data: existing, error: readError } = await supabase
    .from('booking_products')
    .select('id, sync_key, name, quantity, sku, inventory_item_type_id, inventory_package_id, parent_product_id, is_package_component, sort_index, source_missing_since, product_packable_default, packability_override, is_packable, packability_source, packability_revision, packability_updated_at, packability_updated_by')
    .eq('booking_id', args.bookingId)
    .eq('organization_id', args.organizationId);
  if (readError) {
    return { ok: false, code: 'db_error', error: readError.message, reservationId: snapshot.reservationId };
  }

  const currentByKey = new Map<string, any>();
  for (const row of existing || []) {
    if (row.sync_key?.startsWith('wms:')) currentByKey.set(row.sync_key, row);
  }

  const seen = new Set<string>();
  const localIdBySyncKey = new Map<string, string>();
  for (const [syncKey, row] of currentByKey) localIdBySyncKey.set(syncKey, row.id);
  let inserted = 0;
  let updated = 0;
  for (const product of products) {
    seen.add(product.syncKey);
    const row = currentByKey.get(product.syncKey);
    const localId = row?.id ?? crypto.randomUUID();
    localIdBySyncKey.set(product.syncKey, localId);
    const parentProductId = product.parentSyncKey
      ? localIdBySyncKey.get(product.parentSyncKey) ?? null
      : null;
    const patch = {
      name: product.name,
      quantity: product.quantity,
      sku: product.sku,
      inventory_item_type_id: product.itemTypeId,
      inventory_package_id: product.packageId,
      is_package_component: product.isPackageComponent,
      parent_product_id: parentProductId,
      parent_package_id: null,
      sort_index: product.sortIndex,
      source_missing_since: null,
      product_packable_default: product.productPackableDefault,
      packability_override: product.bookingPackabilityOverride,
      is_packable: product.isPackable,
      packability_source: product.packabilitySource,
      packability_revision: product.packabilityRevision,
      packability_updated_at: product.packabilityUpdatedAt,
      packability_updated_by: product.packabilityUpdatedBy,
    };
    if (row) {
      const { error } = await supabase
        .from('booking_products')
        .update(patch)
        .eq('id', row.id)
        .eq('organization_id', args.organizationId);
      if (error) return { ok: false, code: 'db_error', error: error.message, reservationId: snapshot.reservationId };
      updated++;
    } else {
      const { error } = await supabase.from('booking_products').insert({
        id: localId,
        booking_id: args.bookingId,
        organization_id: args.organizationId,
        sync_key: product.syncKey,
        ...patch,
      });
      if (error) return { ok: false, code: 'db_error', error: error.message, reservationId: snapshot.reservationId };
      inserted++;
    }
  }

  const staleIds = (existing || [])
    .filter((row: any) => !row.source_missing_since && !seen.has(row.sync_key || ''))
    .map((row: any) => row.id);
  if (staleIds.length > 0) {
    const { error } = await supabase
      .from('booking_products')
      .update({ source_missing_since: new Date().toISOString() })
      .in('id', staleIds)
      .eq('organization_id', args.organizationId);
    if (error) return { ok: false, code: 'db_error', error: error.message, reservationId: snapshot.reservationId };
  }

  return {
    ok: true,
    reservationId: snapshot.reservationId,
    total: products.length,
    inserted,
    updated,
    retired: staleIds.length,
  };
}

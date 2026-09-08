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
  return { ok: true, reservationId, externalId: bookingNumber };
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
        rows.push({
          wmsLineId: `${lineId}::${key}`,
          name: String(c?.name ?? packageName),
          quantity: Number(c?.required_qty ?? c?.quantity ?? 0) || 0,
          itemTypeId: c?.item_type_id ?? null,
          sku: c?.sku ?? null,
          packageName,
        });
      }
      continue;
    }

    rows.push({
      wmsLineId: lineId,
      name: String(line?.name ?? 'Okänd artikel'),
      quantity: Number(line?.required_qty ?? line?.quantity ?? 0) || 0,
      itemTypeId: line?.item_type_id ?? null,
      sku: line?.sku ?? null,
      packageName: null,
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
  ctx: { packingId: string; organizationId: string },
): WmsSyncPlan {
  const byLineId = new Map<string, ExistingPackingRow>();
  for (const row of existing) {
    if (row.wms_line_id) byLineId.set(row.wms_line_id, row);
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
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (existingRow.quantity_to_pack !== row.quantity) patch.quantity_to_pack = row.quantity;
    if ((existingRow.manual_name || null) !== name) patch.manual_name = name;
    if (existingRow.excluded) patch.excluded = false;
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
    if (!row.wms_line_id || seen.has(row.wms_line_id) || row.excluded) continue;
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
  if (wmsRows.length === 0) {
    return {
      ok: false,
      code: 'wms_bad_response',
      error: 'WMS-reservationen har inga packbara rader',
      reservationId: reservation.reservationId,
    };
  }

  const { data: existing, error: readErr } = await supabase
    .from('packing_list_items')
    .select('id, wms_line_id, quantity_to_pack, quantity_packed, manual_name, excluded')
    .eq('packing_id', args.packingId)
    .eq('organization_id', args.organizationId);
  if (readErr) {
    return { ok: false, code: 'db_error', error: readErr.message, reservationId: reservation.reservationId };
  }

  const plan = planWmsPackingSync(wmsRows, (existing || []) as ExistingPackingRow[], {
    packingId: args.packingId,
    organizationId: args.organizationId,
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

// @ts-nocheck
/**
 * packingRepair — gemensam, explicit reparation av saknade packrader.
 *
 * SÄKERHETSREGLER:
 * - Endast packningar med status `planning` eller `in_progress` får repareras.
 *   Frysta/avslutade packögonblicksbilder skrivs ALDRIG om.
 * - Endast SAKNADE rader skapas. Befintliga rader (antal, packat, kolli)
 *   rörs aldrig — funktionen är idempotent.
 * - Inga rader raderas.
 *
 * KÄLLORDNING (kanonisk):
 *   1. Lagersystemets reservation (WMS) — sanningen för vad som ska packas.
 *   2. Om WMS inte kan leverera (schemafel, otillgänglig, saknad konfiguration)
 *      fylls endast SAKNADE rader på additivt från aktiva booking_products.
 *      Felet loggas alltid; WMS förblir förstahandskälla vid nästa körning.
 */

import { syncPackingListFromWms } from './wmsPackingList.ts';
import { ensureMissingPackingRowsFromBookingProducts } from './packingFailSafe.ts';

export const REPAIRABLE_PACKING_STATUSES = ['planning', 'in_progress'] as const;


export interface PackingRepairResult {
  ok: boolean;
  code?:
    | 'packing_not_found'
    | 'no_booking'
    | 'status_frozen'
    | 'insert_failed'
    | 'wms_not_configured'
    | 'wms_unavailable'
    | 'wms_bad_response'
    | 'source_empty'
    | 'db_error';
  error?: string;
  inserted?: number;
  updated?: number;
  total?: number;
  status?: string;
  /** 'wms' när raderna speglades från lagersystemets reservation. */
  source?: 'wms' | 'booking_products';
  reservationId?: string;
  conflicts?: number;
}


export async function repairPackingItems(
  supabase: any,
  packingId: string,
  organizationId: string,
): Promise<PackingRepairResult> {
  const { data: packing, error: packErr } = await supabase
    .from('packing_projects')
    .select('id, booking_id, status')
    .eq('id', packingId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (packErr || !packing) {
    return { ok: false, code: 'packing_not_found', error: 'Packningen hittades inte' };
  }
  if (!packing.booking_id) {
    return {
      ok: false,
      code: 'no_booking',
      error: 'Packningen saknar bokning – kan inte repareras automatiskt',
    };
  }
  if (!REPAIRABLE_PACKING_STATUSES.includes(packing.status)) {
    return {
      ok: false,
      code: 'status_frozen',
      status: packing.status,
      error: `Packningen har status ${packing.status} och får inte skrivas om`,
    };
  }

  // ── 1) WMS-reservationen är kanonisk källa ──────────────────────────────
  const apiKey = (globalThis as any)?.Deno?.env?.get?.('PRICELIST_API_KEY') || '';
  const { data: bookingRow, error: bookingError } = await supabase
    .from('bookings')
    .select('booking_number')
    .eq('id', packing.booking_id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (bookingError) {
    return { ok: false, code: 'db_error', error: bookingError.message || String(bookingError) };
  }
  if (!bookingRow) {
    return {
      ok: false,
      code: 'db_error',
      error: 'Bokningskällan hittades inte för packningen',
    };
  }
  const bookingNumber = (bookingRow as any)?.booking_number || null;

  if (apiKey && bookingNumber) {
    const wms = await syncPackingListFromWms(supabase, {
      packingId,
      organizationId,
      bookingNumber,
      sourceBookingId: packing.booking_id,
      apiKey,
    });
    if (wms.ok) {
      return {
        ok: true,
        source: 'wms',
        reservationId: wms.reservationId,
        inserted: wms.inserted || 0,
        updated: wms.updated || 0,
        conflicts: wms.conflicts || 0,
        total: wms.total || 0,
        status: packing.status,
      };
    }
    // WMS förblir förstahandskälla, men ett WMS-fel (schema/otillgänglighet)
    // får aldrig lämna en bekräftad bokning helt utan lagerrader. Vi faller
    // tillbaka på en additiv påfyllning från aktiva booking_products.
    console.error(
      `[packingRepair] WMS-projektionen misslyckades för packning ${packingId}: ${wms.code}:${wms.error}`,
    );
  }

  // ── 2) Fail-safe: additiv påfyllning från aktiva booking_products ────────
  const [productsResult, existingItemsResult] = await Promise.all([
    supabase
      .from('booking_products')
      .select('id, name, quantity, parent_product_id, sku, inventory_item_type_id, source_missing_since')
      .eq('booking_id', packing.booking_id)
      .eq('organization_id', organizationId),
    supabase
      .from('packing_list_items')
      .select('id, booking_product_id')
      .eq('packing_id', packingId)
      .eq('organization_id', organizationId),
  ]);
  if (productsResult.error) {
    return {
      ok: false,
      code: 'db_error',
      error: productsResult.error.message || String(productsResult.error),
    };
  }
  if (existingItemsResult.error) {
    return {
      ok: false,
      code: 'db_error',
      error: existingItemsResult.error.message || String(existingItemsResult.error),
    };
  }
  const active = (productsResult.data || []).filter((p: any) => !p.source_missing_since);
  const parentIds = new Set(
    active.filter((p: any) => p.parent_product_id).map((p: any) => p.parent_product_id),
  );
  if (active.filter((p: any) => !parentIds.has(p.id)).length === 0) {
    return {
      ok: false,
      code: 'source_empty',
      error: 'Bokningen saknar aktiva packbara produktrader',
      status: packing.status,
    };
  }

  const failSafe = await ensureMissingPackingRowsFromBookingProducts(supabase, {
    packingId,
    bookingId: packing.booking_id,
    organizationId,
  });
  if (!failSafe.ok) {
    return { ok: false, code: 'insert_failed', error: failSafe.error, status: packing.status };
  }

  return {
    ok: true,
    source: 'booking_products',
    inserted: failSafe.inserted || 0,
    total: failSafe.total || 0,
    status: packing.status,
  };
}


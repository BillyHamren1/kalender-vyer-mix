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
 */

export const REPAIRABLE_PACKING_STATUSES = ['planning', 'in_progress'] as const;

export interface PackingRepairResult {
  ok: boolean;
  code?:
    | 'packing_not_found'
    | 'no_booking'
    | 'status_frozen'
    | 'insert_failed';
  error?: string;
  inserted?: number;
  total?: number;
  status?: string;
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

  const [{ data: products }, { data: existingItems }] = await Promise.all([
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

  // Samma packable-filter som sync-booking-to-packing:
  // aktiva rader, paketrubriker (rader som är förälder åt andra rader) exkluderas.
  const active = (products || []).filter((p: any) => !p.source_missing_since);
  const parentIds = new Set(
    active.filter((p: any) => p.parent_product_id).map((p: any) => p.parent_product_id),
  );
  const packable = active.filter((p: any) => !parentIds.has(p.id));
  const existingProductIds = new Set((existingItems || []).map((i: any) => i.booking_product_id));

  const toInsert = packable
    .filter((p: any) => !existingProductIds.has(p.id))
    .map((p: any) => ({
      packing_id: packingId,
      booking_product_id: p.id,
      quantity_to_pack: p.quantity ?? 1,
      quantity_packed: 0,
      organization_id: organizationId,
      wms_item_type_id: p.inventory_item_type_id || null,
      wms_sku: p.sku || null,
      wms_identity_source: p.inventory_item_type_id
        ? 'booking_item_type_id'
        : (p.sku ? 'booking_sku_legacy' : 'missing'),
      wms_identity_needs_repair: !p.inventory_item_type_id,
    }));

  const existingCount = (existingItems || []).length;

  if (toInsert.length === 0) {
    return { ok: true, inserted: 0, total: existingCount, status: packing.status };
  }

  const { error: insertError } = await supabase.from('packing_list_items').insert(toInsert);
  if (insertError) {
    return { ok: false, code: 'insert_failed', error: insertError.message };
  }

  // Pending "item_added"-kvittenser för rader vi just skapat är inte längre relevanta.
  const insertedProductIds = toInsert.map((i: any) => i.booking_product_id);
  await supabase
    .from('packing_change_requests')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('packing_id', packingId)
    .eq('status', 'pending')
    .eq('change_type', 'item_added')
    .in('booking_product_id', insertedProductIds);

  return {
    ok: true,
    inserted: toInsert.length,
    total: existingCount + toInsert.length,
    status: packing.status,
  };
}

// @ts-nocheck
/**
 * packingFailSafe — additiv, idempotent påfyllning av saknade lagerrader.
 *
 * Används ENDAST när WMS-projektionen inte kan köras (schemafel, otillgänglig
 * reservation, saknad konfiguration). WMS förblir förstahandskälla.
 *
 * SÄKERHETSREGLER:
 * - Skapar endast SAKNADE rader. Inga deletes och ingen ändring av
 *   quantity_packed eller kolli.
 * - Uppdaterar enbart packbarhetsmetadata på befintliga AKTIVA rader när
 *   Booking-källans explicita klassning ändras. Lageroverride har alltid
 *   företräde och historiskt frysta rader lämnas orörda.
 * - Historiskt utfasade rader (excluded=true) återupplivas aldrig; de räknas
 *   som befintliga och skapas därför inte om.
 * - is_packable följer med från booking_products men filtrerar aldrig bort
 *   rader — packbarhet är en presentations-/operationsregel i Lager.
 */

export interface PackingFailSafeResult {
  ok: boolean;
  code?: 'db_error';
  error?: string;
  inserted?: number;
  updated?: number;
  total?: number;
}

export async function ensureMissingPackingRowsFromBookingProducts(
  supabase: any,
  args: { packingId: string; bookingId: string; organizationId: string },
): Promise<PackingFailSafeResult> {
  const { packingId, bookingId, organizationId } = args;

  const [productsResult, existingResult] = await Promise.all([
    supabase
      .from('booking_products')
      .select(
        'id, name, quantity, parent_product_id, is_package_component, sku, sync_key, inventory_item_type_id, source_missing_since, is_packable, product_packable_default, packability_override, packability_source, packability_revision',
      )
      .eq('booking_id', bookingId)
      .eq('organization_id', organizationId),
    supabase
      .from('packing_list_items')
      .select('id, booking_product_id, wms_line_id, manual_name, notes, excluded, planning_excluded_at, product_packable_default, booking_packability_override, warehouse_packability_override, is_packable, packability_source, packability_revision')
      .eq('packing_id', packingId)
      .eq('organization_id', organizationId),
  ]);

  if (productsResult.error) {
    return { ok: false, code: 'db_error', error: productsResult.error.message || String(productsResult.error) };
  }
  if (existingResult.error) {
    return { ok: false, code: 'db_error', error: existingResult.error.message || String(existingResult.error) };
  }

  const products = productsResult.data || [];
  const existing = existingResult.data || [];

  const active = products.filter((p: any) => !p.source_missing_since);
  // Paketrubriker (rader som är förälder åt andra rader) är inga fysiska kollin.
  const parentIds = new Set(
    active.filter((p: any) => p.parent_product_id).map((p: any) => p.parent_product_id),
  );
  const candidates = active.filter((p: any) => !parentIds.has(p.id));

  const existingProductIds = new Set(existing.map((row: any) => row.booking_product_id).filter(Boolean));
  const existingLineIds = new Set(existing.map((row: any) => row.wms_line_id).filter(Boolean));
  const existingByProductId = new Map(
    existing
      .filter((row: any) => row.booking_product_id)
      .map((row: any) => [row.booking_product_id, row]),
  );
  const existingByLineId = new Map(
    existing.filter((row: any) => row.wms_line_id).map((row: any) => [row.wms_line_id, row]),
  );
  const productNamesById = new Map(active.map((product: any) => [product.id, product.name]));

  // Packbarhet är källmetadata, inte plockutfall. Den får därför läkas på en
  // befintlig aktiv rad utan att röra antal, kolli eller skanningsstatus.
  const toUpdate = candidates.flatMap((p: any) => {
    const syncKey: string = p.sync_key || '';
    const row: any = existingByProductId.get(p.id)
      || (syncKey.startsWith('wms:') ? existingByLineId.get(syncKey.slice(4)) : null);
    if (!row || row.excluded === true || row.planning_excluded_at) return [];

    const productDefault = p.product_packable_default ?? true;
    const bookingOverride = typeof p.packability_override === 'boolean'
      ? p.packability_override
      : null;
    const sourceEffective = typeof p.is_packable === 'boolean'
      ? p.is_packable
      : (bookingOverride ?? productDefault);
    const warehouseOverride = typeof row.warehouse_packability_override === 'boolean'
      ? row.warehouse_packability_override
      : null;
    const effective = warehouseOverride ?? sourceEffective;
    const source = warehouseOverride !== null
      ? 'warehouse_override'
      : (p.packability_source ?? (bookingOverride !== null ? 'booking_override' : 'product_default'));
    const parentName = p.parent_product_id ? productNamesById.get(p.parent_product_id) : null;
    const hierarchyNote = parentName
      ? p.is_package_component === true
        ? `Paketmedlem i: ${parentName}`
        : `Tillbehör till paket: ${parentName}`
      : null;

    const values: Record<string, unknown> = {};
    if (row.product_packable_default !== productDefault) values.product_packable_default = productDefault;
    if (row.booking_packability_override !== bookingOverride) values.booking_packability_override = bookingOverride;
    if (row.is_packable !== effective) values.is_packable = effective;
    if (row.packability_source !== source) values.packability_source = source;
    if (hierarchyNote && row.notes !== hierarchyNote) values.notes = hierarchyNote;
    if (!row.manual_name && p.name) values.manual_name = p.name;

    if (Object.keys(values).length === 0) return [];

    return [{
      id: row.id,
      values: {
        ...values,
        packability_revision: Math.max(
          Number(row.packability_revision ?? 0) + 1,
          Number(p.packability_revision ?? 1),
        ),
      },
    }];
  });

  for (const update of toUpdate) {
    const { error: updateError } = await supabase
      .from('packing_list_items')
      .update(update.values)
      .eq('id', update.id)
      .eq('packing_id', packingId)
      .eq('organization_id', organizationId);
    if (updateError) {
      return { ok: false, code: 'db_error', error: updateError.message || String(updateError) };
    }
  }

  const toInsert = candidates
    .filter((p: any) => {
      if (existingProductIds.has(p.id)) return false;
      const syncKey: string = p.sync_key || '';
      if (syncKey.startsWith('wms:') && existingLineIds.has(syncKey.slice(4))) return false;
      return true;
    })
    .map((p: any) => {
      const syncKey: string = p.sync_key || '';
      return {
        packing_id: packingId,
        organization_id: organizationId,
        source_booking_id: bookingId,
        booking_product_id: p.id,
        quantity_to_pack: p.quantity ?? 1,
        quantity_packed: 0,
        excluded: false,
        is_packable: p.is_packable ?? true,
        product_packable_default: p.product_packable_default ?? true,
        packability_source: p.packability_source ?? 'product_default',
        packability_revision: p.packability_revision ?? 1,
        wms_line_id: syncKey.startsWith('wms:') ? syncKey.slice(4) : null,
        wms_item_type_id: p.inventory_item_type_id || null,
        wms_sku: p.sku || null,
        wms_identity_source: syncKey.startsWith('wms:')
          ? 'wms_reservation'
          : (p.inventory_item_type_id ? 'booking_item_type_id' : (p.sku ? 'booking_sku_legacy' : 'missing')),
        wms_identity_needs_repair: !syncKey.startsWith('wms:'),
        manual_name: p.name || null,
        notes: p.parent_product_id
          ? p.is_package_component === true
            ? `Paketmedlem i: ${productNamesById.get(p.parent_product_id) || 'Okänt paket'}`
            : `Tillbehör till paket: ${productNamesById.get(p.parent_product_id) || 'Okänt paket'}`
          : null,
      };
    });

  if (toInsert.length === 0) {
    return { ok: true, inserted: 0, updated: toUpdate.length, total: existing.length };
  }

  const { error: insertError } = await supabase.from('packing_list_items').insert(toInsert);
  if (insertError) {
    return { ok: false, code: 'db_error', error: insertError.message || String(insertError) };
  }

  return {
    ok: true,
    inserted: toInsert.length,
    updated: toUpdate.length,
    total: existing.length + toInsert.length,
  };
}
